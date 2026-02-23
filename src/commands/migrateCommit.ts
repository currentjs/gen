import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { colors } from '../utils/colors';
import { resolveYamlPath } from '../utils/cliUtils';
import {
  ModelConfig,
  SchemaState,
  loadSchemaState,
  saveSchemaState,
  compareSchemas,
  generateTimestamp,
  getMigrationFileName
} from '../utils/migrationUtils';

interface ModuleConfig {
  models?: ModelConfig[];
}

interface ModuleEntryWithPath {
  path: string;
  models?: ModelConfig[];
}

interface AppConfig {
  modules?: Record<string, ModuleEntryWithPath>;
  models?: ModelConfig[];
}

function collectModelsFromYaml(yamlPath: string): ModelConfig[] {
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const config = parseYaml(yamlContent) as AppConfig;
  const projectRoot = path.dirname(yamlPath);

  const allModels: ModelConfig[] = [];
  const sources: string[] = [];

  // Check if it's a module YAML (has models directly)
  if (config.models) {
    allModels.push(...config.models);
    sources.push(`app.yaml (${config.models.length} model(s))`);
  }

  // App YAML: modules as Record<string, { path }> — resolve path and read module YAML for .models
  if (config.modules && typeof config.modules === 'object' && !Array.isArray(config.modules)) {
    let moduleCount = 0;
    for (const entry of Object.values(config.modules)) {
      const modulePath = entry.path;
      if (!modulePath) continue;
      const moduleYamlPath = path.isAbsolute(modulePath)
        ? modulePath
        : path.resolve(projectRoot, modulePath);
      if (fs.existsSync(moduleYamlPath)) {
        const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
        const moduleConfig = parseYaml(moduleYamlContent) as ModuleConfig;
        if (moduleConfig.models) {
          allModels.push(...moduleConfig.models);
          moduleCount++;
        }
      }
    }
    if (moduleCount > 0) {
      sources.push(`app.yaml modules section (${moduleCount} module(s))`);
    }
  }

  // Also check for module YAMLs in src/modules/*/module.yaml (as fallback)
  const modulesDir = path.join(projectRoot, 'src', 'modules');
  
  if (fs.existsSync(modulesDir)) {
    const moduleFolders = fs.readdirSync(modulesDir).filter(f => {
      const stat = fs.statSync(path.join(modulesDir, f));
      return stat.isDirectory();
    });
    
    let moduleYamlCount = 0;
    for (const moduleFolder of moduleFolders) {
      const moduleYamlPath = path.join(modulesDir, moduleFolder, 'module.yaml');
      
      if (fs.existsSync(moduleYamlPath)) {
        const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
        const moduleConfig = parseYaml(moduleYamlContent) as ModuleConfig;
        
        if (moduleConfig.models) {
          allModels.push(...moduleConfig.models);
          moduleYamlCount++;
        }
      }
    }
    
    if (moduleYamlCount > 0) {
      sources.push(`src/modules/*/module.yaml (${moduleYamlCount} module(s))`);
    }
  }

  // Log sources
  if (sources.length > 0) {
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Sources: ${sources.join(', ')}`));
  }

  return allModels;
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

    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      // eslint-disable-next-line no-console
      console.log(colors.green(`   ✓ Created migrations directory`));
    }

    // Collect all models from YAML files
    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n📋 Collecting models from all modules...'));
    const currentModels = collectModelsFromYaml(resolvedYamlPath);

    if (currentModels.length === 0) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No models found in YAML configuration.'));
      return;
    }

    // eslint-disable-next-line no-console
    console.log(colors.green(`✓ Found ${currentModels.length} model(s): ${currentModels.map(m => m.name).join(', ')}`));

    // Load previous state
    const oldState = loadSchemaState(stateFilePath);

    if (oldState) {
      // eslint-disable-next-line no-console
      console.log(colors.cyan(`📖 Previous schema state loaded (version: ${oldState.version})`));
    } else {
      // eslint-disable-next-line no-console
      console.log(colors.cyan('📖 No previous schema state found - will generate initial migration'));
    }

    // Compare schemas and generate SQL
    // eslint-disable-next-line no-console
    console.log(colors.cyan('\n🔍 Comparing schemas...'));
    const sqlStatements = compareSchemas(oldState, currentModels);

    if (sqlStatements.length === 0 || sqlStatements.every(s => s.trim() === '' || s.startsWith('--'))) {
      // eslint-disable-next-line no-console
      console.log(colors.yellow('⚠️  No changes detected. Schema is up to date.'));
      return;
    }

    // Generate migration file
    const timestamp = generateTimestamp();
    const migrationFileName = getMigrationFileName(timestamp);
    const migrationFilePath = path.join(migrationsDir, migrationFileName);

    const migrationHeader = `-- Migration: ${oldState ? 'Schema update' : 'Initial schema'}
-- Created: ${new Date().toISOString().split('T')[0]}
-- Timestamp: ${timestamp}

`;

    const migrationContent = migrationHeader + sqlStatements.join('\n');

    fs.writeFileSync(migrationFilePath, migrationContent);

    // Update state file
    const newState: SchemaState = {
      models: currentModels,
      version: timestamp,
      timestamp: new Date().toISOString()
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


