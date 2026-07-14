import * as fs from 'fs';
import * as path from 'path';
import { REGISTRY } from './constants';
import { ensureDir } from './cliUtils';

// ─── Registry data types ───────────────────────────────────────────────────

export interface RegistryEntry {
  path: string;
  version: string;
  description?: string;
}

export interface RegistryData {
  registry: {
    'ai/skills': Record<string, RegistryEntry>;
    modules: Record<string, RegistryEntry>;
    providers: Record<string, RegistryEntry>;
  };
}

export interface InstalledEntry {
  version: string;
  installedAt: string;
}

export interface InstalledData {
  'ai/skills': Record<string, InstalledEntry>;
  modules: Record<string, InstalledEntry>;
  providers: Record<string, InstalledEntry>;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export async function fetchRegistry(): Promise<RegistryData> {
  const url = REGISTRY.BASE_URL + REGISTRY.INDEX;
  return fetchJson(url) as Promise<RegistryData>;
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  const content = await fetchText(url);
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, content, 'utf8');
}

/**
 * Fetch the manifest.json for a registry item and return the list of files.
 * Falls back to ['SKILL.md'] if manifest is missing.
 */
export async function fetchManifestFiles(itemPath: string): Promise<string[]> {
  const manifestUrl = REGISTRY.BASE_URL + itemPath + 'manifest.json';
  try {
    const manifest = await fetchJson(manifestUrl);
    if (Array.isArray(manifest.files)) {
      return manifest.files as string[];
    }
  } catch {
    // manifest missing — fall back
  }
  return ['SKILL.md'];
}

// ─── Installed version tracker ─────────────────────────────────────────────

export function readInstalledData(cwd: string): InstalledData {
  const filePath = path.join(cwd, REGISTRY.INSTALLED_FILE);
  if (!fs.existsSync(filePath)) {
    return { 'ai/skills': {}, modules: {}, providers: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as InstalledData;
  } catch {
    return { 'ai/skills': {}, modules: {}, providers: {} };
  }
}

export function writeInstalledData(cwd: string, data: InstalledData): void {
  const filePath = path.join(cwd, REGISTRY.INSTALLED_FILE);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function markInstalled(
  cwd: string,
  category: keyof InstalledData,
  name: string,
  version: string,
): void {
  const data = readInstalledData(cwd);
  data[category][name] = { version, installedAt: new Date().toISOString() };
  writeInstalledData(cwd, data);
}

/**
 * Compare two semver-like version strings.
 * Returns true if remoteVersion is strictly newer than localVersion.
 */
export function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const remote = parse(remoteVersion);
  const local = parse(localVersion);
  const len = Math.max(remote.length, local.length);
  for (let i = 0; i < len; i++) {
    const r = remote[i] ?? 0;
    const l = local[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}
