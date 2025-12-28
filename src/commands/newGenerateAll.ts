import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath, runCommand } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { DomainLayerGenerator } from '../generators/domainLayerGenerator';
import { DtoGenerator } from '../generators/dtoGenerator';
import { UseCaseGenerator } from '../generators/useCaseGenerator';
import { NewServiceGenerator } from '../generators/newServiceGenerator';
import { NewControllerGenerator } from '../generators/newControllerGenerator';
import { NewTemplateGenerator } from '../generators/newTemplateGenerator';
import { NewStoreGenerator } from '../generators/newStoreGenerator';
import { initGenerationRegistry } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { GENERATOR_MARKERS, COMMON_FILES } from '../utils/constants';
import { isNewModuleConfig } from '../types/configTypes';

export async function handleNewGenerateAll(
  yamlPathArg?: string,
  _outArg?: string,
  moduleName?: string,
  opts?: { force?: boolean; skip?: boolean }
): Promise<void> {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());
  
  const raw = fs.readFileSync(appYamlPath, 'utf8');
  const appConfig = parseYaml(raw) as { modules: Array<string | { module: string }>, providers?: Record<string, string>, database?: string } | null;
  const modulesList = (appConfig?.modules ?? []).map(m => (typeof m === 'string' ? m : m.module));
  const providersConfig = appConfig?.providers;
  const databaseProviderName = appConfig?.database;

  const shouldIncludeModule = (moduleYamlRel: string): boolean => {
    if (!moduleName || moduleName === '*') return true;
    const moduleNameLc = moduleName.toLowerCase();
    const relNormalized = moduleYamlRel.replace(/\\/g, '/').toLowerCase();
    if (relNormalized.endsWith(`/${moduleNameLc}.yaml`)) return true;
    const moduleYamlPath = path.isAbsolute(moduleYamlRel)
      ? moduleYamlRel
      : path.resolve(process.cwd(), moduleYamlRel);
    const dirName = path.basename(path.dirname(moduleYamlPath)).toLowerCase();
    if (dirName === moduleNameLc) return true;
    if (relNormalized.includes(`/${moduleNameLc}/`) || relNormalized.endsWith(`/${moduleNameLc}`)) return true;
    return false;
  };

  const filteredModules = modulesList.filter(shouldIncludeModule);
  if (filteredModules.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(colors.yellow(`No modules matched: ${moduleName}`));
    return;
  }

  // Initialize generators
  const domainGen = new DomainLayerGenerator();
  const dtoGen = new DtoGenerator();
  const useCaseGen = new UseCaseGenerator();
  const serviceGen = new NewServiceGenerator();
  const controllerGen = new NewControllerGenerator();
  const templateGen = new NewTemplateGenerator();
  const storeGen = new NewStoreGenerator();

  interface ControllerInit {
    entityName: string;
    entityVar: string;
    importController: string;
    importStore: string;
    importService: string;
    importUseCase: string;
    wiring: string[];
    registration: string;
  }

  const initsBySrcDir = new Map<string, ControllerInit[]>();

  // Process each module
  for (const moduleYamlRel of filteredModules) {
    const moduleYamlPath = path.isAbsolute(moduleYamlRel)
      ? moduleYamlRel
      : path.resolve(process.cwd(), moduleYamlRel);
      
    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Module YAML not found: ${moduleYamlPath}`));
      continue;
    }

    // Check if this is a new format config
    const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
    const moduleConfig = parseYaml(moduleYamlContent);

    if (!isNewModuleConfig(moduleConfig)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Skipping ${moduleYamlPath}: not in new format (missing domain/useCases)`));
      continue;
    }

    const moduleDir = path.dirname(moduleYamlPath);

    // eslint-disable-next-line no-console
    console.log(colors.blue(`\nGenerating module: ${path.basename(moduleDir)}`));

    // 1. Generate domain layer (entities + value objects)
    // eslint-disable-next-line no-await-in-loop
    await domainGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 2. Generate DTOs
    // eslint-disable-next-line no-await-in-loop
    await dtoGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 3. Generate Use Cases
    // eslint-disable-next-line no-await-in-loop
    await useCaseGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 4. Generate Services
    // eslint-disable-next-line no-await-in-loop
    await serviceGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 5. Generate Stores
    // eslint-disable-next-line no-await-in-loop
    await storeGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 6. Generate Controllers
    // eslint-disable-next-line no-await-in-loop
    const controllerPaths = await controllerGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // 7. Generate Templates
    // eslint-disable-next-line no-await-in-loop
    await templateGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts);

    // Collect wiring information for app.ts
    let probeDir = moduleDir;
    let srcDir: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.join(probeDir, 'src', COMMON_FILES.APP_TS);
      if (fs.existsSync(candidate)) {
        srcDir = path.join(probeDir, 'src');
        break;
      }
      const parent = path.dirname(probeDir);
      if (parent === probeDir) break;
      probeDir = parent;
    }

    if (!srcDir) continue;

    // Build wiring for each model in the module
    const list = initsBySrcDir.get(srcDir) ?? [];
    
    Object.keys(moduleConfig.useCases).forEach(modelName => {
      const entityVar = modelName.charAt(0).toLowerCase() + modelName.slice(1);
      const moduleFolderName = path.basename(moduleDir);

      const init: ControllerInit = {
        entityName: modelName,
        entityVar,
        importStore: `import { ${modelName}Store } from './modules/${moduleFolderName}/infrastructure/stores/${modelName}Store';`,
        importService: `import { ${modelName}Service } from './modules/${moduleFolderName}/application/services/${modelName}Service';`,
        importUseCase: `import { ${modelName}UseCase } from './modules/${moduleFolderName}/application/useCases/${modelName}UseCase';`,
        importController: '',
        wiring: [],
        registration: ''
      };

      // Add controller imports if they exist
      controllerPaths.forEach(ctrlPath => {
        const ctrlName = path.basename(ctrlPath, '.ts');
        if (ctrlName.startsWith(modelName)) {
          const rel = path.relative(srcDir!, ctrlPath).replace(/\\/g, '/').replace(/\.ts$/, '');
          const importPath = rel.startsWith('.') ? rel : `./${rel}`;
          init.importController += `import { ${ctrlName} } from '${importPath}';\n`;
          
          // Determine constructor params based on controller type
          init.registration += `new ${ctrlName}(${entityVar}UseCase),\n  `;
        }
      });

      list.push(init);
    });

    initsBySrcDir.set(srcDir, list);
  }

  // Update app.ts files with wiring
  for (const [srcDir, controllerInits] of initsBySrcDir.entries()) {
    try {
      const appTsPath = path.join(srcDir, COMMON_FILES.APP_TS);
      if (!fs.existsSync(appTsPath)) continue;

      let appTs = fs.readFileSync(appTsPath, 'utf8');

      // Build providers import and initialization from app.yaml providers section
      const importLines: string[] = [];
      const providerInitLines: string[] = [];
      const providersArrayEntries: string[] = [];
      let isIProviderImported = false;

      if (providersConfig && Object.keys(providersConfig).length > 0) {
        for (const [provName, mod] of Object.entries(providersConfig)) {
          if (!mod) continue;
          // Assume default import name from module spec after last '/'
          const baseName = mod.split('/').pop() || 'provider';
          const className = baseName
            .replace(/^[^a-zA-Z_]*/g, '')
            .split(/[-_]/)
            .map(s => s.charAt(0).toUpperCase() + s.slice(1))
            .join('');
          // Only add import if the module path isn't already imported
          if (!appTs.includes(`from '${mod}'`)) {
            importLines.push(`import { ${className}${!isIProviderImported ? ', IProvider, ISqlProvider' : ''} } from '${mod}';`);
          }
          if (!isIProviderImported) isIProviderImported = true;
          // Read provider configuration from env by name, parse JSON if possible, pass as is
          providerInitLines.push(`  ${provName}: new ${className}((() => {
    const raw = process.env.${provName.toUpperCase()} || '';
    try { return raw ? JSON.parse(raw) : undefined; } catch { return raw; }
  })())`);
          providersArrayEntries.push(provName);
        }
      } else {
        // Fallback to MySQL provider if no providers configured
        if (!appTs.includes("from '@currentjs/provider-mysql'")) {
          importLines.push(`import { ProviderMysql, IProvider, ISqlProvider } from '@currentjs/provider-mysql';`);
        }
        providerInitLines.push(`  mysql: new ProviderMysql((() => {
    const raw = process.env.MYSQL || '';
    try { return raw ? JSON.parse(raw) : undefined; } catch { return raw; }
  })())`);
        providersArrayEntries.push('mysql');
      }

      const dbProviderKey = databaseProviderName || providersArrayEntries[0];
      const ensureDbLine = `const providers: Record<string, IProvider> = {\n${providerInitLines.join(',\n')}\n};\nconst db = providers['${dbProviderKey}'] as ISqlProvider;`;
      
      // Ensure router imports
      if (!appTs.includes("from '@currentjs/router'")) {
        importLines.push(`import { createWebServer } from '@currentjs/router';`);
      }

      // Add entity imports
      for (const init of controllerInits) {
        const lines = [
          init.importStore,
          init.importService,
          init.importUseCase,
          init.importController
        ].filter(line => line && line.trim() !== '');

        for (const line of lines) {
          if (!appTs.includes(line) && !importLines.includes(line)) {
            importLines.push(line);
          }
        }
      }

      if (importLines.length) {
        // Filter out duplicates before prepending
        const existingImports = new Set<string>();
        const importRegex = /^import[^;]+;$/gm;
        const currentImports = appTs.match(importRegex) || [];
        currentImports.forEach(line => existingImports.add(line.trim()));
        const toAdd = importLines.filter(line => !existingImports.has(line.trim()));
        if (toAdd.length) appTs = toAdd.join('\n') + '\n' + appTs;
      }

      // Build wiring block
      const wiringLines: string[] = [];
      
      // Providers + DB initialization
      wiringLines.push(ensureDbLine);

      // Store -> Service -> UseCase wiring
      for (const init of controllerInits) {
        const { entityName, entityVar } = init;
        wiringLines.push(`const ${entityVar}Store = new ${entityName}Store(db);`);
        wiringLines.push(`const ${entityVar}Service = new ${entityName}Service(${entityVar}Store);`);
        wiringLines.push(`const ${entityVar}UseCase = new ${entityName}UseCase(${entityVar}Service);`);
      }

      // Controller registrations
      const registrations = controllerInits
        .map(i => i.registration)
        .filter(r => r && r.trim() !== '')
        .join('');

      wiringLines.push('const controllers = [');
      if (registrations) {
        wiringLines.push(`  ${registrations.trim()}`);
      }
      wiringLines.push('];');

      // Replace content between markers
      const startMarker = GENERATOR_MARKERS.CONTROLLERS_START;
      const endMarker = GENERATOR_MARKERS.CONTROLLERS_END;
      const startIdx = appTs.indexOf(startMarker);
      const endIdx = appTs.indexOf(endMarker);

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = appTs.slice(0, startIdx + startMarker.length);
        const after = appTs.slice(endIdx);
        const block = '\n' + wiringLines.join('\n') + '\n';
        appTs = before + block + after;
      }

      fs.writeFileSync(appTsPath, appTs, 'utf8');
      // eslint-disable-next-line no-console
      console.log(colors.green(`Updated ${appTsPath}`));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Could not update app.ts: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  // Run build
  runCommand('npm run build', {
    infoMessage: '\nBuilding...',
    successMessage: '[v] Build completed successfully',
    errorMessage: '[x] Build failed:'
  });
}

