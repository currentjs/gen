import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath, runCommand } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { initGenerationRegistry } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { GENERATOR_MARKERS, COMMON_FILES } from '../utils/constants';
import { isValidModuleConfig, ModuleConfig } from '../types/configTypes';
import { getChildrenOfParent, buildChildEntityMap } from '../utils/childEntityUtils';
import { loadAppConfig, getModuleEntries, shouldIncludeModule, createGenerators } from '../utils/commandUtils';

export async function handleGenerateAll(
  yamlPathArg?: string,
  _outArg?: string,
  moduleName?: string,
  opts?: { force?: boolean; skip?: boolean }
): Promise<void> {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());

  const appConfig = loadAppConfig(appYamlPath);
  const moduleEntries = getModuleEntries(appConfig);
  const providersConfig = appConfig.providers;
  const defaultDatabaseKey = appConfig.config?.database;

  const filteredEntries = moduleEntries.filter(
    entry => shouldIncludeModule(entry.path, moduleName) || (moduleName && entry.name === moduleName)
  );
  if (filteredEntries.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(colors.yellow(`No modules matched: ${moduleName}`));
    return;
  }

  const { domainGen, dtoGen, useCaseGen, serviceGen, controllerGen, templateGen, storeGen } = createGenerators();

  interface ControllerInit {
    entityName: string;
    entityVar: string;
    databaseKey: string;
    importController: string;
    importStore: string;
    importService: string;
    importUseCase: string;
    wiring: string[];
    registration: string;
  }

  const initsBySrcDir = new Map<string, ControllerInit[]>();

  // Process each module
  for (const entry of filteredEntries) {
    const moduleYamlPath = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(process.cwd(), entry.path);
      
    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Module YAML not found: ${moduleYamlPath}`));
      continue;
    }

    // Check if this is a valid module config (domain/useCases)
    const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
    const moduleConfig = parseYaml(moduleYamlContent);

    if (!isValidModuleConfig(moduleConfig)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Skipping ${moduleYamlPath}: not in expected format (missing domain/useCases)`));
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
        databaseKey: entry.database,
        importStore: `import { ${modelName}Store } from './modules/${moduleFolderName}/infrastructure/stores/${modelName}Store';`,
        importService: `import { ${modelName}Service } from './modules/${moduleFolderName}/application/services/${modelName}Service';`,
        importUseCase: `import { ${modelName}UseCase } from './modules/${moduleFolderName}/application/useCases/${modelName}UseCase';`,
        importController: '',
        wiring: [],
        registration: ''
      };

      // Check if this root entity's web controller needs child services (withChild: true)
          const childEntityMap = buildChildEntityMap(moduleConfig);
          const isRootEntity = !childEntityMap.has(modelName);
          const withChildChildren = isRootEntity ? getChildrenOfParent(moduleConfig, modelName) : [];
          const webUseCases = (moduleConfig as ModuleConfig).useCases[modelName];
          const needsChildServices = withChildChildren.length > 0 && webUseCases && Object.entries(webUseCases).some(
            ([action, uc]) => action === 'get' && uc.withChild === true
          );

          // Add controller imports if they exist
          controllerPaths.forEach(ctrlPath => {
            const ctrlName = path.basename(ctrlPath, '.ts');
            const ctrlModelName = ctrlName.replace(/(Api|Web)Controller$/, '');
            if (ctrlModelName === modelName) {
              const rel = path.relative(srcDir!, ctrlPath).replace(/\\/g, '/').replace(/\.ts$/, '');
              const importPath = rel.startsWith('.') ? rel : `./${rel}`;
              init.importController += `import { ${ctrlName} } from '${importPath}';\n`;
              
              // Web controllers may need child services when withChild is true
              const isWebCtrl = ctrlName.endsWith('WebController');
              if (isWebCtrl && needsChildServices) {
                const childServiceArgs = withChildChildren
                  .map(c => c.childEntityName.charAt(0).toLowerCase() + c.childEntityName.slice(1) + 'Service')
                  .join(', ');
                init.registration += `new ${ctrlName}(${entityVar}UseCase, ${childServiceArgs}),\n  `;
              } else {
                init.registration += `new ${ctrlName}(${entityVar}UseCase),\n  `;
              }
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

      const providerKeysSet = new Set(providersArrayEntries);
      const usedDatabaseKeys = [...new Set(controllerInits.map(i => i.databaseKey))];
      const dbVarByKey: Record<string, string> = {};
      const dbLines: string[] = [`const providers: Record<string, IProvider> = {\n${providerInitLines.join(',\n')}\n};`];
      const emittedProviderKeys = new Set<string>();
      for (const key of usedDatabaseKeys) {
        const resolvedKey = providerKeysSet.has(key) ? key : (defaultDatabaseKey && providerKeysSet.has(defaultDatabaseKey) ? defaultDatabaseKey : providersArrayEntries[0]);
        if (!providerKeysSet.has(key)) {
          // eslint-disable-next-line no-console
          console.warn(colors.yellow(`Module uses database '${key}' which is not in providers; using '${resolvedKey}'`));
        }
        const varName = 'db' + (resolvedKey.charAt(0).toUpperCase() + resolvedKey.slice(1));
        dbVarByKey[key] = varName;
        if (!emittedProviderKeys.has(resolvedKey)) {
          emittedProviderKeys.add(resolvedKey);
          dbLines.push(`const ${varName} = providers['${resolvedKey}'] as ISqlProvider;`);
        }
      }
      const ensureDbLine = dbLines.join('\n');

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

      // Store -> Service -> UseCase wiring (each store uses its module's database)
      for (const init of controllerInits) {
        const { entityName, entityVar, databaseKey } = init;
        const dbVar = dbVarByKey[databaseKey] ?? dbVarByKey[Object.keys(dbVarByKey)[0]];
        wiringLines.push(`const ${entityVar}Store = new ${entityName}Store(${dbVar});`);
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

      // Deduplicate import lines across the entire file
      const lines = appTs.split('\n');
      const seenImports = new Set<string>();
      const deduped = lines.filter(line => {
        const trimmed = line.trim();
        if (/^import\s+/.test(trimmed) && trimmed.endsWith(';')) {
          if (seenImports.has(trimmed)) return false;
          seenImports.add(trimmed);
        }
        return true;
      });
      appTs = deduped.join('\n');

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
