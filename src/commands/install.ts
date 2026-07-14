import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { colors } from '../utils/colors';
import { ensureDir } from '../utils/cliUtils';
import {
  fetchRegistry,
  fetchManifestFiles,
  fetchText,
  readInstalledData,
  markInstalled,
  isNewerVersion,
  RegistryEntry,
} from '../utils/registryUtils';
import { promptYesNo, createRl } from '../utils/promptUtils';

// ─── Shared helpers ────────────────────────────────────────────────────────

async function downloadItemFiles(
  itemPath: string,
  destDir: string,
  entry: RegistryEntry,
): Promise<void> {
  const files = await fetchManifestFiles(itemPath);
  const baseUrl = `https://raw.githubusercontent.com/currentjs/registry/refs/heads/main/${itemPath}`;

  for (const file of files) {
    const fileUrl = baseUrl + file;
    const content = await fetchText(fileUrl);
    const dest = path.join(destDir, file);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content, 'utf8');
  }
}

async function checkForUpdate(
  category: 'modules' | 'providers',
  name: string,
  entry: RegistryEntry,
  cwd: string,
): Promise<'fresh' | 'update' | 'latest'> {
  const installed = readInstalledData(cwd);
  const existing = installed[category][name];
  if (!existing) return 'fresh';
  if (isNewerVersion(entry.version, existing.version)) return 'update';
  return 'latest';
}

// ─── Module installation ───────────────────────────────────────────────────

function registerModuleInAppYaml(cwd: string, name: string): void {
  const appYamlPath = path.join(cwd, 'app.yaml');
  let appConfig: any = { modules: {} };
  if (fs.existsSync(appYamlPath)) {
    try {
      appConfig = parseYaml(fs.readFileSync(appYamlPath, 'utf8')) || { modules: {} };
    } catch {
      appConfig = { modules: {} };
    }
  }
  if (!appConfig.modules || typeof appConfig.modules !== 'object' || Array.isArray(appConfig.modules)) {
    appConfig.modules = {};
  }

  const moduleKey = name.charAt(0).toUpperCase() + name.slice(1);
  const moduleYamlRel = path.posix.join('src', 'modules', name, `${name.toLowerCase()}.yaml`);

  if (appConfig.modules[moduleKey]?.path !== moduleYamlRel) {
    appConfig.modules[moduleKey] = { path: moduleYamlRel };
    fs.writeFileSync(appYamlPath, stringifyYaml(appConfig), 'utf8');
  }
}

export async function handleInstallModule(name?: string): Promise<void> {
  if (!name) {
    throw new Error('Module name is required: currentjs install module <name>');
  }

  console.log(colors.cyan('Fetching registry…'));
  const registry = await fetchRegistry();
  const modules = registry.registry.modules ?? {};
  const entry: RegistryEntry | undefined = modules[name] ?? modules[name.toLowerCase()] ?? modules[name.charAt(0).toUpperCase() + name.slice(1)];

  if (!entry) {
    const available = Object.keys(modules);
    if (available.length === 0) {
      throw new Error('No modules are available in the registry yet.');
    }
    throw new Error(
      `Module "${name}" not found in registry.\nAvailable: ${available.join(', ')}`,
    );
  }

  const cwd = process.cwd();
  const state = await checkForUpdate('modules', name, entry, cwd);

  if (state === 'latest') {
    console.log(colors.green(`Module "${name}" is already at the latest version (v${entry.version}).`));
    return;
  }

  if (state === 'update') {
    const installed = readInstalledData(cwd);
    const currentVersion = installed.modules[name]?.version ?? '?';
    const rl = createRl();
    const proceed = await promptYesNo(
      rl,
      `Module "${name}" v${currentVersion} is installed. Update to v${entry.version}?`,
      true,
    );
    rl.close();
    if (!proceed) {
      console.log(colors.yellow('Update cancelled.'));
      return;
    }
  }

  const destDir = path.join(cwd, 'src', 'modules', name);
  process.stdout.write(`  Downloading ${colors.bold(name)}… `);
  await downloadItemFiles(entry.path, destDir, entry);
  console.log(colors.green('done'));

  registerModuleInAppYaml(cwd, name);
  markInstalled(cwd, 'modules', name, entry.version);

  const action = state === 'update' ? 'updated' : 'installed';
  console.log('');
  console.log(colors.green(`Module "${name}" v${entry.version} ${action} successfully.`));
  console.log(colors.gray(`  Location: src/modules/${name}/`));
  console.log(colors.gray('  Registered in app.yaml'));
  console.log(colors.gray('  Run: currentjs generate'));
}

// ─── Provider installation ─────────────────────────────────────────────────

export async function handleInstallProvider(name?: string): Promise<void> {
  if (!name) {
    throw new Error('Provider name is required: currentjs install provider <name>');
  }

  console.log(colors.cyan('Fetching registry…'));
  const registry = await fetchRegistry();
  const providers = registry.registry.providers ?? {};
  const entry: RegistryEntry | undefined = providers[name] ?? providers[name.toLowerCase()] ?? providers[name.charAt(0).toUpperCase() + name.slice(1)];

  if (!entry) {
    const available = Object.keys(providers);
    if (available.length === 0) {
      throw new Error('No providers are available in the registry yet.');
    }
    throw new Error(
      `Provider "${name}" not found in registry.\nAvailable: ${available.join(', ')}`,
    );
  }

  const cwd = process.cwd();
  const state = await checkForUpdate('providers', name, entry, cwd);

  if (state === 'latest') {
    console.log(colors.green(`Provider "${name}" is already at the latest version (v${entry.version}).`));
    return;
  }

  if (state === 'update') {
    const installed = readInstalledData(cwd);
    const currentVersion = installed.providers[name]?.version ?? '?';
    const rl = createRl();
    const proceed = await promptYesNo(
      rl,
      `Provider "${name}" v${currentVersion} is installed. Update to v${entry.version}?`,
      true,
    );
    rl.close();
    if (!proceed) {
      console.log(colors.yellow('Update cancelled.'));
      return;
    }
  }

  const destDir = path.join(cwd, 'src', 'shared', 'providers', name);
  process.stdout.write(`  Downloading ${colors.bold(name)}… `);
  await downloadItemFiles(entry.path, destDir, entry);
  console.log(colors.green('done'));

  markInstalled(cwd, 'providers', name, entry.version);

  const action = state === 'update' ? 'updated' : 'installed';
  console.log('');
  console.log(colors.green(`Provider "${name}" v${entry.version} ${action} successfully.`));
  console.log(colors.gray(`  Location: src/shared/providers/${name}/`));
  console.log(colors.gray('  Wire it in app.yaml under "providers":'));
  console.log(colors.gray(`    ${name}: './src/shared/providers/${name}'`));
}
