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

export interface AppConfig {
  modules: Array<string | { module: string }>;
  providers?: Record<string, string>;
  database?: string;
}

export function loadAppConfig(yamlPath: string): AppConfig {
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { modules: [] };
  }
  const modules = Array.isArray(parsed.modules) ? parsed.modules : [];
  return {
    modules,
    providers: parsed.providers,
    database: parsed.database
  };
}

export function getModuleList(config: AppConfig): string[] {
  return config.modules.map(m => (typeof m === 'string' ? m : m.module));
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
