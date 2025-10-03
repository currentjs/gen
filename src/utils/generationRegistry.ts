import * as fs from 'fs';
import * as path from 'path';
import { COMMON_FILES } from './constants';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { tryApplyCommitsToGenerated, type DiffHunk } from './commitUtils';
import { colors } from './colors';

type RegistryEntry = {
  hash: string;
  updatedAt: string;
  // Optional latest hunk diff snapshot (non-commit log)
  diffFormat?: 'hunks-v1';
  diffBaseHash?: string;
  diffResultHash?: string;
  diffHunks?: DiffHunk[];
  diffUpdatedAt?: string;
};

type RegistryData = Record<string, RegistryEntry>;

let projectRootDir: string | null = null;

export function initGenerationRegistry(rootDir: string): void {
  projectRootDir = rootDir;
}

function getRegistryFilePath(): string {
  if (!projectRootDir) {
    throw new Error('Generation registry is not initialized. Call initGenerationRegistry(rootDir) first.');
  }
  // Store at project root as registry.json
  return path.join(projectRootDir, COMMON_FILES.REGISTRY_JSON);
}

export function computeContentHash(contents: string): string {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

export function loadRegistry(): RegistryData {
  const file = getRegistryFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as RegistryData;
    return data || {};
  } catch {
    return {};
  }
}

export function saveRegistry(data: RegistryData): void {
  const file = getRegistryFilePath();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getStoredHash(filePath: string): string | undefined {
  const registry = loadRegistry();
  const root = projectRootDir || process.cwd();
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  // Prefer relative key; fall back to absolute for backward compatibility
  return registry[rel]?.hash ?? registry[abs]?.hash;
}

export function updateStoredHash(filePath: string, hash: string): void {
  const registry = loadRegistry();
  const root = projectRootDir || process.cwd();
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  // Write only relative key
  const prev = registry[rel] || {};
  registry[rel] = { ...prev, hash, updatedAt: new Date().toISOString() } as RegistryEntry;
  // Clean old absolute key if present
  if (registry[abs]) {
    delete registry[abs];
  }
  saveRegistry(registry);
}

export function updateStoredHunks(
  filePath: string,
  hunks: DiffHunk[],
  baseHash?: string,
  resultHash?: string
): void {
  const registry = loadRegistry();
  const root = projectRootDir || process.cwd();
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  const prev = registry[rel] || ({} as RegistryEntry);
  registry[rel] = {
    ...prev,
    diffFormat: 'hunks-v1',
    diffHunks: hunks,
    diffBaseHash: baseHash,
    diffResultHash: resultHash,
    diffUpdatedAt: new Date().toISOString()
  };
  // cleanup old absolute key if present
  if (registry[abs]) delete registry[abs];
  saveRegistry(registry);
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise(resolve => rl.question(`${question} [y/N]: `, resolve));
  rl.close();
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

export async function writeGeneratedFile(
  filePath: string,
  contents: string,
  options?: { force?: boolean; silent?: boolean; skipOnConflict?: boolean }
): Promise<'written' | 'skipped' | 'unchanged'> {
  const force = options?.force === true;
  const silent = options?.silent === true;
  const skipOnConflict = options?.skipOnConflict === true;
  const abs = path.resolve(filePath);
  const newHash = computeContentHash(contents);

  const exists = fs.existsSync(abs);
  if (!exists) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    updateStoredHash(abs, newHash);
    if (!silent) console.log(colors.blue(`[V] Generated ${path.relative(projectRootDir || process.cwd(), abs)}`));
    return 'written';
  }

  const storedHash = getStoredHash(abs);
  const currentContent = fs.readFileSync(abs, 'utf8');
  const currentHash = computeContentHash(currentContent);

  if (currentHash === newHash) {
    // Nothing to do
    return 'unchanged';
  }

  // If we have a stored hash and it matches current, safe to overwrite
  const isUserModified = !storedHash || storedHash !== currentHash;

  if (isUserModified && !force) {
    const rel = path.relative(projectRootDir || process.cwd(), abs);
    // Try commits auto-apply path
    const applied = tryApplyCommitsToGenerated(abs, contents);
    if (applied.applied) {
      fs.writeFileSync(abs, applied.content);
      updateStoredHash(abs, newHash);
      if (!silent) console.log(colors.cyan(`Updated (with commits) ${rel}`));
      return 'written';
    }

    if (skipOnConflict) {
      if (!silent) console.log(colors.yellow(`Skipped ${rel}`));
      return 'skipped';
    }
    const overwrite = await promptYesNo(`File modified since last generation: ${rel}. Overwrite?`);
    if (!overwrite) {
      if (!silent) console.log(colors.yellow(`Skipped ${rel}`));
      return 'skipped';
    }
  }

  fs.writeFileSync(abs, contents);
  updateStoredHash(abs, newHash);
  if (!silent) console.log(colors.blue(`Updated ${path.relative(projectRootDir || process.cwd(), abs)}`));
  return 'written';
}

export function ensureCommitsDir(): string {
  if (!projectRootDir) {
    throw new Error('Generation registry is not initialized. Call initGenerationRegistry(rootDir) first.');
  }
  // Store commits at project root/commits
  const commitsDir = path.join(projectRootDir, 'commits');
  fs.mkdirSync(commitsDir, { recursive: true });
  return commitsDir;
}
