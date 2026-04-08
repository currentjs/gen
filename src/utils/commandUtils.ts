/**
 * Shared command infrastructure: app config loading, module filtering, generator creation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { DomainLayerGenerator } from '../generators/domainLayerGenerator';
import { DtoGenerator } from '../generators/dtoGenerator';
import { UseCaseGenerator } from '../generators/useCaseGenerator';
import { ServiceGenerator } from '../generators/serviceGenerator';
import { ControllerGenerator } from '../generators/controllerGenerator';
import { StoreGenerator } from '../generators/storeGenerator';
import { TemplateGenerator } from '../generators/templateGenerator';
import { normalizeIdentifierType } from '../types/configTypes';

export interface ModuleEntry {
  path: string;
  database?: string;
  styling?: string;
  identifiers?: string;
}

export interface GlobalConfig {
  database?: string;
  styling?: string;
  identifiers?: string;
}

export interface AppConfig {
  providers?: Record<string, string>;
  config?: GlobalConfig;
  modules: Record<string, ModuleEntry>;
}

const DEFAULT_DATABASE = 'mysql';
const DEFAULT_STYLING = 'bootstrap';
const DEFAULT_IDENTIFIERS = 'numeric';

export function loadAppConfig(yamlPath: string): AppConfig {
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { modules: {} };
  }
  const modules = parsed.modules && typeof parsed.modules === 'object' && !Array.isArray(parsed.modules)
    ? parsed.modules
    : {};
  return {
    providers: parsed.providers,
    config: parsed.config,
    modules
  };
}

export function getModuleList(config: AppConfig): string[] {
  if (!config.modules || typeof config.modules !== 'object') return [];
  return Object.values(config.modules).map((e: ModuleEntry) => e.path);
}

export interface ModuleEntryResolved {
  name: string;
  path: string;
  database: string;
  styling: string;
  identifiers: import('../types/configTypes').IdentifierType;
}

export function getModuleEntries(config: AppConfig): ModuleEntryResolved[] {
  if (!config.modules || typeof config.modules !== 'object') return [];
  const global = config.config || {};
  const database = global.database ?? DEFAULT_DATABASE;
  const styling = global.styling ?? DEFAULT_STYLING;
  const rawIdentifiers = global.identifiers ?? DEFAULT_IDENTIFIERS;
  const identifiers = normalizeIdentifierType(rawIdentifiers);
  const globalConfig = { database, styling, identifiers };
  return Object.entries(config.modules).map(([name, entry]) => ({
    name,
    path: entry.path,
    database: entry.database ?? globalConfig.database,
    styling: entry.styling ?? globalConfig.styling,
    identifiers: normalizeIdentifierType(entry.identifiers ?? globalConfig.identifiers)
  }));
}

export function shouldIncludeModule(moduleYamlRel: string, moduleName?: string): boolean {
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
}

export function createGenerators(): {
  domainGen: DomainLayerGenerator;
  dtoGen: DtoGenerator;
  useCaseGen: UseCaseGenerator;
  serviceGen: ServiceGenerator;
  controllerGen: ControllerGenerator;
  templateGen: TemplateGenerator;
  storeGen: StoreGenerator;
} {
  return {
    domainGen: new DomainLayerGenerator(),
    dtoGen: new DtoGenerator(),
    useCaseGen: new UseCaseGenerator(),
    serviceGen: new ServiceGenerator(),
    controllerGen: new ControllerGenerator(),
    templateGen: new TemplateGenerator(),
    storeGen: new StoreGenerator()
  };
}
