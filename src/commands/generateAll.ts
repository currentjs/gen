import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath, runCommand } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { initGenerationRegistry } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { GENERATOR_MARKERS, COMMON_FILES } from '../utils/constants';
import { isValidModuleConfig } from '../types/configTypes';
import { loadAppConfig, getModuleEntries, shouldIncludeModule, createGenerators } from '../utils/commandUtils';
import { scanModuleClasses, buildInstantiationOrder, resolveProviderImport, ClassInfo } from '../utils/diResolver';
import { systemTsTemplate, DEFAULT_FILES } from '../generators/templates/appTemplates';

interface ModuleScanEntry {
  moduleDir: string;
  databaseKey: string;
}

const LAYOUT_TEMPLATE_PAIRS: { baseName: string; bootstrapFile: string; tailwindFile: string }[] = [
  { baseName: 'main_view', bootstrapFile: DEFAULT_FILES.MAIN_VIEW_BOOTSTRAP, tailwindFile: DEFAULT_FILES.MAIN_VIEW_TAILWIND },
  { baseName: 'error', bootstrapFile: DEFAULT_FILES.ERROR_BOOTSTRAP, tailwindFile: DEFAULT_FILES.ERROR_TAILWIND },
];

/**
 * Swap layout template internal names so the active styling variant gets the
 * canonical name (e.g. "main_view") and the inactive one keeps its suffixed
 * name (e.g. "main_view_tailwind").
 */
function activateLayoutTemplates(templatesDir: string, styling: string): void {
  for (const pair of LAYOUT_TEMPLATE_PAIRS) {
    const activeFile = styling === 'tailwind' ? pair.tailwindFile : pair.bootstrapFile;
    const inactiveFile = styling === 'tailwind' ? pair.bootstrapFile : pair.tailwindFile;
    const activeSuffix = styling === 'tailwind' ? '_tailwind' : '_bootstrap';
    const inactiveSuffix = styling === 'tailwind' ? '_bootstrap' : '_tailwind';

    const nameRegex = /<!-- @template name="([^"]*)" -->/;

    // Active template: ensure its internal name is the canonical baseName
    const activePath = path.join(templatesDir, activeFile);
    if (fs.existsSync(activePath)) {
      let content = fs.readFileSync(activePath, 'utf8');
      const m = content.match(nameRegex);
      if (m && m[1] !== pair.baseName) {
        content = content.replace(nameRegex, `<!-- @template name="${pair.baseName}" -->`);
        fs.writeFileSync(activePath, content, 'utf8');
      }
    }

    // Inactive template: ensure its internal name is the suffixed name
    const inactivePath = path.join(templatesDir, inactiveFile);
    const suffixedName = pair.baseName + inactiveSuffix;
    if (fs.existsSync(inactivePath)) {
      let content = fs.readFileSync(inactivePath, 'utf8');
      const m = content.match(nameRegex);
      if (m && m[1] !== suffixedName) {
        content = content.replace(nameRegex, `<!-- @template name="${suffixedName}" -->`);
        fs.writeFileSync(inactivePath, content, 'utf8');
      }
    }
  }
}

export async function handleGenerateAll(
  yamlPathArg?: string,
  _outArg?: string,
  moduleName?: string,
  opts?: { force?: boolean; skip?: boolean; withTemplates?: boolean }
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

  const { domainGen, dtoGen, portGen, queryGen, commandGen, serviceGen, controllerGen, templateGen, storeGen } = createGenerators();

  const moduleScansBySrcDir = new Map<string, ModuleScanEntry[]>();

  // Process each module: generate files and collect module dirs for DI scanning
  for (const entry of filteredEntries) {
    const moduleYamlPath = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(process.cwd(), entry.path);

    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Module YAML not found: ${moduleYamlPath}`));
      continue;
    }

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

    const identifiers = entry.identifiers;
    // eslint-disable-next-line no-await-in-loop
    await domainGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await dtoGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await portGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers, appConfig);
    // eslint-disable-next-line no-await-in-loop
    await queryGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await commandGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await serviceGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await storeGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers, entry.database === 'postgres' ? 'postgres' : 'mysql');
    // eslint-disable-next-line no-await-in-loop
    await controllerGen.generateAndSaveFiles(moduleYamlPath, moduleDir, opts, identifiers);
    // eslint-disable-next-line no-await-in-loop
    await templateGen.generateAndSaveFiles(moduleYamlPath, moduleDir, { force: opts?.force, skipOnConflict: opts?.skip, onlyIfMissing: !opts?.withTemplates }, entry.styling);

    // Find srcDir by probing upward for app.ts
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

    const scans = moduleScansBySrcDir.get(srcDir) ?? [];
    scans.push({ moduleDir, databaseKey: entry.database });
    moduleScansBySrcDir.set(srcDir, scans);
  }

  // Update app.ts files with DI-based wiring
  for (const [srcDir, moduleScans] of moduleScansBySrcDir.entries()) {
    try {
      const appTsPath = path.join(srcDir, COMMON_FILES.APP_TS);
      if (!fs.existsSync(appTsPath)) continue;

      // Ensure system.ts exists (for existing apps created before this feature)
      const systemTsPath = path.join(srcDir, 'system.ts');
      if (!fs.existsSync(systemTsPath)) {
        fs.writeFileSync(systemTsPath, systemTsTemplate, 'utf8');
        // eslint-disable-next-line no-console
        console.log(colors.green(`Created ${systemTsPath}`));
      }

      let appTs = fs.readFileSync(appTsPath, 'utf8');

      // --- Scan all modules for @Injectable and @Controller classes ---
      const allClasses: ClassInfo[] = [];
      for (const scan of moduleScans) {
        const classes = scanModuleClasses(scan.moduleDir);
        allClasses.push(...classes);
      }

      // --- Build provider info ---
      const importLines: string[] = [];
      const providerInitLines: string[] = [];
      const providersArrayEntries: string[] = [];
      let isIProviderImported = false;

      if (providersConfig && Object.keys(providersConfig).length > 0) {
        for (const [provName, mod] of Object.entries(providersConfig)) {
          if (!mod) continue;
          const resolved = resolveProviderImport(mod, srcDir);
          if (!appTs.includes(`from '${resolved.importPath}'`)) {
            importLines.push(`import { ${resolved.className}${!isIProviderImported ? ', IProvider, ISqlProvider' : ''} } from '${resolved.importPath}';`);
          }
          if (!isIProviderImported) isIProviderImported = true;
          providerInitLines.push(`  ${provName}: new ${resolved.className}((() => {
    const raw = process.env.${provName.toUpperCase()} || '';
    try { return raw ? JSON.parse(raw) : undefined; } catch { return raw; }
  })())`);
          providersArrayEntries.push(provName);
        }
      } else {
        if (!appTs.includes("from '@currentjs/provider-mysql'")) {
          importLines.push(`import { ProviderMysql, IProvider, ISqlProvider } from '@currentjs/provider-mysql';`);
        }
        providerInitLines.push(`  mysql: new ProviderMysql((() => {
    const raw = process.env.MYSQL || '';
    try { return raw ? JSON.parse(raw) : undefined; } catch { return raw; }
  })())`);
        providersArrayEntries.push('mysql');
      }

      // Resolve database keys to provider variable names
      const providerKeysSet = new Set(providersArrayEntries);
      const allDatabaseKeys = [...new Set(moduleScans.map(s => s.databaseKey))];
      const dbVarByKey: Record<string, string> = {};
      const dbLines: string[] = [`const providers: Record<string, IProvider> = {\n${providerInitLines.join(',\n')}\n};`];
      const emittedProviderKeys = new Set<string>();

      for (const key of allDatabaseKeys) {
        const resolvedKey = providerKeysSet.has(key)
          ? key
          : (defaultDatabaseKey && providerKeysSet.has(defaultDatabaseKey) ? defaultDatabaseKey : providersArrayEntries[0]);
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

      // --- Build DI instantiation order ---
      const providerVarByType = new Map<string, string>();
      providerVarByType.set('ISqlProvider', dbVarByKey[allDatabaseKeys[0]] ?? 'dbMysql');

      // Scan local providers and register their class names + implemented interfaces
      const providerCastLines: string[] = [];
      if (providersConfig) {
        const GENERIC_INTERFACES = new Set(['IProvider', 'ISqlProvider']);
        for (const [provName, mod] of Object.entries(providersConfig)) {
          if (!mod || typeof mod !== 'string') continue;
          const isLocal = mod.startsWith('.') || mod.startsWith('/');
          if (!isLocal) continue;

          const providerDir = path.resolve(srcDir, mod);
          const providerClasses = scanModuleClasses(providerDir);

          for (const cls of providerClasses) {
            const varName = provName.charAt(0).toLowerCase() + provName.slice(1);
            providerVarByType.set(cls.className, varName);
            for (const iface of cls.implementedInterfaces) {
              if (!GENERIC_INTERFACES.has(iface)) {
                providerVarByType.set(iface, varName);
              }
            }
            providerCastLines.push(
              `const ${varName} = providers['${provName}'] as ${cls.className};`
            );
          }
        }
      }

      // Per-class provider var: map each class to its module's database variable
      const classProviderVar = new Map<string, string>();
      for (const scan of moduleScans) {
        const dbVar = dbVarByKey[scan.databaseKey] ?? dbVarByKey[Object.keys(dbVarByKey)[0]];
        const classes = allClasses.filter(c => c.filePath.startsWith(scan.moduleDir + path.sep));
        for (const cls of classes) {
          const hasSqlProviderParam = cls.constructorParams.some(p => p.type === 'ISqlProvider');
          if (hasSqlProviderParam) {
            classProviderVar.set(cls.className, dbVar);
          }
        }
      }

      const steps = buildInstantiationOrder(allClasses, providerVarByType, classProviderVar, srcDir);

      // --- Generate import lines for all discovered classes ---
      for (const step of steps) {
        const importLine = `import { ${step.className} } from '${step.importPath}';`;
        if (!appTs.includes(importLine) && !importLines.includes(importLine)) {
          importLines.push(importLine);
        }
      }

      if (!appTs.includes("from '@currentjs/router'")) {
        importLines.push(`import { createWebServer } from '@currentjs/router';`);
      }

      if (importLines.length) {
        const existingImports = new Set<string>();
        const importRegex = /^import[^;]+;$/gm;
        const currentImports = appTs.match(importRegex) || [];
        currentImports.forEach(line => existingImports.add(line.trim()));
        const toAdd = importLines.filter(line => !existingImports.has(line.trim()));
        if (toAdd.length) appTs = toAdd.join('\n') + '\n' + appTs;
      }

      // --- Build wiring block ---
      const wiringLines: string[] = [];

      wiringLines.push(dbLines.join('\n'));
      if (providerCastLines.length > 0) {
        wiringLines.push(providerCastLines.join('\n'));
      }

      const nonControllers = steps.filter(s => !s.isController);
      const controllers = steps.filter(s => s.isController);

      for (const step of nonControllers) {
        const args = step.constructorArgs.length > 0 ? step.constructorArgs.join(', ') : '';
        wiringLines.push(`const ${step.varName} = new ${step.className}(${args});`);
      }

      wiringLines.push('const controllers = [');
      if (controllers.length > 0) {
        const registrations = controllers
          .map(s => {
            const args = s.constructorArgs.length > 0 ? s.constructorArgs.join(', ') : '';
            return `  new ${s.className}(${args}),`;
          })
          .join('\n');
        wiringLines.push(registrations);
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

  // Activate the correct layout template based on config.styling
  const globalStyling = appConfig.config?.styling ?? 'bootstrap';
  for (const srcDir of moduleScansBySrcDir.keys()) {
    const templatesDir = path.join(srcDir, 'common', 'ui', 'templates');
    if (fs.existsSync(templatesDir)) {
      activateLayoutTemplates(templatesDir, globalStyling);
    }
  }

  // Run build
  runCommand('npm run build', {
    infoMessage: '\nBuilding...',
    successMessage: '[v] Build completed successfully',
    errorMessage: '[x] Build failed:'
  });
}
