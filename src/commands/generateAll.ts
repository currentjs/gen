import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath, runCommand } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { DomainModelGenerator } from '../generators/domainModelGenerator';
import { ValidationGenerator } from '../generators/validationGenerator';
import { ServiceGenerator } from '../generators/serviceGenerator';
import { ControllerGenerator } from '../generators/controllerGenerator';
import { StoreGenerator } from '../generators/storeGenerator';
import { TemplateGenerator } from '../generators/templateGenerator';
import { initGenerationRegistry } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { GENERATOR_MARKERS, PATH_PATTERNS, COMMON_FILES, GENERATOR_SUFFIXES } from '../utils/constants';

export async function handleGenerateAll(
  yamlPathArg?: string,
  _outArg?: string,
  moduleName?: string,
  opts?: { force?: boolean; skip?: boolean }
): Promise<void> {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());
  const raw = fs.readFileSync(appYamlPath, 'utf8');
  const appConfig = parseYaml(raw) as { modules: Array<string | { module: string }>} | null;
  const modulesList = (appConfig?.modules ?? []).map(m => (typeof m === 'string' ? m : m.module));
  const providersConfig = (appConfig as any)?.providers as Record<string, string> | undefined;
  const databaseProviderName = (appConfig as any)?.database as string | undefined;

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
    // Allow passing a path fragment
    if (relNormalized.includes(`/${moduleNameLc}/`) || relNormalized.endsWith(`/${moduleNameLc}`)) return true;
    return false;
  };

  const filteredModules = modulesList.filter(shouldIncludeModule);
  if (filteredModules.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(colors.yellow(`No modules matched: ${moduleName}`));
    return;
  }

  const domainGen = new DomainModelGenerator();
  const valGen = new ValidationGenerator();
  const svcGen = new ServiceGenerator();
  const ctrlGen = new ControllerGenerator();
  const storeGen = new StoreGenerator();
  const tplGen = new TemplateGenerator();

  type ControllerInit = {
    ctrlName: string;
    entityName: string;
    entityVar: string;
    importController: string;
    importStore: string;
    importService: string;
    importAuth?: string;
    wiring: string[]; // store + service
    registration: string;
  };
  const initsBySrcDir = new Map<string, ControllerInit[]>();

  // Run modules sequentially to avoid overlapping interactive prompts
  for (const moduleYamlRel of filteredModules) {
    const moduleYamlPath = path.isAbsolute(moduleYamlRel)
      ? moduleYamlRel
      : path.resolve(process.cwd(), moduleYamlRel);
    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Module YAML not found: ${moduleYamlPath}`));
      continue;
    }

    const moduleDir = path.dirname(moduleYamlPath);

    // Output folders inside module structure
    const domainOut = path.join(moduleDir, 'domain', 'entities');
    const appOut = path.join(moduleDir, 'application');
    const infraOut = path.join(moduleDir, 'infrastructure');
    fs.mkdirSync(domainOut, { recursive: true });
    fs.mkdirSync(appOut, { recursive: true });
    fs.mkdirSync(infraOut, { recursive: true });

    // Domain entities
    // eslint-disable-next-line no-await-in-loop
    await domainGen.generateAndSaveFiles(moduleYamlPath, domainOut, { force: !!opts?.force, skipOnConflict: !!opts?.skip });

    // Generate and save via per-generator write logic
    // eslint-disable-next-line no-await-in-loop
    await valGen.generateAndSaveFiles(moduleYamlPath, appOut, { force: !!opts?.force, skipOnConflict: !!opts?.skip });
    await svcGen.generateAndSaveFiles(moduleYamlPath, appOut, { force: !!opts?.force, skipOnConflict: !!opts?.skip });
    const generatedControllers = await ctrlGen.generateAndSaveFiles(moduleYamlPath, infraOut, { force: !!opts?.force, skipOnConflict: !!opts?.skip });
    await tplGen.generateAndSaveFiles(moduleYamlPath, undefined, { force: !!opts?.force, skipOnConflict: !!opts?.skip });

    // Find nearest ancestor containing src/app.ts and collect controller inits for a single write later
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

    const list = initsBySrcDir.get(srcDir) ?? [];
    for (const filePath of generatedControllers) {
      const rel = path
        .relative(srcDir, filePath)
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '');
      const ctrlName = path.basename(rel);
      const importPath = rel.startsWith('.') ? rel : `./${rel}`;
      const baseEntityName = ctrlName.endsWith('ApiController')
        ? ctrlName.slice(0, -'ApiController'.length)
        : ctrlName.endsWith('WebController')
          ? ctrlName.slice(0, -'WebController'.length)
          : ctrlName.replace('Controller', '');
      const entityName = baseEntityName;
      const entityVar = entityName.charAt(0).toLowerCase() + entityName.slice(1);

      const m = rel.match(/modules\/([^/]+)\/infrastructure\/controllers\//);
      const moduleFolder = m ? m[1] : undefined;
      if (!moduleFolder) continue;

      const storeImportPath = `${PATH_PATTERNS.MODULES_RELATIVE}${moduleFolder}/${PATH_PATTERNS.INFRASTRUCTURE}/${PATH_PATTERNS.STORES}/${entityName}${GENERATOR_SUFFIXES.STORE}`;
      const serviceImportPath = `${PATH_PATTERNS.MODULES_RELATIVE}${moduleFolder}/${PATH_PATTERNS.APPLICATION}/${PATH_PATTERNS.SERVICES}/${entityName}${GENERATOR_SUFFIXES.SERVICE}`;
      //const authImportPath = `./modules/${moduleFolder}/application/auth/AuthService`;
      // const hasAuth = true;//fs.existsSync(path.join(srcDir, authImportPath + '.ts'));

      const init: ControllerInit = {
        ctrlName,
        entityName,
        entityVar,
        importController: `import { ${ctrlName} } from '${importPath}';`,
        importStore: `import { ${entityName}Store } from '${storeImportPath}';`,
        importService: `import { ${entityName}Service } from '${serviceImportPath}';`,
        importAuth: undefined, //hasAuth ? `import { AuthService } from '${authImportPath}';` : undefined,
        wiring: [
          `const ${entityVar}Store = new ${entityName}Store(db);`,
          `const ${entityVar}Service = new ${entityName}Service(${entityVar}Store);`
        ],
        registration: `new ${ctrlName}(${entityVar}Service)`
      };
      // Avoid duplicates by controller (keep both Api/Web), dedupe wiring later by entityName
      if (!list.find((x) => x.ctrlName === init.ctrlName)) list.push(init);
    }
    initsBySrcDir.set(srcDir, list);
    await storeGen.generateAndSaveFiles(moduleYamlPath, infraOut, { force: !!opts?.force, skipOnConflict: !!opts?.skip });
  }

  // Single write per app: inject imports and rewrite block between markers
  let isIProviderImported = false;
  for (const [srcDir, controllerInits] of initsBySrcDir.entries()) {
    try {
      const appTsPath = path.join(srcDir, COMMON_FILES.APP_TS);
      if (!fs.existsSync(appTsPath)) continue;
      let appTs = fs.readFileSync(appTsPath, 'utf8');

      // Build providers import and initialization from app.yaml providers section
      const importLines: string[] = [];
      const providerInitLines: string[] = [];
      const providersArrayEntries: string[] = [];
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
          importLines.push(`import { ${className}${!isIProviderImported ? ', IProvider, ISqlProvider' : ''} } from '${mod}';`);
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
        importLines.push(`import { ProviderMysql, ISqlProvider } from '@currentjs/provider-mysql';`);
        providerInitLines.push(`  mysql: new ProviderMysql((() => {
    const raw = process.env.MYSQL || '';
    try { return raw ? JSON.parse(raw) : undefined; } catch { return raw; }
  })())`);
        providersArrayEntries.push('mysql');
      }

      const ensureDbLine = `const providers: Record<string, IProvider> = {\n${providerInitLines.join(',\n')}\n};\nconst db = providers['${databaseProviderName || providersArrayEntries[0]}'] as ISqlProvider;`;


      // Ensure router import for server (app template already imports templating)
      if (!appTs.includes("from '@currentjs/router'")) {
        importLines.push(`import { createWebServer, createStaticServer } from '@currentjs/router';`);
      }
      for (const il of importLines) {
        if (!appTs.includes(il)) {
          appTs = il + '\n' + appTs;
        }
      }
      // Ensure MySQL provider import exists
      if (!appTs.includes("from '@currentjs/provider-mysql'")) {
        importLines.push(`import { ProviderMysql } from '@currentjs/provider-mysql';`);
      }

      for (const init of controllerInits) {
        const maybe = [init.importController, init.importStore, init.importService];
        if (init.importAuth) maybe.push(init.importAuth);
        for (const line of maybe) {
          if (!appTs.includes(line) && !importLines.includes(line)) importLines.push(line);
        }
      }
      if (importLines.length) {
        const existingImports = new Set<string>();
        const importRegex = /^import[^;]+;$/gm;
        const currentImports = appTs.match(importRegex) || [];
        currentImports.forEach(line => existingImports.add(line.trim()));
        const toAdd = importLines.filter(line => !existingImports.has(line.trim()));
        if (toAdd.length) appTs = toAdd.join('\n') + '\n' + appTs;
      }

      // Compose fresh block content
      const wiringLines: string[] = [];
      // DB placeholder once
      wiringLines.push(ensureDbLine);
      const wiredEntities = new Set<string>();
      for (const init of controllerInits) {
        if (!wiredEntities.has(init.entityName)) {
          wiringLines.push(...init.wiring);
          wiredEntities.add(init.entityName);
        }
      }
      const registrations = controllerInits.map((i) => i.registration);
      wiringLines.push('const controllers = [');
      wiringLines.push(`  ${registrations.join(',\n  ')}`);
      wiringLines.push('];');

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

      // Ensure the createWebServer call includes renderer in options
      // Case 1: createWebServer(controllers, { ... })
      const withOptionsRegex = /createWebServer\(\s*controllers\s*,\s*\{([\s\S]*?)\}\s*\)/m;
      if (withOptionsRegex.test(appTs)) {
        appTs = appTs.replace(withOptionsRegex, (full, inner) => {
          if (/\brenderer\b\s*:/.test(inner)) return full; // already present
          const trimmed = inner.trim();
          const prefix = trimmed.length ? inner.replace(trimmed, '') : '';
          const suffix = inner.endsWith(trimmed) ? '' : inner.slice(inner.indexOf(trimmed) + trimmed.length);
          const sep = trimmed.length ? ', ' : '';
          return full.replace(inner, `${prefix}${trimmed}${sep}renderer` + `: renderer${suffix}`);
        });
      } else {
        // Case 2: createWebServer(controllers)
        const noOptionsRegex = /createWebServer\(\s*controllers\s*\)/m;
        if (noOptionsRegex.test(appTs)) {
          appTs = appTs.replace(noOptionsRegex, 'createWebServer(controllers, { renderer })');
        }
      }

      fs.writeFileSync(appTsPath, appTs, 'utf8');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Could not update app.ts with controllers: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  // Run npm run build
  runCommand('npm run build', {
    infoMessage: '\nBuilding...',
    successMessage: '[v] Build completed successfully',
    errorMessage: '[x] Build failed:'
  });
}

