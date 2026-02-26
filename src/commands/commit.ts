import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { computeContentHash, ensureCommitsDir, getStoredHash, initGenerationRegistry, updateStoredHunks } from '../utils/generationRegistry';
import { computeHunks, DiffHunk, type CommitMeta } from '../utils/commitUtils';
import { colors } from '../utils/colors';
import { isValidModuleConfig } from '../types/configTypes';
import { loadAppConfig, getModuleList, createGenerators } from '../utils/commandUtils';

type DiffRecord = {
  file: string; // relative to project root
  status: 'modified';
  oldHash: string; // current file hash
  newHash: string; // generated content hash
  diff?: string; // legacy simple line diff
  format?: 'hunks-v1';
  baseHash?: string;
  resultHash?: string;
  hunks?: DiffHunk[];
  meta?: CommitMeta;
};

export function handleCommit(yamlPathArg?: string, files?: string[]): void {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());
  const appConfig = loadAppConfig(appYamlPath);
  const modulesList = getModuleList(appConfig);

  const selection: Set<string> | null = (() => {
    if (!files || files.length === 0) return null;
    const cwd = process.cwd();
    const norm = (p: string) => {
      const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
      const rel = path.relative(cwd, abs);
      return rel.split(path.sep).join('/');
    };
    return new Set(files.map(norm));
  })();

  const { domainGen, dtoGen, useCaseGen, serviceGen: svcGen, controllerGen: ctrlGen, storeGen, templateGen: tplGen } = createGenerators();

  const diffs: DiffRecord[] = [];

  modulesList.forEach(moduleYamlRel => {
    const moduleYamlPath = path.isAbsolute(moduleYamlRel)
      ? moduleYamlRel
      : path.resolve(process.cwd(), moduleYamlRel);
    if (!fs.existsSync(moduleYamlPath)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Module YAML not found: ${moduleYamlPath}`));
      return;
    }

    const moduleYamlContent = fs.readFileSync(moduleYamlPath, 'utf8');
    const moduleConfig = parseYaml(moduleYamlContent);
    if (!isValidModuleConfig(moduleConfig)) {
      // eslint-disable-next-line no-console
      console.warn(colors.yellow(`Skipping ${moduleYamlPath}: not in expected format (missing domain/useCases)`));
      return;
    }

    const moduleDir = path.dirname(moduleYamlPath);
    const domainEntitiesOut = path.join(moduleDir, 'domain', 'entities');
    const domainValueObjectsOut = path.join(moduleDir, 'domain', 'valueObjects');
    const appOut = path.join(moduleDir, 'application');
    const infraOut = path.join(moduleDir, 'infrastructure');
    const viewsOut = path.join(moduleDir, 'views');

    // Generate in-memory
    const nextDomain = domainGen.generateFromYamlFile(moduleYamlPath);
    const nextDtos = dtoGen.generateFromYamlFile(moduleYamlPath);
    const nextUseCases = useCaseGen.generateFromYamlFile(moduleYamlPath);
    const nextServices = svcGen.generateFromYamlFile(moduleYamlPath);
    const nextControllers = ctrlGen.generateFromYamlFile(moduleYamlPath);
    const nextStores = storeGen.generateFromYamlFile(moduleYamlPath);
    const nextTemplates = tplGen.generateFromYamlFile(moduleYamlPath);

    // Helper to evaluate only user-changed files and compute diff vs freshly generated code
    const consider = (target: string, generated: string) => {
      if (!fs.existsSync(target)) return; // nothing to commit for missing files
      const currentContent = fs.readFileSync(target, 'utf8');
      const currentHash = computeContentHash(currentContent);
      const storedHash = getStoredHash(target);
      if (storedHash && storedHash === currentHash) return; // not changed by user
      const newHash = computeContentHash(generated);
      if (newHash === currentHash) return; // no diff vs generation
      const rel = path.relative(process.cwd(), target).split(path.sep).join('/');
      if (selection && !selection.has(rel)) return; // not selected
      const hunks = computeHunks(generated, currentContent); // base: generated, new: current
      // Store hunk snapshot into registry for quick inspection
      updateStoredHunks(target, hunks, newHash, currentHash);
      diffs.push({
        file: rel,
        status: 'modified',
        oldHash: currentHash,
        newHash,
        format: 'hunks-v1',
        baseHash: newHash,
        resultHash: currentHash,
        hunks
      });
    };

    Object.entries(nextDomain).forEach(([name, { code, type }]) => {
      const outDir = type === 'valueObject' ? domainValueObjectsOut : domainEntitiesOut;
      consider(path.join(outDir, `${name}.ts`), code);
    });
    Object.entries(nextDtos).forEach(([name, code]) => consider(path.join(appOut, 'dto', `${name}.ts`), code));
    Object.entries(nextUseCases).forEach(([name, code]) => consider(path.join(appOut, 'useCases', `${name}UseCase.ts`), code));
    Object.entries(nextServices).forEach(([entity, code]) =>
      consider(path.join(appOut, 'services', `${entity}Service.ts`), code)
    );
    Object.entries(nextControllers).forEach(([name, code]) =>
      consider(path.join(infraOut, 'controllers', `${name}Controller.ts`), code)
    );
    Object.entries(nextStores).forEach(([entity, code]) => consider(path.join(infraOut, 'stores', `${entity}Store.ts`), code));
    Object.entries(nextTemplates).forEach(([name, code]) => consider(path.join(viewsOut, `${name}.html`), code));
  });

  const commitsDir = ensureCommitsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const commitFile = path.join(commitsDir, `commit-${timestamp}.json`);
  fs.writeFileSync(commitFile, JSON.stringify({ createdAt: new Date().toISOString(), files: diffs }, null, 2));

  // eslint-disable-next-line no-console
  console.log(colors.green(`Saved diff summary with ${diffs.length} modified file(s) to ${path.relative(process.cwd(), commitFile)}`));
}
