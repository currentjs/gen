import * as fs from 'fs';
import * as path from 'path';
import { COMMON_FILES } from './constants';

export function resolveYamlPath(provided?: string): string {
  const candidate = provided ?? COMMON_FILES.APP_YAML;
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
  if (!fs.existsSync(abs)) {
    throw new Error(`YAML config not found at ${abs}. Run this command from your project root or pass --yaml <path>.`);
  }
  return abs;
}

export function resolveOutDir(provided?: string, defaultDir: string = 'src/generated'): string {
  const dir = provided ?? defaultDir;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeFileIfMissing(targetPath: string, contents: string): void {
  if (fs.existsSync(targetPath)) return;
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, contents);
}

export function fileExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

export function toAbsolute(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
}

