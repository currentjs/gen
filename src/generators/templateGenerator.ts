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
  setAvailableModels,
  setRelationshipContext,
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

type ActionConfig = {
  handlers: string[];
};

type ApiConfig = {
  prefix?: string;
  endpoints?: EndpointConfig[];
  model?: string;
};

type ModuleConfig = {
  models?: ModelConfig[];
  api?: ApiConfig | ApiConfig[];
  routes?: RoutesConfig | RoutesConfig[];
  actions?: Record<string, ActionConfig>;
};

type AppConfig =
  | { modules: Record<string, ModuleConfig> }
  | ModuleConfig;


export class TemplateGenerator {
  /**
   * Helper method to infer model from action handlers
   */
  private inferModelFromAction(action: string, moduleConfig: ModuleConfig): ModelConfig | null {
    if (!moduleConfig.actions || !moduleConfig.actions[action]) {
      return null;
    }

    const handlers = moduleConfig.actions[action].handlers;
    if (!handlers || handlers.length === 0) {
      return null;
    }

    // Get the first handler and extract model name
    const firstHandler = handlers[0];
    const parts = firstHandler.split(':');
    if (parts.length < 2) {
      return null;
    }

    const modelName = parts[0];
    const model = moduleConfig.models?.find(m => 
      m.name === modelName || m.name.toLowerCase() === modelName.toLowerCase()
    );

    return model || null;
  }

  /**
   * Find the actual API endpoint path for a given action and model
   */
  private findApiEndpointPath(action: string, modelName: string, moduleConfig: ModuleConfig): string | null {
    if (!moduleConfig.api) {
      return null;
    }

    // Map web route actions to API operation types
    const actionMap: Record<string, string[]> = {
      'empty': ['create'],  // empty form -> create operation
      'create': ['create'],
      'update': ['update'],
      'delete': ['delete'],
      'list': ['list'],
      'get': ['get', 'update']  // get can be for detail view or edit form
    };

    // Get possible API action names to look for
    const searchActions = actionMap[action] || [action];

    // Also check if there's a specific action defined in the actions section that handles this model
    if (moduleConfig.actions) {
      for (const [actionName, actionConfig] of Object.entries(moduleConfig.actions)) {
        if (actionConfig.handlers && actionConfig.handlers.length > 0) {
          const firstHandler = actionConfig.handlers[0];
          const parts = firstHandler.split(':');
          const handlerModel = parts[0];
          
          // If this action's handler targets our model, include it in search
          if (handlerModel === modelName || handlerModel.toLowerCase() === modelName.toLowerCase()) {
            // If it's a default handler, get the operation type
            if (parts.length === 3 && parts[1] === 'default') {
              const operation = parts[2]; // e.g., 'create', 'list', etc.
              if (searchActions.includes(operation)) {
                searchActions.push(actionName);
              }
            }
          }
        }
      }
    }

    // Support both single api object and array
    const apiConfigs = Array.isArray(moduleConfig.api) ? moduleConfig.api : [moduleConfig.api];

    for (const apiConfig of apiConfigs) {
      if (!apiConfig.endpoints) continue;

      // Look for an endpoint with matching action
      for (const endpoint of apiConfig.endpoints) {
        if (!searchActions.includes(endpoint.action)) continue;

        // Check if this endpoint's model matches (explicit or default)
        const endpointModel = endpoint.model || apiConfig.model || (moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : null);
        
        if (endpointModel === modelName || endpointModel?.toLowerCase() === modelName.toLowerCase()) {
          // Found a match - construct the full path
          const prefix = (apiConfig.prefix || `/api/${modelName.toLowerCase()}`).replace(/\/$/, '');
          const path = endpoint.path || '';
          // Return full path without trailing slash
          return `${prefix}${path}`.replace(/\/$/, '');
        }
      }
    }

    return null;
  }

  /**
   * Build relationship context for finding create routes and list API endpoints
   */
  private buildRelationshipContext(moduleConfig: ModuleConfig): void {
    const routePaths = new Map<string, string>();
    const apiPaths = new Map<string, string>();

    // Build route paths for create actions
    const routeConfigs = moduleConfig.routes 
      ? (Array.isArray(moduleConfig.routes) ? moduleConfig.routes : [moduleConfig.routes])
      : [];

    for (const routeConfig of routeConfigs) {
      const prefix = (routeConfig.prefix || '').replace(/\/$/, '');
      const configModel = routeConfig.model || (moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : null);

      for (const endpoint of routeConfig.endpoints || []) {
        const endpointModel = endpoint.model || configModel;
        if (!endpointModel) continue;

        // Look for create or empty actions (both lead to create forms)
        if (endpoint.action === 'empty' || endpoint.action === 'create') {
          const fullPath = `${prefix}${endpoint.path}`;
          // Store only if we haven't found a path for this model yet, or if this is more specific
          if (!routePaths.has(endpointModel) || endpoint.action === 'empty') {
            routePaths.set(endpointModel, fullPath);
          }
        }
      }
    }

    // Build API paths for list actions
    const apiConfigs = moduleConfig.api
      ? (Array.isArray(moduleConfig.api) ? moduleConfig.api : [moduleConfig.api])
      : [];

    for (const apiConfig of apiConfigs) {
      const prefix = (apiConfig.prefix || '').replace(/\/$/, '');
      const configModel = apiConfig.model || (moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : null);

      for (const endpoint of apiConfig.endpoints || []) {
        const endpointModel = endpoint.model || configModel;
        if (!endpointModel) continue;

        // Look for list actions
        if (endpoint.action === 'list' || endpoint.action === 'getOwner' || endpoint.action.toLowerCase().includes('list')) {
          const fullPath = `${prefix}${endpoint.path || ''}`;
          // Store only if we haven't found a path for this model yet
          if (!apiPaths.has(endpointModel)) {
            apiPaths.set(endpointModel, fullPath);
          }
        }
      }
    }

    setRelationshipContext({ routePaths, apiPaths });
  }

  /**
   * Generate templates for a single routes configuration
   */
  private generateForRoutesConfig(
    routesConfig: RoutesConfig, 
    moduleConfig: ModuleConfig, 
    seenLayouts: Set<string>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (!moduleConfig.models || moduleConfig.models.length === 0) return result;

    // Set available models for relationship detection in view templates
    const modelNames = moduleConfig.models.map(m => m.name);
    setAvailableModels(modelNames);

    // Build context for relationship field paths
    this.buildRelationshipContext(moduleConfig);

    // Get top-level model for this routes config
    const topLevelModelName = routesConfig.model || moduleConfig.models[0].name;
    const topLevelModel = moduleConfig.models.find(m => m.name === topLevelModelName) || moduleConfig.models[0];

    const defaultEntityName = topLevelModel.name || 'Item';
    const defaultEntityLower = defaultEntityName.toLowerCase();
    const basePath = (routesConfig.prefix || `/${defaultEntityLower}`).replace(/\/$/, '');
    const strategy = (routesConfig.strategy && Array.isArray(routesConfig.strategy) && routesConfig.strategy.length > 0)
      ? routesConfig.strategy
      : ['back', 'toast'];

    for (const ep of routesConfig.endpoints || []) {
      if (!ep.view) continue;
      
      // Determine which model to use for this endpoint (Option A)
      let model: ModelConfig;
      let entityName: string;
      let entityLower: string;
      let fields: FieldConfig[];
      let apiBase: string;

      if (ep.model) {
        // 1. Use endpoint-specific model if provided
        const endpointModel = moduleConfig.models.find(m => m.name === ep.model);
        if (endpointModel) {
          model = endpointModel;
          entityName = model.name;
          entityLower = entityName.toLowerCase();
          fields = model.fields || [];
          // Find actual API endpoint or use default
          apiBase = this.findApiEndpointPath(ep.action, entityName, moduleConfig) || `/api/${entityLower}`;
        } else {
          // Fallback to top-level model if specified model not found
          model = topLevelModel;
          entityName = defaultEntityName;
          entityLower = defaultEntityLower;
          fields = model.fields || [];
          apiBase = this.findApiEndpointPath(ep.action, entityName, moduleConfig) || `/api/${entityLower}`;
        }
      } else {
        // 2. Try to infer model from action handler
        const inferredModel = this.inferModelFromAction(ep.action, moduleConfig);
        if (inferredModel) {
          model = inferredModel;
          entityName = model.name;
          entityLower = entityName.toLowerCase();
          fields = model.fields || [];
          // Find actual API endpoint or use default
          apiBase = this.findApiEndpointPath(ep.action, entityName, moduleConfig) || `/api/${entityLower}`;
        } else {
          // 3. Use top-level model as fallback
          model = topLevelModel;
          entityName = defaultEntityName;
          entityLower = defaultEntityLower;
          fields = model.fields || [];
          apiBase = this.findApiEndpointPath(ep.action, entityName, moduleConfig) || `/api/${entityLower}`;
        }
      }

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

  /**
   * Generate templates for a module (handles both single routes object and array)
   */
  private generateForModule(moduleConfig: ModuleConfig, moduleDir: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (!moduleConfig.routes || !moduleConfig.models || moduleConfig.models.length === 0) {
      return result;
    }

    const seenLayouts = new Set<string>();

    // Support both single routes object and array (Option D)
    const routesArray = Array.isArray(moduleConfig.routes) 
      ? moduleConfig.routes 
      : [moduleConfig.routes];

    for (const routesConfig of routesArray) {
      const templates = this.generateForRoutesConfig(routesConfig, moduleConfig, seenLayouts);
      Object.assign(result, templates);
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

