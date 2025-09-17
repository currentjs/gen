import * as fs from 'fs';
import * as path from 'path';
import { resolveYamlPath } from '../utils/cliUtils';
import { parse as parseYaml } from 'yaml';
import { DomainModelGenerator } from '../generators/domainModelGenerator';
import { ValidationGenerator } from '../generators/validationGenerator';
import { ServiceGenerator } from '../generators/serviceGenerator';
import { ControllerGenerator } from '../generators/controllerGenerator';
import { StoreGenerator } from '../generators/storeGenerator';
import { computeContentHash, ensureCommitsDir, getStoredHash, initGenerationRegistry, updateStoredHunks } from '../utils/generationRegistry';
import { computeLineDiff } from '../utils/commitUtils';
import { computeHunks, DiffHunk } from '../utils/commitUtils';
import { colors } from '../utils/colors';

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
  meta?: Record<string, any>;
};

// legacy inline diff removed in favor of hunks; kept for backward compatibility via utils/commitUtils if needed

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach(entry => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else result.push(abs);
    });
  }
  return result;
}

export function handleCommit(yamlPathArg?: string, files?: string[]): void {
  const appYamlPath = resolveYamlPath(yamlPathArg);
  initGenerationRegistry(process.cwd());
  const raw = fs.readFileSync(appYamlPath, 'utf8');
  const appConfig = parseYaml(raw) as { modules: Array<string | { module: string }>} | null;
  const modulesList = (appConfig?.modules ?? []).map(m => (typeof m === 'string' ? m : m.module));

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

  const domainGen = new DomainModelGenerator();
  const valGen = new ValidationGenerator();
  const svcGen = new ServiceGenerator();
  const ctrlGen = new ControllerGenerator();
  const storeGen = new StoreGenerator();

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

    const moduleDir = path.dirname(moduleYamlPath);

    // Infer outputs
    const domainOut = path.join(moduleDir, 'domain', 'entities');
    const appOut = path.join(moduleDir, 'application');
    const infraOut = path.join(moduleDir, 'infrastructure');

    // Generate in-memory
    const nextDomain = domainGen.generateFromYamlFile(moduleYamlPath);
    const nextValidations = valGen.generateFromYamlFile(moduleYamlPath);
    const nextServices = svcGen.generateFromYamlFile(moduleYamlPath);
    const nextControllers = ctrlGen.generateFromYamlFile(moduleYamlPath);
    const nextStores = storeGen.generateFromYamlFile(moduleYamlPath);

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

    Object.entries(nextDomain).forEach(([entity, code]) => consider(path.join(domainOut, `${entity}.ts`), code));
    Object.entries(nextValidations).forEach(([entity, code]) =>
      consider(path.join(appOut, 'validation', `${entity}Validation.ts`), code)
    );
    Object.entries(nextServices).forEach(([entity, code]) =>
      consider(path.join(appOut, 'services', `${entity}Service.ts`), code)
    );
    Object.entries(nextControllers).forEach(([entity, code]) =>
      consider(path.join(infraOut, 'controllers', `${entity}Controller.ts`), code)
    );
    Object.entries(nextStores).forEach(([entity, code]) => consider(path.join(infraOut, 'stores', `${entity}Store.ts`), code));
  });

  const commitsDir = ensureCommitsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const commitFile = path.join(commitsDir, `commit-${timestamp}.json`);
  fs.writeFileSync(commitFile, JSON.stringify({ createdAt: new Date().toISOString(), files: diffs }, null, 2));

  // eslint-disable-next-line no-console
  console.log(colors.green(`Saved diff summary with ${diffs.length} modified file(s) to ${path.relative(process.cwd(), commitFile)}`));
}

