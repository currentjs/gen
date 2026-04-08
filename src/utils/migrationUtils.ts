import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AggregateConfig, AggregateFieldConfig, IdentifierType } from '../types/configTypes';
import { parseFieldType } from './typeUtils';

export interface SchemaState {
  aggregates: Record<string, AggregateConfig>;
  version: string;
  timestamp: string;
}

export interface MigrationLog {
  appliedMigrations: string[];
}

export interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

export interface ForeignKeyInfo {
  CONSTRAINT_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}

const TYPE_MAPPING: Record<string, string> = {
  string: 'VARCHAR(255)',
  number: 'INT',
  integer: 'INT',
  decimal: 'DECIMAL(10,2)',
  boolean: 'TINYINT(1)',
  datetime: 'DATETIME',
  date: 'DATETIME',
  id: 'INT',
  json: 'JSON',
  array: 'JSON',
  object: 'JSON'
};

export function getIdColumnDefinition(idType: IdentifierType = 'numeric'): string {
  switch (idType) {
    case 'uuid':   return 'id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID(), 1))';
    case 'nanoid': return 'id VARCHAR(21) PRIMARY KEY';
    default:       return 'id INT AUTO_INCREMENT PRIMARY KEY';
  }
}

export function getFkColumnType(idType: IdentifierType = 'numeric'): string {
  switch (idType) {
    case 'uuid':   return 'BINARY(16)';
    case 'nanoid': return 'VARCHAR(21)';
    default:       return 'INT';
  }
}

export function mapYamlTypeToSql(yamlType: string, availableAggregates: Set<string>, availableValueObjects?: Set<string>, identifiers: IdentifierType = 'numeric'): string {
  // Simple aggregate reference → foreign key column matching PK type
  if (availableAggregates.has(yamlType)) {
    return getFkColumnType(identifiers);
  }

  // Compound types: array ("Foo[]") or union ("Foo | Bar") → JSON column
  const parsed = parseFieldType(yamlType);
  if (parsed.isArray || parsed.isUnion) {
    return 'JSON';
  }

  // Named value object → stored as JSON
  if (availableValueObjects && availableValueObjects.has(yamlType)) {
    return 'JSON';
  }

  return TYPE_MAPPING[yamlType] || 'VARCHAR(255)';
}

/** Table name matches the store convention: singular lowercase aggregate name. */
export function getTableName(aggregateName: string): string {
  return aggregateName.toLowerCase();
}

export function getForeignKeyFieldName(fieldName: string): string {
  return fieldName + 'Id';
}

export function isRelationshipField(fieldType: string, availableAggregates: Set<string>): boolean {
  return availableAggregates.has(fieldType);
}

/**
 * Build a map of child entity name → parent entity name from the aggregates config.
 * Used to determine parent ID column names for child entity tables.
 */
export function buildChildToParentMap(aggregates: Record<string, AggregateConfig>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [parentName, config] of Object.entries(aggregates)) {
    for (const childName of (config.entities || [])) {
      map.set(childName, parentName);
    }
  }
  return map;
}

export function generateCreateTableSQL(
  name: string,
  aggregate: AggregateConfig,
  availableAggregates: Set<string>,
  availableValueObjects?: Set<string>,
  parentIdField?: string,
  identifiers: IdentifierType = 'numeric'
): string {
  const tableName = getTableName(name);
  const columns: string[] = [];
  const indexes: string[] = [];
  const foreignKeys: string[] = [];
  const fkType = getFkColumnType(identifiers);

  columns.push(`  ${getIdColumnDefinition(identifiers)}`);

  // Root aggregates get an ownerId column; child entities get a parent ID column.
  if (parentIdField) {
    columns.push(`  ${parentIdField} ${fkType} NOT NULL`);
    indexes.push(`  INDEX idx_${tableName}_${parentIdField} (${parentIdField})`);
  } else if (aggregate.root !== false) {
    columns.push(`  ownerId ${fkType} NOT NULL`);
    indexes.push(`  INDEX idx_${tableName}_ownerId (ownerId)`);
  }

  for (const [fieldName, field] of Object.entries(aggregate.fields)) {
    if (isRelationshipField(field.type, availableAggregates)) {
      const foreignKeyName = getForeignKeyFieldName(fieldName);
      const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
      columns.push(`  ${foreignKeyName} ${fkType} ${nullable}`);
      indexes.push(`  INDEX idx_${tableName}_${foreignKeyName} (${foreignKeyName})`);
      const refTableName = getTableName(field.type);
      foreignKeys.push(
        `  CONSTRAINT fk_${tableName}_${foreignKeyName} \n` +
        `    FOREIGN KEY (${foreignKeyName}) \n` +
        `    REFERENCES ${refTableName}(id) \n` +
        `    ON DELETE RESTRICT \n` +
        `    ON UPDATE CASCADE`
      );
    } else {
      const sqlType = mapYamlTypeToSql(field.type, availableAggregates, availableValueObjects, identifiers);
      const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
      columns.push(`  ${fieldName} ${sqlType} ${nullable}`);
      if (['string', 'number', 'integer', 'id'].includes(field.type)) {
        indexes.push(`  INDEX idx_${tableName}_${fieldName} (${fieldName})`);
      }
    }
  }

  columns.push('  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  columns.push('  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  columns.push('  deletedAt DATETIME NULL DEFAULT NULL');

  indexes.push(`  INDEX idx_${tableName}_deletedAt (deletedAt)`);
  indexes.push(`  INDEX idx_${tableName}_createdAt (createdAt)`);

  const allParts = [...columns, ...indexes, ...foreignKeys];
  return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${allParts.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

export function generateDropTableSQL(tableName: string): string {
  return `DROP TABLE IF EXISTS \`${tableName}\`;`;
}

export function generateAddColumnSQL(
  tableName: string,
  fieldName: string,
  field: AggregateFieldConfig,
  availableAggregates: Set<string>,
  availableValueObjects?: Set<string>,
  identifiers: IdentifierType = 'numeric'
): string {
  if (isRelationshipField(field.type, availableAggregates)) {
    const foreignKeyName = getForeignKeyFieldName(fieldName);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE \`${tableName}\` ADD COLUMN \`${foreignKeyName}\` ${getFkColumnType(identifiers)} ${nullable};`;
  } else {
    const sqlType = mapYamlTypeToSql(field.type, availableAggregates, availableValueObjects, identifiers);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE \`${tableName}\` ADD COLUMN \`${fieldName}\` ${sqlType} ${nullable};`;
  }
}

export function generateDropColumnSQL(tableName: string, columnName: string): string {
  return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
}

export function generateModifyColumnSQL(
  tableName: string,
  fieldName: string,
  field: AggregateFieldConfig,
  availableAggregates: Set<string>,
  availableValueObjects?: Set<string>,
  identifiers: IdentifierType = 'numeric'
): string {
  if (isRelationshipField(field.type, availableAggregates)) {
    const foreignKeyName = getForeignKeyFieldName(fieldName);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${foreignKeyName}\` ${getFkColumnType(identifiers)} ${nullable};`;
  } else {
    const sqlType = mapYamlTypeToSql(field.type, availableAggregates, availableValueObjects, identifiers);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${fieldName}\` ${sqlType} ${nullable};`;
  }
}

export function loadSchemaState(stateFilePath: string): SchemaState | null {
  if (!fs.existsSync(stateFilePath)) {
    return null;
  }
  const content = fs.readFileSync(stateFilePath, 'utf8');
  return parseYaml(content) as SchemaState;
}

export function saveSchemaState(stateFilePath: string, state: SchemaState): void {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, stringifyYaml(state));
}

export function loadMigrationLog(logFilePath: string): MigrationLog {
  if (!fs.existsSync(logFilePath)) {
    return { appliedMigrations: [] };
  }
  const content = fs.readFileSync(logFilePath, 'utf8');
  return JSON.parse(content) as MigrationLog;
}

export function saveMigrationLog(logFilePath: string, log: MigrationLog): void {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  fs.writeFileSync(logFilePath, JSON.stringify(log, null, 2));
}

function sortAggregatesByDependencies(aggregates: Record<string, AggregateConfig>, availableAggregates: Set<string>): [string, AggregateConfig][] {
  const sorted: [string, AggregateConfig][] = [];
  const processed = new Set<string>();

  const addAggregate = (name: string, aggregate: AggregateConfig) => {
    if (processed.has(name)) return;

    for (const [, field] of Object.entries(aggregate.fields)) {
      if (isRelationshipField(field.type, availableAggregates)) {
        const dep = aggregates[field.type];
        if (dep && !processed.has(field.type)) {
          addAggregate(field.type, dep);
        }
      }
    }

    sorted.push([name, aggregate]);
    processed.add(name);
  };

  for (const [name, aggregate] of Object.entries(aggregates)) {
    addAggregate(name, aggregate);
  }

  return sorted;
}

export function compareSchemas(
  oldState: SchemaState | null,
  newAggregates: Record<string, AggregateConfig>,
  availableValueObjects?: Set<string>,
  identifiers: IdentifierType = 'numeric'
): string[] {
  const sqlStatements: string[] = [];
  const availableAggregates = new Set(Object.keys(newAggregates));
  const childToParent = buildChildToParentMap(newAggregates);

  if (!oldState || !oldState.aggregates || Object.keys(oldState.aggregates).length === 0) {
    const sorted = sortAggregatesByDependencies(newAggregates, availableAggregates);
    for (const [name, aggregate] of sorted) {
      const tableName = getTableName(name);
      const parentName = childToParent.get(name);
      const parentIdField = parentName ? `${parentName.toLowerCase()}Id` : undefined;
      sqlStatements.push(`-- Create ${tableName} table`);
      sqlStatements.push(generateCreateTableSQL(name, aggregate, availableAggregates, availableValueObjects, parentIdField, identifiers));
      sqlStatements.push('');
    }
    return sqlStatements;
  }

  const oldAggregates = oldState.aggregates;

  // Find dropped tables
  for (const oldName of Object.keys(oldAggregates)) {
    if (!newAggregates[oldName]) {
      const tableName = getTableName(oldName);
      sqlStatements.push(`-- Drop ${tableName} table`);
      sqlStatements.push(generateDropTableSQL(tableName));
      sqlStatements.push('');
    }
  }

  // Find new and modified tables
  for (const [name, newAggregate] of Object.entries(newAggregates)) {
    const oldAggregate = oldAggregates[name];
    const tableName = getTableName(name);
    const parentName = childToParent.get(name);
    const parentIdField = parentName ? `${parentName.toLowerCase()}Id` : undefined;

    if (!oldAggregate) {
      sqlStatements.push(`-- Create ${tableName} table`);
      sqlStatements.push(generateCreateTableSQL(name, newAggregate, availableAggregates, availableValueObjects, parentIdField, identifiers));
      sqlStatements.push('');
    } else {
      const oldFields = oldAggregate.fields;
      const newFields = newAggregate.fields;

      // Find dropped columns
      for (const oldFieldName of Object.keys(oldFields)) {
        if (!newFields[oldFieldName]) {
          const columnName = isRelationshipField(oldFields[oldFieldName].type, availableAggregates)
            ? getForeignKeyFieldName(oldFieldName)
            : oldFieldName;
          sqlStatements.push(`-- Drop column ${columnName} from ${tableName}`);
          sqlStatements.push(generateDropColumnSQL(tableName, columnName));
          sqlStatements.push('');
        }
      }

      // Find new and modified columns
      for (const [fieldName, newField] of Object.entries(newFields)) {
        const oldField = oldFields[fieldName];

        if (!oldField) {
          sqlStatements.push(`-- Add column ${fieldName} to ${tableName}`);
          sqlStatements.push(generateAddColumnSQL(tableName, fieldName, newField, availableAggregates, availableValueObjects, identifiers));
          sqlStatements.push('');
        } else {
          const typeChanged = oldField.type !== newField.type;
          const requiredChanged = oldField.required !== newField.required;

          if (typeChanged || requiredChanged) {
            sqlStatements.push(`-- Modify column ${fieldName} in ${tableName}`);
            sqlStatements.push(generateModifyColumnSQL(tableName, fieldName, newField, availableAggregates, availableValueObjects, identifiers));
            sqlStatements.push('');
          }
        }
      }
    }
  }

  return sqlStatements;
}

export function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
}

export function getMigrationFileName(timestamp: string): string {
  return `${timestamp}.sql`;
}
