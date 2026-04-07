import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { colors } from '../utils/colors';
import { resolveYamlPath } from '../utils/cliUtils';
import { loadAppConfig, getModuleEntries } from '../utils/commandUtils';
import { isValidModuleConfig, AggregateConfig } from '../types/configTypes';
import {
  SchemaState,
  loadSchemaState,
  saveSchemaState,
  compareSchemas,
  generateTimestamp,
  getMigrationFileName
} from '../utils/migrationUtils';

interface CollectedSchema {
  aggregates: Record<string, AggregateConfig>;
  valueObjects: Set<string>;
}

function collectSchemaFromModules(appYamlPath: string): CollectedSchema {
  const appConfig = loadAppConfig(appYamlPath);
  const moduleEntries = getModuleEntries(appConfig);
  const projectRoot = path.dirname(appYamlPath);

  const allAggregates: Record<string, AggregateConfig> = {};
  const allValueObjects = new Set<string>();
  const sources: string[] = [];

  for (const entry of moduleEntries) {
    const moduleYamlPath = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(projectRoot, entry.path);

    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`   Module YAML not found: ${moduleYamlPath}`));
      continue;
    }

    const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
    const moduleConfig = parseYaml(moduleYamlContent);

    if (!isValidModuleConfig(moduleConfig)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`   Skipping ${moduleYamlPath}: not a valid module config (missing domain/useCases)`));
      continue;
    }

    const aggregates = moduleConfig.domain.aggregates;
    const count = Object.keys(aggregates).length;

    Object.assign(allAggregates, aggregates);

    if (moduleConfig.domain.valueObjects) {
      for (const voName of Object.keys(moduleConfig.domain.valueObjects)) {
        allValueObjects.add(voName);
      }
    }

    sources.push(`${entry.name} (${count} aggregate(s))`);
  }

  if (sources.length > 0) {
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Sources: ${sources.join(', ')}`));
  }

  return { aggregates: allAggregates, valueObjects: allValueObjects };
}

export function handleMigrateCommit(yamlPath?: string): void {
  try {
    const resolvedYamlPath = resolveYamlPath(yamlPath);
    const projectRoot = path.dirname(resolvedYamlPath);
    const migrationsDir = path.join(projectRoot, 'migrations');
    const stateFilePath = path.join(migrationsDir, 'schema_state.yaml');

    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n🔄 Running migration commit at application level...'));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Project root: ${projectRoot}`));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Migrations dir: ${migrationsDir}`));

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      // eslint-disable-next-line no-console
      console.log(colors.green(`   ✓ Created migrations directory`));
    }

    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n📋 Collecting aggregates from all modules...'));
    const { aggregates: currentAggregates, valueObjects: currentValueObjects } = collectSchemaFromModules(resolvedYamlPath);

    if (Object.keys(currentAggregates).length === 0) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No aggregates found in module configuration.'));
      return;
    }

    // eslint-disable-next-line no-console
    console.log(colors.green(`✓ Found ${Object.keys(currentAggregates).length} aggregate(s): ${Object.keys(currentAggregates).join(', ')}`));

    const oldState = loadSchemaState(stateFilePath);

    if (oldState) {
      // eslint-disable-next-line no-console
      console.log(colors.cyan(`📖 Previous schema state loaded (version: ${oldState.version})`));
    } else {
      // eslint-disable-next-line no-console
      console.log(colors.cyan('📖 No previous schema state found - will generate initial migration'));
    }

    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n🔍 Comparing schemas...'));
    const sqlStatements = compareSchemas(oldState, currentAggregates, currentValueObjects);

    if (sqlStatements.length === 0 || sqlStatements.every(s => s.trim() === '' || s.startsWith('--'))) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No changes detected. Schema is up to date.'));
      return;
    }

    const timestamp = generateTimestamp();
    const migrationFileName = getMigrationFileName(timestamp);
    const migrationFilePath = path.join(migrationsDir, migrationFileName);

    const migrationHeader = `-- Migration: ${oldState ? 'Schema update' : 'Initial schema'}
-- Created: ${new Date().toISOString().split('T')[0]}
-- Timestamp: ${timestamp}

`;

    const migrationContent = migrationHeader + sqlStatements.join('\n');

    fs.writeFileSync(migrationFilePath, migrationContent);

    const newState: SchemaState = {
      aggregates: currentAggregates,
      version: timestamp,
      timestamp: new Date().toISOString(),
    };

    saveSchemaState(stateFilePath, newState);

    // eslint-disable-next-line no-console
    console.log(colors.green('\n✅ Migration created successfully!'));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   File: ${migrationFileName}`));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Path: ${migrationFilePath}`));
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Location: Application-level migrations directory`));
    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n💡 Next step: Run "currentjs migrate push" to apply this migration to the database (not implemented yet).'));

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(colors.red('❌ Error creating migration:'), error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
