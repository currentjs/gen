import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { writeGeneratedFile } from '../utils/generationRegistry';
import {
  toFileNameFromTemplateName,
  renderListTemplate,
  renderDetailTemplate,
  renderCreateTemplate,
  renderUpdateTemplate,
  renderDeleteTemplate,
  renderLayoutTemplate,
} from './templates/viewTemplates';
import { colors } from '../utils/colors';

type EndpointConfig = {
  path: string;
  action: string;
  view?: string;
  layout?: string;
  model?: string;
};

type RoutesConfig = {
  prefix?: string;
  strategy?: string[];
  endpoints: EndpointConfig[];
  model?: string;
};

type FieldConfig = {
  name: string;
  type: string;
  required?: boolean;
  auto?: boolean;
  unique?: boolean;
  enum?: string[];
};

type ModelConfig = {
  name: string;
  fields?: FieldConfig[];
};

type ModuleConfig = {
  models?: ModelConfig[];
  routes?: RoutesConfig;
};

type AppConfig =
  | { modules: Record<string, ModuleConfig> }
  | ModuleConfig;


export class TemplateGenerator {
  private generateForModule(moduleConfig: ModuleConfig, moduleDir: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!moduleConfig.routes || !moduleConfig.models || moduleConfig.models.length === 0) return result;

    const entityName = moduleConfig.models[0].name || 'Item';
    const entityLower = entityName.toLowerCase();
    const basePath = (moduleConfig.routes.prefix || `/${entityLower}`).replace(/\/$/, '');
    const strategy = (moduleConfig.routes.strategy && Array.isArray(moduleConfig.routes.strategy) && moduleConfig.routes.strategy.length > 0)
      ? moduleConfig.routes.strategy
      : ['back', 'toast'];
    const apiBase = `/api/${entityLower}`;
    const fields = moduleConfig.models[0].fields || [];
    const seenLayouts = new Set<string>();

    for (const ep of moduleConfig.routes.endpoints || []) {
      if (!ep.view) continue;
      const tplName = ep.view;
      let content = '';
      switch (ep.action) {
        case 'list':
          content = renderListTemplate(entityName, tplName, basePath, fields, apiBase);
          break;
        case 'get':
          // If the path is an edit page or the template name suggests update, render the update form
          if (/\/edit$/i.test(ep.path) || /update$/i.test(tplName)) {
            content = renderUpdateTemplate(entityName, tplName, apiBase, fields, strategy, basePath);
          } else {
            content = renderDetailTemplate(entityName, tplName, fields);
          }
          break;
        case 'create':
          content = renderCreateTemplate(entityName, tplName, apiBase, fields, strategy, basePath);
          break;
        case 'update':
          content = renderUpdateTemplate(entityName, tplName, apiBase, fields, strategy, basePath);
          break;
        case 'empty':
          // treat as create form page without populated values
          content = renderCreateTemplate(entityName, tplName, apiBase, fields, strategy, basePath);
          break;
        case 'delete':
          content = renderDeleteTemplate(entityName, tplName, apiBase, strategy, basePath);
          break;
        default:
          content = `<!-- @template name="${tplName}" -->\n<pre>{{ JSON.stringify($root, null, 2) }}</pre>\n`;
      }
      result[tplName] = content;

      if (ep.layout && !seenLayouts.has(ep.layout)) {
        result[`__layout__::${ep.layout}`] = renderLayoutTemplate(ep.layout);
        seenLayouts.add(ep.layout);
      }
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, { file: string; contents: string }> {
    const raw = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(raw) as AppConfig;
    const results: Record<string, { file: string; contents: string }> = {};

    const addModule = (mod: ModuleConfig, moduleDir: string) => {
      const templates = this.generateForModule(mod, moduleDir);
      const viewsDir = path.join(moduleDir, 'views');
      for (const [name, contents] of Object.entries(templates)) {
        if (name.startsWith('__layout__::')) {
          const layoutName = name.substring('__layout__::'.length);
          const file = path.join(viewsDir, toFileNameFromTemplateName(layoutName));
          results[`layout:${layoutName}`] = { file, contents };
        } else {
          const file = path.join(viewsDir, toFileNameFromTemplateName(name));
          results[name] = { file, contents };
        }
      }
    };

    if ((config as any).modules) {
      const modules = (config as any).modules as Record<string, ModuleConfig>;
      for (const [key, mod] of Object.entries(modules)) {
        const moduleDir = path.dirname(yamlFilePath); // each entry is per-module yaml
        addModule(mod, moduleDir);
      }
    } else {
      const moduleDir = path.dirname(yamlFilePath);
      addModule(config as ModuleConfig, moduleDir);
    }
    return results;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    _outputDir: string | undefined,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const toWrite = this.generateFromYamlFile(yamlFilePath);
    for (const { file, contents } of Object.values(toWrite)) {
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(file, contents, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }
    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Template files generated successfully!') + '\n');
  }
}

