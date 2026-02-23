import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { DomainLayerGenerator } from '../generators/domainLayerGenerator';
import { DtoGenerator } from '../generators/dtoGenerator';
import { UseCaseGenerator } from '../generators/useCaseGenerator';
import { ServiceGenerator } from '../generators/serviceGenerator';
import { ControllerGenerator } from '../generators/controllerGenerator';
import { StoreGenerator } from '../generators/storeGenerator';
import { TemplateGenerator } from '../generators/templateGenerator';
import { computeContentHash, getStoredHash, initGenerationRegistry, loadRegistry } from '../utils/generationRegistry';
import { computeHunks, applyHunksToBase, type DiffHunk } from '../utils/commitUtils';
import { colors } from '../utils/colors';
import { isValidModuleConfig } from '../types/configTypes';

export async function handleDiff(yamlPathArg?: string, moduleName?: string): Promise<void> {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());
  const raw = fs.readFileSync(appYamlPath, 'utf8');
  const appConfig = parseYaml(raw) as { modules: Array<string | { module: string }>} | null;
  const modulesList = (appConfig?.modules ?? []).map(m => (typeof m === 'string' ? m : m.module));

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

  const domainGen = new DomainLayerGenerator();
  const dtoGen = new DtoGenerator();
  const useCaseGen = new UseCaseGenerator();
  const svcGen = new ServiceGenerator();
  const ctrlGen = new ControllerGenerator();
  const storeGen = new StoreGenerator();
  const tplGen = new TemplateGenerator();

  const results: Array<{ file: string; status: 'clean' | 'modified' | 'missing'; hunks?: DiffHunk[]; note?: string }> = [];

  for (const moduleYamlRel of filteredModules) {
    const moduleYamlPath = path.isAbsolute(moduleYamlRel)
      ? moduleYamlRel
      : path.resolve(process.cwd(), moduleYamlRel);
    if (!fs.existsSync(moduleYamlPath)) continue;

    const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
    const moduleConfig = parseYaml(moduleYamlContent);
    if (!isValidModuleConfig(moduleConfig)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Skipping ${moduleYamlPath}: not in expected format (missing domain/useCases)`));
      continue;
    }

    const moduleDir = path.dirname(moduleYamlPath);
    const domainEntitiesOut = path.join(moduleDir, 'domain', 'entities');
    const domainValueObjectsOut = path.join(moduleDir, 'domain', 'valueObjects');
    const appOut = path.join(moduleDir, 'application');
    const infraOut = path.join(moduleDir, 'infrastructure');
    const viewsOut = path.join(moduleDir, 'views');

    const nextDomain = domainGen.generateFromYamlFile(moduleYamlPath);
    const nextDtos = dtoGen.generateFromYamlFile(moduleYamlPath);
    const nextUseCases = useCaseGen.generateFromYamlFile(moduleYamlPath);
    const nextServices = svcGen.generateFromYamlFile(moduleYamlPath);
    const nextControllers = ctrlGen.generateFromYamlFile(moduleYamlPath);
    const nextStores = storeGen.generateFromYamlFile(moduleYamlPath);
    const nextTemplates = tplGen.generateFromYamlFile(moduleYamlPath);

    const consider = (target: string, generated: string) => {
      const rel = path.relative(process.cwd(), target);
      if (!fs.existsSync(target)) {
        results.push({ file: rel, status: 'missing' });
        return;
      }
      const content = fs.readFileSync(target, 'utf8');
      const currentHash = computeContentHash(content);
      const stored = getStoredHash(target);

      // Try using registry hunks to establish expected content after applying commits
      const registry = loadRegistry();
      const entry = (registry as any)[rel] as
        | { diffFormat?: string; diffBaseHash?: string; diffHunks?: DiffHunk[] }
        | undefined;
      const genHash = computeContentHash(generated);

      let baseForDiff = generated;
      let note: string | undefined;
      if (entry && entry.diffFormat === 'hunks-v1' && entry.diffBaseHash === genHash && entry.diffHunks) {
        const applied = applyHunksToBase(generated, entry.diffHunks);
        if (applied != null) {
          baseForDiff = applied;
          note = 'committed changes applied';
        }
      }

      const baseHash = computeContentHash(baseForDiff);
      if (stored && stored === currentHash && baseHash === currentHash) {
        results.push({ file: rel, status: 'clean', note });
        return;
      }
      const hunks = computeHunks(baseForDiff, content); // base: expected after commits, new: current
      if (hunks.length === 0) {
        results.push({ file: rel, status: 'clean', note });
        return;
      }
      results.push({ file: rel, status: 'modified', hunks, note });
    };

    // Domain: entities and value objects
    Object.entries(nextDomain).forEach(([name, { code, type }]) => {
      const outDir = type === 'valueObject' ? domainValueObjectsOut : domainEntitiesOut;
      consider(path.join(outDir, `${name}.ts`), code);
    });
    Object.entries(nextDtos).forEach(([name, code]) => consider(path.join(appOut, 'dto', `${name}.ts`), code));
    Object.entries(nextUseCases).forEach(([name, code]) => consider(path.join(appOut, 'useCases', `${name}UseCase.ts`), code));
    Object.entries(nextServices).forEach(([e, code]) => consider(path.join(appOut, 'services', `${e}Service.ts`), code));
    Object.entries(nextControllers).forEach(([name, code]) => consider(path.join(infraOut, 'controllers', `${name}Controller.ts`), code));
    Object.entries(nextStores).forEach(([e, code]) => consider(path.join(infraOut, 'stores', `${e}Store.ts`), code));
    Object.entries(nextTemplates).forEach(([name, code]) => consider(path.join(viewsOut, `${name}.html`), code));
  }

  if (results.length === 0) {
    // eslint-disable-next-line no-console
    console.log(colors.dim('No files to compare.'));
    return;
  }

  // eslint-disable-next-line no-console
  console.log('\n' + colors.bold('Current diffs (compared to generated):'));
  results.forEach(r => {
    if (r.status === 'clean') {
      console.log(`\n${colors.green('[clean]')} ${colors.dim(r.file)}`);
    } else if (r.status === 'missing') {
      console.log(`\n${colors.red('[missing]')} ${colors.dim(r.file)}`);
    } else {
      console.log(`\n${colors.yellow('[modified]')} ${colors.dim(r.file)}`);
      r.hunks?.forEach(h => {
        console.log(colors.cyan(`@@ -${h.oldStart + 1},${h.oldLines} +${h.newStart + 1},${h.newLines} @@`));
        h.oldContent.forEach(line => console.log(colors.red(`- ${line}`)));
        h.newContent.forEach(line => console.log(colors.green(`+ ${line}`)));
      });
    }
  });
}
