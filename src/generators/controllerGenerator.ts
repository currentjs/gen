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
}

interface ApiConfig {
  prefix: string;
  endpoints: EndpointConfig[];
}

interface RoutesConfig {
  prefix: string;
  endpoints: EndpointConfig[];
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

  private generateMethodImplementation(action: string, entityName: string, hasUserParam: boolean): string {
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
    kind: 'api' | 'web'
  ): string {
    const methodName = kind === 'web' ? this.getWebMethodName(endpoint) : this.getHttpMethodName(endpoint.method, endpoint.action);
    const httpDecorator = kind === 'web' ? 'Get' : this.getHttpDecorator(endpoint.method);
    const needsUser = this.needsUserParam(roles);
    const methodImplementation = this.generateMethodImplementation(endpoint.action, entityName, needsUser);
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

  private generateController(
    moduleName: string,
    moduleConfig: ModuleConfig,
    hasGlobalPermissions: boolean,
    kind: 'api' | 'web'
  ): string {
    if (!moduleConfig.models || moduleConfig.models.length === 0) {
      return '';
    }
    const isApi = kind === 'api';
    const cfgRaw = isApi ? moduleConfig.api : moduleConfig.routes;
    let cfg = cfgRaw;
    if (!isApi) {
      // Ensure sensible defaults for Web routes: list, detail, create (empty), edit (get)
      const entityName = moduleConfig.models[0].name;
      const entityLower = entityName.toLowerCase();
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

    const entityName = moduleConfig.models[0].name;
    const entityLower = entityName.toLowerCase();
    const controllerBase = (cfg.prefix || `/${isApi ? 'api/' : ''}${entityLower}`).replace(/\/$/, '');
    const actionPermissions = this.getActionPermissions(moduleName, moduleConfig);
    const hasPermissions = hasGlobalPermissions && !!(moduleConfig.permissions && moduleConfig.permissions.length > 0);

    const controllerMethods = (cfg.endpoints || [])
      .filter(endpoint => {
        const roles = actionPermissions[endpoint.action] || [];
        return this.shouldGenerateMethod(endpoint.action, roles);
      })
      .map(endpoint => {
        const roles = actionPermissions[endpoint.action] || [];
        return this.generateControllerMethod(endpoint, entityName, roles, hasPermissions, kind);
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

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;

    const result: Record<string, string> = {};
    const hasGlobalPermissions = this.hasPermissions(config);

    if ((config as any).modules) {
      Object.entries((config as any).modules as Record<string, ModuleConfig>).forEach(([moduleName, moduleConfig]) => {
        const entityName = moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : 'Module';
        const apiControllerCode = this.generateController(moduleName, moduleConfig, hasGlobalPermissions, 'api');
        if (apiControllerCode) result[`${entityName}Api`] = apiControllerCode;
        const webControllerCode = this.generateController(moduleName, moduleConfig, hasGlobalPermissions, 'web');
        if (webControllerCode) result[`${entityName}Web`] = webControllerCode;
      });
    } else {
      const moduleConfig = config as ModuleConfig;
      const moduleName = moduleConfig.models && moduleConfig.models[0] ? moduleConfig.models[0].name : 'Module';
      const apiControllerCode = this.generateController(moduleName, moduleConfig, hasGlobalPermissions, 'api');
      if (apiControllerCode) result[`${moduleName}Api`] = apiControllerCode;
      const webControllerCode = this.generateController(moduleName, moduleConfig, hasGlobalPermissions, 'web');
      if (webControllerCode) result[`${moduleName}Web`] = webControllerCode;
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

