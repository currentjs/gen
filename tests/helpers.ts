import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { ModuleConfig } from '../src/types/configTypes';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');

export function loadFixture(name: string): ModuleConfig {
  const raw = fs.readFileSync(path.join(fixturesDir, name), 'utf8');
  return parseYaml(raw) as ModuleConfig;
}

export function getCode(result: Record<string, unknown>, key: string): string {
  const entry = result[key];
  return typeof entry === 'string' ? entry : (entry as { code?: string })?.code ?? '';
}

export function getAllCodeStrings(result: Record<string, { code: string; type?: string } | string>): string {
  return Object.values(result)
    .map((v) => (typeof v === 'string' ? v : v?.code ?? ''))
    .join('\n');
}
