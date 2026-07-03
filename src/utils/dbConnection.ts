import * as fs from 'fs';
import * as path from 'path';
import { loadAppConfig } from './commandUtils';
import { colors } from './colors';

/**
 * Parse a .env file into a key/value map.
 * Handles:
 *  - Blank lines and lines starting with # (ignored)
 *  - Values wrapped in single or double quotes (quotes stripped)
 *  - Values that are JSON objects (common for connection config)
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const result: Record<string, string> = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export interface DbConnectionInfo {
  providerInstance: any;
  dbType: string;
}

/**
 * Load the provider class, parse connection config from env, and return an
 * uninitialised provider instance plus the dbType string.
 *
 * Connection config is read from the env var named after the uppercased
 * provider key (e.g. MYSQL or POSTGRES).  The value must be a JSON object.
 * The .env file in the project root is merged with process.env; process.env
 * takes precedence.
 */
export function loadDbConnectionInfo(appYamlPath: string): DbConnectionInfo {
  const appConfig = loadAppConfig(appYamlPath);
  const projectRoot = path.dirname(appYamlPath);

  const dbType = appConfig.config?.database ?? 'mysql';
  const providerPackage = appConfig.providers?.[dbType];
  if (!providerPackage) {
    throw new Error(
      `No provider configured for database "${dbType}" in app.yaml. ` +
      `Add a "providers.${dbType}" entry, e.g. "@currentjs/provider-${dbType}".`
    );
  }

  // Merge .env file values under process.env (process.env wins on collision)
  const envFilePath = path.join(projectRoot, '.env');
  const envVars = parseEnvFile(envFilePath);

  const envKey = dbType.toUpperCase();
  const rawConfig = process.env[envKey] ?? envVars[envKey];
  if (!rawConfig) {
    throw new Error(
      `No connection configuration found. Set the ${envKey} environment variable ` +
      `(or add it to .env) as a JSON object:\n` +
      `  ${envKey}='{"host":"localhost","port":3306,"user":"root","password":"secret","database":"myapp"}'`
    );
  }

  let connectionConfig: any;
  try {
    connectionConfig = JSON.parse(rawConfig);
  } catch {
    throw new Error(
      `Failed to parse ${envKey} as JSON. ` +
      `Expected a JSON object like: {"host":"localhost","user":"root","password":"secret","database":"myapp"}`
    );
  }

  // Dynamically require the provider package from the project's own node_modules
  const providerModulePath = path.join(projectRoot, 'node_modules', providerPackage);
  if (!fs.existsSync(providerModulePath)) {
    throw new Error(
      `Provider package "${providerPackage}" not found at:\n  ${providerModulePath}\n` +
      `Run "npm install" in your project directory first.`
    );
  }

  let providerModule: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    providerModule = require(providerModulePath);
  } catch (err) {
    throw new Error(
      `Failed to load provider package "${providerPackage}": ` +
      (err instanceof Error ? err.message : String(err))
    );
  }

  // Resolve class name: ProviderMysql, ProviderPostgres, or generic capitalisation
  const className =
    dbType === 'mysql' ? 'ProviderMysql' :
    dbType === 'postgres' ? 'ProviderPostgres' :
    `Provider${dbType.charAt(0).toUpperCase()}${dbType.slice(1)}`;

  const ProviderClass = providerModule[className] ?? providerModule.default;
  if (typeof ProviderClass !== 'function') {
    throw new Error(
      `Could not find provider class "${className}" in package "${providerPackage}". ` +
      `Available exports: ${Object.keys(providerModule).join(', ')}`
    );
  }

  const providerInstance = new ProviderClass(connectionConfig);
  return { providerInstance, dbType };
}

/**
 * Connect to the database, run `fn`, then disconnect — even on error.
 */
export async function withDatabaseConnection(
  appYamlPath: string,
  fn: (provider: any, dbType: string) => Promise<void>
): Promise<void> {
  const { providerInstance, dbType } = loadDbConnectionInfo(appYamlPath);
  // eslint-disable-next-line no-console
  console.log(colors.gray(`   Connecting to ${dbType} database...`));
  await providerInstance.init();
  // eslint-disable-next-line no-console
  console.log(colors.green(`   ✓ Connected`));
  try {
    await fn(providerInstance, dbType);
  } finally {
    try {
      await providerInstance.shutdown();
    } catch {
      // ignore shutdown errors
    }
    // eslint-disable-next-line no-console
    console.log(colors.gray(`   Connection closed`));
  }
}
