import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
// import mysql from 'mysql2/promise';

export interface FieldConfig {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  auto?: boolean;
}

export interface ModelConfig {
  name: string;
  fields: FieldConfig[];
}

export interface SchemaState {
  models: ModelConfig[];
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
  boolean: 'TINYINT(1)',
  datetime: 'DATETIME',
  json: 'JSON',
  array: 'JSON',
  object: 'JSON'
};

export function mapYamlTypeToSql(yamlType: string, availableModels: Set<string>): string {
  // Check if this is a relationship (foreign key)
  if (availableModels.has(yamlType)) {
    return 'INT'; // Foreign keys are INT
  }
  return TYPE_MAPPING[yamlType] || 'VARCHAR(255)';
}

export function getTableName(modelName: string): string {
  return modelName.toLowerCase() + 's';
}

export function getForeignKeyFieldName(fieldName: string): string {
  return fieldName + 'Id';
}

export function isRelationshipField(fieldType: string, availableModels: Set<string>): boolean {
  return availableModels.has(fieldType);
}

export function generateCreateTableSQL(model: ModelConfig, availableModels: Set<string>): string {
  const tableName = getTableName(model.name);
  const columns: string[] = [];
  const indexes: string[] = [];
  const foreignKeys: string[] = [];

  // Add id column
  columns.push('  id INT AUTO_INCREMENT PRIMARY KEY');

  // Add model fields
  model.fields.forEach(field => {
    if (isRelationshipField(field.type, availableModels)) {
      // Foreign key field
      const foreignKeyName = getForeignKeyFieldName(field.name);
      const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
      columns.push(`  ${foreignKeyName} INT ${nullable}`);
      
      // Add index for foreign key
      indexes.push(`  INDEX idx_${tableName}_${foreignKeyName} (${foreignKeyName})`);
      
      // Add foreign key constraint
      const refTableName = getTableName(field.type);
      foreignKeys.push(
        `  CONSTRAINT fk_${tableName}_${foreignKeyName} \n` +
        `    FOREIGN KEY (${foreignKeyName}) \n` +
        `    REFERENCES ${refTableName}(id) \n` +
        `    ON DELETE RESTRICT \n` +
        `    ON UPDATE CASCADE`
      );
    } else {
      // Regular field
      const sqlType = mapYamlTypeToSql(field.type, availableModels);
      const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
      columns.push(`  ${field.name} ${sqlType} ${nullable}`);
      
      // Add index for filterable fields
      if (['string', 'number'].includes(field.type)) {
        indexes.push(`  INDEX idx_${tableName}_${field.name} (${field.name})`);
      }
    }
  });

  // Add standard timestamp columns
  columns.push('  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  columns.push('  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  columns.push('  deleted_at DATETIME NULL DEFAULT NULL');

  // Add standard indexes
  indexes.push(`  INDEX idx_${tableName}_deleted_at (deleted_at)`);
  indexes.push(`  INDEX idx_${tableName}_created_at (created_at)`);

  // Combine all parts
  const allParts = [...columns, ...indexes, ...foreignKeys];

  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n${allParts.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  
  return sql;
}

export function generateDropTableSQL(tableName: string): string {
  return `DROP TABLE IF EXISTS ${tableName};`;
}

export function generateAddColumnSQL(tableName: string, field: FieldConfig, availableModels: Set<string>): string {
  if (isRelationshipField(field.type, availableModels)) {
    const foreignKeyName = getForeignKeyFieldName(field.name);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    const sqlType = 'INT';
    return `ALTER TABLE ${tableName} ADD COLUMN ${foreignKeyName} ${sqlType} ${nullable};`;
  } else {
    const sqlType = mapYamlTypeToSql(field.type, availableModels);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${sqlType} ${nullable};`;
  }
}

export function generateDropColumnSQL(tableName: string, columnName: string): string {
  return `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
}

export function generateModifyColumnSQL(tableName: string, field: FieldConfig, availableModels: Set<string>): string {
  if (isRelationshipField(field.type, availableModels)) {
    const foreignKeyName = getForeignKeyFieldName(field.name);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    const sqlType = 'INT';
    return `ALTER TABLE ${tableName} MODIFY COLUMN ${foreignKeyName} ${sqlType} ${nullable};`;
  } else {
    const sqlType = mapYamlTypeToSql(field.type, availableModels);
    const nullable = field.required === false ? 'NULL DEFAULT NULL' : 'NOT NULL';
    return `ALTER TABLE ${tableName} MODIFY COLUMN ${field.name} ${sqlType} ${nullable};`;
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

/**
 * Sort models by dependencies so tables are created in the right order
 * (tables with no foreign keys first, then tables that depend on them)
 */
function sortModelsByDependencies(models: ModelConfig[], availableModels: Set<string>): ModelConfig[] {
  const sorted: ModelConfig[] = [];
  const processed = new Set<string>();
  
  const addModel = (model: ModelConfig) => {
    if (processed.has(model.name)) return;
    
    // Find foreign key dependencies
    const dependencies: string[] = [];
    model.fields.forEach(field => {
      if (isRelationshipField(field.type, availableModels)) {
        dependencies.push(field.type);
      }
    });
    
    // Add dependencies first
    dependencies.forEach(depName => {
      const depModel = models.find(m => m.name === depName);
      if (depModel && !processed.has(depName)) {
        addModel(depModel);
      }
    });
    
    // Then add this model
    sorted.push(model);
    processed.add(model.name);
  };
  
  models.forEach(model => addModel(model));
  return sorted;
}

export function compareSchemas(oldState: SchemaState | null, newModels: ModelConfig[]): string[] {
  const sqlStatements: string[] = [];
  const availableModels = new Set(newModels.map(m => m.name));

  if (!oldState || oldState.models.length === 0) {
    // No previous state - generate all CREATE TABLE statements in dependency order
    const sortedModels = sortModelsByDependencies(newModels, availableModels);
    sortedModels.forEach(model => {
      sqlStatements.push(`-- Create ${model.name.toLowerCase()}s table`);
      sqlStatements.push(generateCreateTableSQL(model, availableModels));
      sqlStatements.push('');
    });
    return sqlStatements;
  }

  // Create maps for easy lookup
  const oldModelsMap = new Map(oldState.models.map(m => [m.name, m]));
  const newModelsMap = new Map(newModels.map(m => [m.name, m]));

  // Find dropped tables
  oldState.models.forEach(oldModel => {
    if (!newModelsMap.has(oldModel.name)) {
      const tableName = getTableName(oldModel.name);
      sqlStatements.push(`-- Drop ${tableName} table`);
      sqlStatements.push(generateDropTableSQL(tableName));
      sqlStatements.push('');
    }
  });

  // Find new tables and modified tables
  newModels.forEach(newModel => {
    const oldModel = oldModelsMap.get(newModel.name);
    const tableName = getTableName(newModel.name);

    if (!oldModel) {
      // New table
      sqlStatements.push(`-- Create ${tableName} table`);
      sqlStatements.push(generateCreateTableSQL(newModel, availableModels));
      sqlStatements.push('');
    } else {
      // Table exists - check for column changes
      const oldFieldsMap = new Map(oldModel.fields.map(f => [f.name, f]));
      const newFieldsMap = new Map(newModel.fields.map(f => [f.name, f]));

      // Find dropped columns
      oldModel.fields.forEach(oldField => {
        if (!newFieldsMap.has(oldField.name)) {
          const columnName = isRelationshipField(oldField.type, availableModels) 
            ? getForeignKeyFieldName(oldField.name) 
            : oldField.name;
          sqlStatements.push(`-- Drop column ${columnName} from ${tableName}`);
          sqlStatements.push(generateDropColumnSQL(tableName, columnName));
          sqlStatements.push('');
        }
      });

      // Find new columns and modified columns
      newModel.fields.forEach(newField => {
        const oldField = oldFieldsMap.get(newField.name);
        
        if (!oldField) {
          // New column
          sqlStatements.push(`-- Add column ${newField.name} to ${tableName}`);
          sqlStatements.push(generateAddColumnSQL(tableName, newField, availableModels));
          sqlStatements.push('');
        } else {
          // Check if column definition changed
          const typeChanged = oldField.type !== newField.type;
          const requiredChanged = oldField.required !== newField.required;
          
          if (typeChanged || requiredChanged) {
            sqlStatements.push(`-- Modify column ${newField.name} in ${tableName}`);
            sqlStatements.push(generateModifyColumnSQL(tableName, newField, availableModels));
            sqlStatements.push('');
          }
        }
      });
    }
  });

  return sqlStatements;
}

export function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
}

export function getMigrationFileName(timestamp: string): string {
  return `${timestamp}.sql`;
}
