import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { colors } from '../utils/colors';
import { resolveYamlPath } from '../utils/cliUtils';
import { loadAppConfig, getModuleEntries } from '../utils/commandUtils';
import { withDatabaseConnection } from '../utils/dbConnection';
import {
  SchemaState,
  saveSchemaState,
  generateTimestamp,
  sqlTypeToYamlType,
  getTableName,
} from '../utils/migrationUtils';
import { AggregateConfig, isValidModuleConfig } from '../types/configTypes';

// ─── Internal Types ──────────────────────────────────────────────────────────

interface RawColumn {
  columnName: string;
  /** MySQL COLUMN_TYPE (e.g. "varchar(255)") or Postgres data_type (e.g. "character varying") */
  columnType: string;
  isNullable: string; // 'YES' | 'NO'
}

interface RawForeignKey {
  columnName: string;
  referencedTableName: string;
}

// ─── DB introspection helpers ─────────────────────────────────────────────────

async function getTableNames(provider: any, dbType: string): Promise<string[]> {
  let sql: string;
  if (dbType === 'postgres') {
    sql = `SELECT table_name AS "tableName"
           FROM information_schema.tables
           WHERE table_schema = current_schema()
             AND table_type = 'BASE TABLE'
           ORDER BY table_name`;
  } else {
    sql = `SELECT TABLE_NAME AS tableName
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`;
  }
  const result = await provider.query(sql, {});
  return (result.data as any[]).map((row: any) => (row.tableName ?? row.tablename) as string);
}

async function getColumns(provider: any, dbType: string, tableName: string): Promise<RawColumn[]> {
  let sql: string;
  if (dbType === 'postgres') {
    sql = `SELECT column_name AS "columnName",
                  data_type   AS "columnType",
                  is_nullable AS "isNullable"
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name   = :tableName
           ORDER BY ordinal_position`;
  } else {
    sql = `SELECT COLUMN_NAME AS columnName,
                  COLUMN_TYPE AS columnType,
                  IS_NULLABLE AS isNullable
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME   = :tableName
           ORDER BY ORDINAL_POSITION`;
  }
  const result = await provider.query(sql, { tableName });
  return (result.data as any[]).map((row: any) => ({
    columnName: row.columnName ?? row.columnname,
    columnType: row.columnType ?? row.columntype,
    isNullable: row.isNullable ?? row.isnullable,
  }));
}

async function getForeignKeys(provider: any, dbType: string, tableName: string): Promise<RawForeignKey[]> {
  let sql: string;
  if (dbType === 'postgres') {
    sql = `SELECT kcu.column_name        AS "columnName",
                  ccu.table_name         AS "referencedTableName"
           FROM information_schema.table_constraints     AS tc
           JOIN information_schema.key_column_usage      AS kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema    = kcu.table_schema
           JOIN information_schema.constraint_column_usage AS ccu
             ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema    = tc.table_schema
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema    = current_schema()
             AND tc.table_name      = :tableName`;
  } else {
    sql = `SELECT COLUMN_NAME            AS columnName,
                  REFERENCED_TABLE_NAME  AS referencedTableName
           FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA            = DATABASE()
             AND TABLE_NAME              = :tableName
             AND REFERENCED_TABLE_NAME IS NOT NULL`;
  }
  const result = await provider.query(sql, { tableName });
  return (result.data as any[]).map((row: any) => ({
    columnName: row.columnName ?? row.columnname,
    referencedTableName: row.referencedTableName ?? row.referencedtablename,
  }));
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

/** Build a reverse map: lower-case table name → canonical aggregate name from YAMLs. */
function buildTableToAggregateName(appYamlPath: string): Map<string, string> {
  const appConfig = loadAppConfig(appYamlPath);
  const moduleEntries = getModuleEntries(appConfig);
  const projectRoot = path.dirname(appYamlPath);
  const map = new Map<string, string>();

  for (const entry of moduleEntries) {
    const moduleYamlPath = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(projectRoot, entry.path);
    if (!fs.existsSync(moduleYamlPath)) continue;
    const moduleConfig = parseYaml(fs.readFileSync(moduleYamlPath, 'utf8'));
    if (!isValidModuleConfig(moduleConfig)) continue;
    for (const aggregateName of Object.keys(moduleConfig.domain.aggregates)) {
      map.set(getTableName(aggregateName), aggregateName);
    }
  }
  return map;
}

/** Best-effort table name → PascalCase aggregate name when not found in YAML map. */
function tableNameToAggregateName(tableName: string): string {
  return tableName.charAt(0).toUpperCase() + tableName.slice(1);
}

// ─── Schema conversion ────────────────────────────────────────────────────────

/** Auto-generated / framework columns that should not appear as model fields. */
const SKIP_COLUMNS = new Set(['id', 'ownerId', 'ownerid', 'createdAt', 'createdat', 'updatedAt', 'updatedat', 'deletedAt', 'deletedat']);

function buildAggregateConfig(
  columns: RawColumn[],
  fkMap: Map<string, string>,
  tableToAggregate: Map<string, string>
): AggregateConfig {
  const hasOwnerId = columns.some(c =>
    c.columnName === 'ownerId' || c.columnName === 'ownerid'
  );
  const fields: AggregateConfig['fields'] = {};

  for (const col of columns) {
    const colNameLower = col.columnName.toLowerCase();
    if (SKIP_COLUMNS.has(col.columnName) || SKIP_COLUMNS.has(colNameLower)) continue;

    const required = col.isNullable === 'NO';

    if (fkMap.has(col.columnName)) {
      // FK column e.g. "authorId" → field "author" of type "Author"
      const referencedTable = fkMap.get(col.columnName)!;
      const fieldName = col.columnName.endsWith('Id')
        ? col.columnName.slice(0, -2)
        : col.columnName.endsWith('id')
          ? col.columnName.slice(0, -2)
          : col.columnName;
      const aggregateName = tableToAggregate.get(referencedTable) ?? tableNameToAggregateName(referencedTable);
      fields[fieldName] = { type: aggregateName, required };
    } else {
      fields[col.columnName] = {
        type: sqlTypeToYamlType(col.columnType),
        required,
      };
    }
  }

  const config: AggregateConfig = { fields };
  if (hasOwnerId) config.root = true;
  return config;
}

// ─── Command handler ──────────────────────────────────────────────────────────

export async function handleMigratePull(yamlPath?: string): Promise<void> {
  try {
    const resolvedYamlPath = resolveYamlPath(yamlPath);
    const projectRoot = path.dirname(resolvedYamlPath);
    const migrationsDir = path.join(projectRoot, 'migrations');
    const stateFilePath = path.join(migrationsDir, 'schema_state.yaml');

    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n🔽 Running migrate pull...'));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Project root: ${projectRoot}`));

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const tableToAggregate = buildTableToAggregateName(resolvedYamlPath);
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Known aggregates from YAMLs: ${[...tableToAggregate.values()].join(', ') || '(none)'}`));

    await withDatabaseConnection(resolvedYamlPath, async (provider, dbType) => {
      const tables = await getTableNames(provider, dbType);
      const userTables = tables.filter(t => t !== '_migrations');

      if (userTables.length === 0) {
        // eslint-disable-next-line no-console
        console.log(colors.yellow('⚠️  No user tables found in the database. Nothing to pull.'));
        return;
      }

      // eslint-disable-next-line no-console
      console.log(colors.cyan(`\n📋 Introspecting ${userTables.length} table(s): ${userTables.join(', ')}`));

      const aggregates: Record<string, AggregateConfig> = {};

      for (const tableName of userTables) {
        const columns = await getColumns(provider, dbType, tableName);
        const rawFks = await getForeignKeys(provider, dbType, tableName);

        // Build a map of FK column name → referenced table name for this table
        const fkMap = new Map<string, string>();
        for (const fk of rawFks) {
          fkMap.set(fk.columnName, fk.referencedTableName);
        }

        const aggregateName = tableToAggregate.get(tableName) ?? tableNameToAggregateName(tableName);
        aggregates[aggregateName] = buildAggregateConfig(columns, fkMap, tableToAggregate);

        // eslint-disable-next-line no-console
        console.log(colors.gray(`   ✓ ${tableName} → ${aggregateName} (${Object.keys(aggregates[aggregateName].fields).length} field(s))`));
      }

      const newState: SchemaState = {
        aggregates,
        version: generateTimestamp(),
        timestamp: new Date().toISOString(),
      };

      saveSchemaState(stateFilePath, newState);

      // eslint-disable-next-line no-console
      console.log(colors.green(`\n✅ Schema state updated with ${Object.keys(aggregates).length} aggregate(s).`));
      // eslint-disable-next-line no-console
      console.log(colors.gray(`   File: ${stateFilePath}`));
      // eslint-disable-next-line no-console
      console.log(colors.cyan('\n💡 The local schema state now matches the database. Running "currentjs migrate commit" will show no diff.'));
    });

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(colors.red('❌ Error pulling database schema:'), error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
