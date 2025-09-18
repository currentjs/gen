import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { controllerTemplates, controllerFileTemplate } from './templates/controllerTemplates';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { COMMON_FILES } from '../utils/constants';

interface EndpointConfig {
  method?: string;
  path: string;
  action: string;
  filters?: string[];
  view?: string;
  layout?: string;
  model?: string;
}

interface ApiConfig {
  prefix: string;
  endpoints: EndpointConfig[];
  model?: string;
}

interface RoutesConfig {
  prefix: string;
  endpoints: EndpointConfig[];
  model?: string;
}

interface ActionConfig {
  handlers: string[];
}

interface PermissionConfig {
  role: string;
  actions: string[];
}

interface ModelConfig {
  name: string;
  fields: any[];
}

type ModuleConfig = {
  models?: ModelConfig[];
  api?: ApiConfig;
  routes?: RoutesConfig;
  actions?: Record<string, ActionConfig>;
  permissions?: PermissionConfig[];
};

type AppConfig =
  | {
      modules: Record<string, ModuleConfig>;
    }
  | ModuleConfig;

export class ControllerGenerator {
  private hasPermissions(config: AppConfig): boolean {
    if ((config as any).modules) {
      return Object.values((config as any).modules as Record<string, ModuleConfig>).some(
        module => module.permissions && module.permissions.length > 0
      );
    }
    const module = config as ModuleConfig;
    return !!(module.permissions && module.permissions.length > 0);
  }

  private getActionPermissions(moduleName: string, moduleConfig: ModuleConfig): Record<string, string[]> {
    if (!moduleConfig.permissions || !moduleConfig.actions) {
      return {};
    }

    const actionPermissions: Record<string, string[]> = {};

    Object.keys(moduleConfig.actions).forEach(action => {
      actionPermissions[action] = [];
    });

    (moduleConfig.permissions || []).forEach(permission => {
      (permission.actions || []).forEach(action => {
        if (actionPermissions[action]) {
          actionPermissions[action].push(permission.role);
        }
      });
    });

    return actionPermissions;
  }

  private shouldGenerateMethod(action: string, roles: string[]): boolean {
    return !roles.includes('none');
  }

  private needsUserParam(roles: string[]): boolean {
    return roles.length > 0 && !roles.includes('all');
  }

  private getHttpMethodName(_httpMethod: string | undefined, action: string): string {
    return action;
  }

  private getHttpDecorator(httpMethod: string | undefined): string {
    switch ((httpMethod || 'GET').toUpperCase()) {
      case 'GET':
        return 'Get';
      case 'POST':
        return 'Post';
      case 'PUT':
        return 'Put';
      case 'PATCH':
        return 'Patch';
      case 'DELETE':
        return 'Delete';
      default:
        return 'Get';
    }
  }

  private getMethodCallParams(action: string, entityName?: string): string {
    const dtoType = entityName ? `${entityName}DTO` : 'any';
    switch (action) {
      case 'list':
        return 'page, limit';
      case 'get':
      case 'getById':
        return 'id';
      case 'create':
        return `context.request.body as ${dtoType}`;
      case 'update':
        return `id, context.request.body as ${dtoType}`;
      case 'delete':
        return 'id';
      default:
        return '/* custom params */';
    }
  }

  private generateParameterExtractions(action: string): string {
    switch (action) {
      case 'list':
        return `
    // Extract pagination from URL parameters
    const page = parseInt(context.request.parameters.page as string) || 1;
    const limit = parseInt(context.request.parameters.limit as string) || 10;`;
      
      case 'get':
      case 'getById':
      case 'update':
      case 'delete':
        return `
    const id = parseInt(context.request.parameters.id as string);
    if (isNaN(id)) {
      throw new Error('Invalid ID parameter');
    }`;
      
      case 'create':
        return ''; // No additional parameter extraction needed for create
      
      default:
        return '';
    }
  }

  private generateMethodImplementation(
    action: string, 
    entityName: string, 
    hasUserParam: boolean, 
    actions?: Record<string, ActionConfig>
  ): string {
    // Check if we have action handlers
    if (actions && actions[action] && actions[action].handlers) {
      const handlers = actions[action].handlers;
      const entityLower = entityName.toLowerCase();
      
      // Filter handlers that apply to this model
      const modelHandlers = handlers.filter(h => 
        h.startsWith(`${entityLower}:`) || h.startsWith(`${entityName}:`)
      );
      
      if (modelHandlers.length === 0) {
        return `// TODO: No valid handlers found for action ${action}. Use ${entityName}:default:${action} or ${entityName}:customMethodName format.`;
      }

      const userExtraction = hasUserParam ? controllerTemplates.userExtraction : '';
      const userParam = hasUserParam ? ', user' : '';

      // Generate parameter extraction based on action type
      const paramExtractions = this.generateParameterExtractions(action);
      
      // Generate step-by-step calls for each handler
      const handlerCalls = modelHandlers.map((handler, index) => {
        const parts = handler.split(':');
        let methodName: string;
        let params: string;
        
        if (parts.length === 3 && parts[1] === 'default') {
          // Format: modelname:default:action
          const actionName = parts[2];
          methodName = actionName === 'getById' ? 'get' : actionName; // Use 'get' instead of 'getById'
          
          // For default handlers, use extracted parameters
          params = this.getMethodCallParams(actionName, entityName) + userParam;
        } else if (parts.length === 2) {
          // Format: modelname:custommethod
          methodName = parts[1];
          
          // For custom handlers, pass result from previous handler (or null) and context
          const prevResult = index === 0 ? 'null' : `result${index}`;
          params = `${prevResult}, context${userParam}`;
        } else {
          return `// Invalid handler format: ${handler}`;
        }
        
        const isLast = index === modelHandlers.length - 1;
        const resultVar = isLast ? 'result' : `result${index + 1}`;
        
        return `const ${resultVar} = await this.${entityLower}Service.${methodName}(${params});`;
      }).join('\n    ');

      // For multiple handlers, return the last result
      const returnStatement = '\n    return result;';

      return `${userExtraction}${paramExtractions}
    ${handlerCalls}${returnStatement}`;
    }
    
    // Fallback to existing template lookup
    const template = controllerTemplates.methodImplementations[
      action as keyof typeof controllerTemplates.methodImplementations
    ];
    if (!template) {
      return `    // TODO: Implement ${action} method\n    return {} as any;`;
    }

    const userExtraction = hasUserParam ? controllerTemplates.userExtraction : '';
    const userParam = hasUserParam ? ', user' : '';

    return template
      .replace(/{{ENTITY_NAME}}/g, entityName)
      .replace(/{{ENTITY_LOWER}}/g, entityName.toLowerCase())
      .replace(/{{USER_EXTRACTION}}/g, userExtraction)
      .replace(/{{USER_PARAM}}/g, userParam);
  }

  private replaceTemplateVars(template: string, variables: Record<string, string | boolean | number>): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }

  private generateControllerMethod(
    endpoint: EndpointConfig,
    entityName: string,
    roles: string[],
    hasPermissions: boolean,
    kind: 'api' | 'web',
    actions?: Record<string, ActionConfig>
  ): string {
    const methodName = kind === 'web' ? this.getWebMethodName(endpoint) : this.getHttpMethodName(endpoint.method, endpoint.action);
    const httpDecorator = kind === 'web' ? 'Get' : this.getHttpDecorator(endpoint.method);
    const needsUser = this.needsUserParam(roles);
    const methodImplementation = this.generateMethodImplementation(endpoint.action, entityName, needsUser, actions);
    const returnType = this.getReturnType(endpoint.action, entityName);

    const renderDecorator = kind === 'web' && endpoint.view
      ? `\n  @Render("${endpoint.view}"${endpoint.layout ? `, "${endpoint.layout}"` : ', "main_view"'})`
      : '';

    const variables = {
      METHOD_NAME: methodName,
      HTTP_DECORATOR: httpDecorator,
      ENDPOINT_PATH: endpoint.path,
      METHOD_IMPLEMENTATION: methodImplementation,
      RETURN_TYPE: returnType,
      RENDER_DECORATOR: renderDecorator
    } as const;

    return this.replaceTemplateVars(controllerTemplates.controllerMethod, variables as any);
  }

  private getWebMethodName(endpoint: EndpointConfig): string {
    const base = this.getHttpMethodName(endpoint.method, endpoint.action);
    const suffix = this.getPathSuffix(endpoint.path);
    return `${base}${suffix}`;
  }

  private getPathSuffix(routePath: string): string {
    if (!routePath || routePath === '/') return 'Index';
    const segments = routePath.split('/').filter(Boolean);
    const parts = segments.map(seg => {
      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        return 'By' + name.charAt(0).toUpperCase() + name.slice(1);
      }
      const cleaned = seg.replace(/[^a-zA-Z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
      return cleaned || 'Index';
    });
    return parts.join('');
  }

  private getReturnType(action: string, entityName: string): string {
    switch (action) {
      case 'list':
        return `${entityName}[]`;
      case 'get':
      case 'create':
      case 'update':
      case 'empty':
        return entityName;
      case 'delete':
        return '{ success: boolean; message: string }';
      default:
        return 'any';
    }
  }

  private generateControllerForModel(
    model: ModelConfig,
    moduleName: string,
    moduleConfig: ModuleConfig,
    hasGlobalPermissions: boolean,
    kind: 'api' | 'web'
  ): string {
    const isApi = kind === 'api';
    const cfgRaw = isApi ? moduleConfig.api : moduleConfig.routes;
    let cfg = cfgRaw;
    
    const entityName = model.name;
    const entityLower = entityName.toLowerCase();

    // Determine if we should generate a controller for this model
    const configModel = cfg?.model || (moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : null);
    const topLevelMatches = !configModel || configModel === entityName || configModel.toLowerCase() === entityLower;
    
    // Also check if any endpoints specifically target this model
    const hasEndpointForThisModel = cfg?.endpoints?.some(endpoint => {
      const endpointModel = endpoint.model || configModel;
      return endpointModel === entityName || endpointModel?.toLowerCase() === entityLower;
    }) || false;

    const shouldGenerateForThisModel = topLevelMatches || hasEndpointForThisModel;

    if (!shouldGenerateForThisModel) {
      return '';
    }

    if (!isApi) {
      // Ensure sensible defaults for Web routes: list, detail, create (empty), edit (get)
      if (!cfgRaw || !cfgRaw.endpoints || cfgRaw.endpoints.length === 0) {
        cfg = {
          prefix: `/${entityLower}`,
          endpoints: [
            { path: '/', action: 'list', method: 'GET', view: `${entityLower}List` },
            { path: '/:id', action: 'get', method: 'GET', view: `${entityLower}Detail` },
            { path: '/create', action: 'empty', method: 'GET', view: `${entityLower}Create` },
            { path: '/:id/edit', action: 'get', method: 'GET', view: `${entityLower}Update` }
          ]
        } as RoutesConfig;
      } else {
        // Force GET for all web endpoints; forms should submit to API using custom form handling
        cfg = {
          prefix: cfgRaw.prefix || `/${entityLower}`,
          endpoints: (cfgRaw.endpoints || []).map(e => ({ ...e, method: 'GET' }))
        } as RoutesConfig;
      }
    }
    if (!cfg) return '';

    const controllerBase = (cfg.prefix || `/${isApi ? 'api/' : ''}${entityLower}`).replace(/\/$/, '');
    const actionPermissions = this.getActionPermissions(moduleName, moduleConfig);
    const hasPermissions = hasGlobalPermissions && !!(moduleConfig.permissions && moduleConfig.permissions.length > 0);

    // Filter endpoints that apply to this model
    const modelEndpoints = (cfg.endpoints || []).filter(endpoint => {
      const endpointModel = endpoint.model || cfg?.model || (moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : null);
      return endpointModel === entityName || endpointModel?.toLowerCase() === entityLower;
    });

    const controllerMethods = modelEndpoints
      .filter(endpoint => {
        const roles = actionPermissions[endpoint.action] || [];
        return this.shouldGenerateMethod(endpoint.action, roles);
      })
      .map(endpoint => {
        const roles = actionPermissions[endpoint.action] || [];
        return this.generateControllerMethod(endpoint, entityName, roles, hasPermissions, kind, moduleConfig.actions);
      })
      .join('\n\n');

    const controllerClass = this.replaceTemplateVars(controllerTemplates.controllerClass, {
      CONTROLLER_NAME: `${entityName}${isApi ? 'ApiController' : 'WebController'}`,
      ENTITY_NAME: entityName,
      ENTITY_LOWER: entityLower,
      CONTROLLER_BASE: controllerBase,
      CONTROLLER_METHODS: controllerMethods
    } as any);

    return this.replaceTemplateVars(controllerFileTemplate, {
      ENTITY_NAME: entityName,
      JWT_IMPORT: '',
      CONTROLLER_CLASS: controllerClass
    });
  }

  private generateController(
    moduleName: string,
    moduleConfig: ModuleConfig,
    hasGlobalPermissions: boolean,
    kind: 'api' | 'web'
  ): string {
    // Legacy method for backward compatibility - use first model
    if (!moduleConfig.models || moduleConfig.models.length === 0) {
      return '';
    }
    return this.generateControllerForModel(moduleConfig.models[0], moduleName, moduleConfig, hasGlobalPermissions, kind);
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;

    const result: Record<string, string> = {};
    const hasGlobalPermissions = this.hasPermissions(config);

    if ((config as any).modules) {
      Object.entries((config as any).modules as Record<string, ModuleConfig>).forEach(([moduleName, moduleConfig]) => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          // Generate controllers for each model
          moduleConfig.models.forEach(model => {
            const apiControllerCode = this.generateControllerForModel(model, moduleName, moduleConfig, hasGlobalPermissions, 'api');
            if (apiControllerCode) result[`${model.name}Api`] = apiControllerCode;
            const webControllerCode = this.generateControllerForModel(model, moduleName, moduleConfig, hasGlobalPermissions, 'web');
            if (webControllerCode) result[`${model.name}Web`] = webControllerCode;
          });
        }
      });
    } else {
      const moduleName = 'Module';
      const moduleConfig = config as ModuleConfig;
      if (moduleConfig.models && moduleConfig.models.length > 0) {
        // Generate controllers for each model
        moduleConfig.models.forEach(model => {
          const apiControllerCode = this.generateControllerForModel(model, moduleName, moduleConfig, hasGlobalPermissions, 'api');
          if (apiControllerCode) result[`${model.name}Api`] = apiControllerCode;
          const webControllerCode = this.generateControllerForModel(model, moduleName, moduleConfig, hasGlobalPermissions, 'web');
          if (webControllerCode) result[`${model.name}Web`] = webControllerCode;
        });
      }
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string = COMMON_FILES.APP_YAML,
    outputDir: string = 'infrastructure',
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<string[]> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;
    const hasGlobalPermissions = this.hasPermissions(config);

    const controllers = this.generateFromYamlFile(yamlFilePath);
    const generatedControllerPaths: string[] = [];

    const controllersDir = path.join(outputDir, 'controllers');

    fs.mkdirSync(controllersDir, { recursive: true });

    for (const [moduleName, controllerCode] of Object.entries(controllers)) {
      const fileName = `${moduleName}Controller.ts`;
      const filePath = path.join(controllersDir, fileName);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, controllerCode, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      generatedControllerPaths.push(filePath);
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Controller files generated successfully!') + '\n');

    return generatedControllerPaths;
  }
}

