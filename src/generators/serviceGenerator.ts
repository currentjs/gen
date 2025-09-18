import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { serviceTemplates, serviceFileTemplate } from './templates/serviceTemplates';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { COMMON_FILES, PATH_PATTERNS } from '../utils/constants';

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
  actions?: Record<string, ActionConfig>;
  permissions?: PermissionConfig[];
};

type AppConfig =
  | {
      modules: Record<string, ModuleConfig>;
    }
  | ModuleConfig;

export class ServiceGenerator {
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

    // Initialize all actions with empty permissions
    Object.keys(moduleConfig.actions).forEach(action => {
      actionPermissions[action] = [];
    });

    // Fill in permissions for each action
    (moduleConfig.permissions || []).forEach(permission => {
      (permission.actions || []).forEach(action => {
        if (actionPermissions[action]) {
          actionPermissions[action].push(permission.role);
        }
      });
    });

    return actionPermissions;
  }

  private generatePermissionCheck(action: string, roles: string[], entityName: string): string {
    if (roles.length === 0 || roles.includes('all')) {
      return '';
    }

    if (roles.includes('none')) {
      return "    throw new Error('This action is not permitted');";
    }

    const nonOwnerRoles = roles.filter(role => !['all', 'none', 'owner'].includes(role));
    const rolesArray = nonOwnerRoles.map(role => `'${role}'`).join(', ');

    // Special-case: list action with owner → rely on store-level filtering; only enforce static role checks for other roles
    if (action === 'list' && roles.includes('owner')) {
      if (nonOwnerRoles.length === 0) {
        return '';
      }
      return serviceTemplates.permissionCheck
        .replace(/{{REQUIRED_ROLES}}/g, roles.join(', '))
        .replace(/{{ACTION_NAME}}/g, action)
        .replace(/{{ROLES_ARRAY}}/g, rolesArray);
    }

    // For resource-based owner permission (non-list), fetch resource first and verify ownership
    if (roles.includes('owner')) {
      const isResourceBased = ['get', 'update', 'delete'].includes(action);
      if (!isResourceBased) {
        // Not a resource-based action; fall back to static role checks only (if any non-owner roles)
        if (nonOwnerRoles.length === 0) {
          return '';
        }
        return serviceTemplates.permissionCheck
          .replace(/{{REQUIRED_ROLES}}/g, roles.join(', '))
          .replace(/{{ACTION_NAME}}/g, action)
          .replace(/{{ROLES_ARRAY}}/g, rolesArray);
      }
      const entityLower = entityName.toLowerCase();
      const resourceIdParam = this.getResourceIdForAction(action);
      const notFoundMessage = `${entityName} not found`;

      // If there are additional roles besides owner, allow them to bypass owner check
      const maybeRoleBypass = nonOwnerRoles.length > 0
        ? `    const allowedRoles = [${rolesArray}];
    if (allowedRoles.includes(user.role)) {
      // Explicit role allowed; skip owner check
    } else {
      const ${entityLower} = await this.${entityLower}Store.getById(${resourceIdParam});
      if (!${entityLower}) {
        throw new Error('${notFoundMessage}');
      }
      if ((${entityLower} as any).userId !== user.id) {
        throw new Error('You can only access your own resources');
      }
    }`
        : `    const ${entityLower} = await this.${entityLower}Store.getById(${resourceIdParam});
    if (!${entityLower}) {
      throw new Error('${notFoundMessage}');
    }
    if ((${entityLower} as any).userId !== user.id) {
      throw new Error('You can only access your own resources');
    }`;

      return maybeRoleBypass;
    }

    // Static role check for non-owner roles
    return serviceTemplates.permissionCheck
      .replace(/{{REQUIRED_ROLES}}/g, roles.join(', '))
      .replace(/{{ACTION_NAME}}/g, action)
      .replace(/{{ROLES_ARRAY}}/g, rolesArray);
  }

  private getResourceIdForAction(action: string): string {
    switch (action) {
      case 'get':
      case 'update':
      case 'delete':
        return 'id';
      default:
        return 'id';
    }
  }

  private generateMethodParams(action: string, entityName: string): string {
    const entityParam = `${entityName.toLowerCase()}Data`;
    switch (action) {
      case 'list':
        return 'page: number = 1, limit: number = 10';
      case 'get':
      case 'getById':
        return 'id: number';
      case 'create':
        return `${entityParam}: ${entityName}DTO`;
      case 'update':
        return `id: number, ${entityParam}: ${entityName}DTO`;
      case 'delete':
        return 'id: number';
      default:
        return '';
    }
  }

  private generateReturnType(action: string, entityName: string): string {
    switch (action) {
      case 'list':
        return `${entityName}[]`;
      case 'get':
      case 'getById':
      case 'create':
      case 'update':
        return entityName;
      case 'delete':
        return '{ success: boolean; message: string }';
      default:
        return 'void';
    }
  }

  private generateMethodImplementation(
    action: string,
    entityName: string,
    handlers: string[],
    moduleName: string,
    roles: string[],
    moduleConfig: ModuleConfig
  ): string {
    if (!handlers || handlers.length === 0) {
      return `// TODO: Implement ${action} method`;
    }

    const implementations: string[] = [];
    const entityLower = entityName.toLowerCase();

    handlers.forEach(handler => {
      // Handle new explicit format: modelname:default:action or modelname:custommethod
      if (handler.includes(':')) {
        const parts = handler.split(':');
        
        if (parts.length === 3 && parts[1] === 'default') {
          // Format: modelname:default:action
          const [modelName, , actionName] = parts;
          
          // Check if this handler applies to current model
          if (modelName.toLowerCase() === entityLower || modelName === entityName) {
            const template = serviceTemplates.defaultImplementations[
              actionName as keyof typeof serviceTemplates.defaultImplementations
            ];
            if (template) {
              let processedTemplate = template
                .replace(/{{ENTITY_NAME}}/g, entityName)
                .replace(/{{ENTITY_LOWER}}/g, entityLower);

              // Handle constructor args for create action
              if (actionName === 'create') {
                const constructorArgs = this.generateConstructorArgs(moduleConfig, entityName);
                processedTemplate = processedTemplate.replace(/{{CONSTRUCTOR_ARGS}}/g, constructorArgs);
              }

              // Handle setter calls for update action
              if (actionName === 'update') {
                const setterCalls = this.generateUpdateSetterCalls(moduleConfig, entityName);
                processedTemplate = processedTemplate.replace(/{{UPDATE_SETTER_CALLS}}/g, setterCalls);
              }

              // Special-case: list action with only owner role → fetch by userId
              if (actionName === 'list') {
                const onlyOwner = roles.length > 0 && roles.every(r => r === 'owner');
                if (onlyOwner) {
                  processedTemplate = `const ${entityLower}s = await this.${entityLower}Store.getAllByUserId(user.id, page, limit);\n    return ${entityLower}s;`;
                }
              }

              implementations.push(processedTemplate);
            } else {
              implementations.push(`// TODO: Implement default ${actionName} method for ${entityName}`);
            }
          } else {
            // Cross-model default call
            const targetModel = moduleConfig.models?.find(m => m.name.toLowerCase() === modelName.toLowerCase() || m.name === modelName);
            if (targetModel) {
              const targetServiceVar = `${targetModel.name.toLowerCase()}Service`;
              const customImpl = `// Cross-model call to ${targetModel.name}Service
    const result = await this.${targetServiceVar}.${actionName}(${this.getMethodCallParams(action)});
    return result;`;
              implementations.push(customImpl);
            } else {
              implementations.push(`// TODO: Model ${modelName} not found for handler ${handler}`);
            }
          }
        } else if (parts.length === 2) {
          // Format: modelname:custommethod  
          const [modelName, methodName] = parts;
          
          // Check if this handler applies to current model
          if (modelName.toLowerCase() === entityLower || modelName === entityName) {
            // Same model - this indicates a custom method should be implemented in this service
            implementations.push(`// TODO: Implement custom ${methodName} method for ${entityName}`);
          } else {
            // Cross-model custom call
            const targetModel = moduleConfig.models?.find(m => m.name.toLowerCase() === modelName.toLowerCase() || m.name === modelName);
            if (targetModel) {
              const targetServiceVar = `${targetModel.name.toLowerCase()}Service`;
              const customImpl = `// Cross-model call to ${targetModel.name}Service
    const result = await this.${targetServiceVar}.${methodName}(${this.getMethodCallParams(action)});
    return result;`;
              implementations.push(customImpl);
            } else {
              implementations.push(`// TODO: Model ${modelName} not found for handler ${handler}`);
            }
          }
        } else {
          implementations.push(`// TODO: Invalid handler format ${handler}. Use modelname:default:action or modelname:custommethod`);
        }
      } 
      else {
        implementations.push(`// TODO: Invalid handler format ${handler}. Use modelname:default:action or modelname:custommethod`);
      }
    });

    return implementations.join('\n    ');
  }

  private extractFunctionName(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName;
  }

  private getMethodCallParams(action: string): string {
    switch (action) {
      case 'list':
        return 'page, limit';
      case 'get':
        return 'id';
      case 'create':
        return 'userData';
      case 'update':
        return 'id, updates';
      case 'delete':
        return 'id';
      default:
        return '/* custom params */';
    }
  }

  private generateConstructorArgs(moduleConfig: ModuleConfig, entityName: string): string {
    if (!moduleConfig.models || moduleConfig.models.length === 0) {
      return '';
    }
    
    // Find the correct model by entityName instead of always using first model
    const model = moduleConfig.models.find(m => m.name === entityName) || moduleConfig.models[0];
    const entityLower = entityName.toLowerCase();
    
    return model.fields
      .filter(field => !field.auto && field.name !== 'id')
      .map(field => `${entityLower}Data.${field.name}`)
      .join(', ');
  }

  private generateUpdateSetterCalls(moduleConfig: ModuleConfig, entityName: string): string {
    if (!moduleConfig.models || moduleConfig.models.length === 0) {
      return '';
    }
    
    // Find the correct model by entityName instead of always using first model
    const model = moduleConfig.models.find(m => m.name === entityName) || moduleConfig.models[0];
    const entityLower = entityName.toLowerCase();
    
    return model.fields
      .filter(field => !field.auto && field.name !== 'id')
      .map(field => {
        const methodName = `set${field.name.charAt(0).toUpperCase() + field.name.slice(1)}`;
        return `if (${entityLower}Data.${field.name} !== undefined) {
      existing${entityName}.${methodName}(${entityLower}Data.${field.name});
    }`;
      })
      .join('\n    ');
  }

  private replaceTemplateVars(template: string, variables: Record<string, string | boolean>): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }

  private getServiceMethodName(action: string, entityName: string, handlers: string[]): string {
    const entityLower = entityName.toLowerCase();
    
    // Find handler that applies to this model
    const relevantHandler = handlers.find(h => {
      const parts = h.split(':');
      if (parts.length === 3 && parts[1] === 'default') {
        const [modelName] = parts;
        return modelName.toLowerCase() === entityLower || modelName === entityName;
      } else if (parts.length === 2) {
        const [modelName] = parts;
        return modelName.toLowerCase() === entityLower || modelName === entityName;
      }
      return false;
    });

    if (relevantHandler) {
      const parts = relevantHandler.split(':');
      if (parts.length === 3 && parts[1] === 'default') {
        // Format: modelname:default:action -> use action name as method
        return parts[2];
      } else if (parts.length === 2) {
        // Format: modelname:custommethod -> use custom method name
        return parts[1];
      }
    }

    // Fallback to action name
    return action;
  }

  private generateHandlerMethod(
    handler: string,
    entityName: string,
    roles: string[],
    hasPermissions: boolean,
    moduleConfig: ModuleConfig
  ): string {
    const parts = handler.split(':');
    if (parts.length < 2) {
      return '';
    }

    let methodName: string;
    let isDefault = false;
    let actionName = '';

    if (parts.length === 3 && parts[1] === 'default') {
      // Format: modelname:default:action
      actionName = parts[2];
      methodName = actionName === 'getById' ? 'get' : actionName; // Use 'get' instead of 'getById'
      isDefault = true;
    } else if (parts.length === 2) {
      // Format: modelname:custommethod
      methodName = parts[1];
      isDefault = false;
    } else {
      return '';
    }

    const entityLower = entityName.toLowerCase();
    
    // Generate method parameters based on whether it's default or custom
    let methodParams: string;
    let returnType: string;
    let methodImplementation: string;

    if (isDefault) {
      // For default handlers, use standard parameters
      methodParams = this.generateMethodParams(actionName, entityName);
      returnType = this.generateReturnType(actionName, entityName);
      
      // Get the default implementation template
      const template = serviceTemplates.defaultImplementations[
        actionName as keyof typeof serviceTemplates.defaultImplementations
      ];
      
      if (template) {
        methodImplementation = template
          .replace(/{{ENTITY_NAME}}/g, entityName)
          .replace(/{{ENTITY_LOWER}}/g, entityLower);

        // Handle constructor args for create action
        if (actionName === 'create') {
          const constructorArgs = this.generateConstructorArgs(moduleConfig, entityName);
          methodImplementation = methodImplementation.replace(/{{CONSTRUCTOR_ARGS}}/g, constructorArgs);
        }

        // Handle setter calls for update action
        if (actionName === 'update') {
          const setterCalls = this.generateUpdateSetterCalls(moduleConfig, entityName);
          methodImplementation = methodImplementation.replace(/{{UPDATE_SETTER_CALLS}}/g, setterCalls);
        }

        // Special-case: list action with only owner role → fetch by userId
        if (actionName === 'list') {
          const onlyOwner = roles.length > 0 && roles.every(r => r === 'owner');
          if (onlyOwner) {
            methodImplementation = `const ${entityLower}s = await this.${entityLower}Store.getAllByUserId(user.id, page, limit);\n    return ${entityLower}s;`;
          }
        }
      } else {
        methodImplementation = `// TODO: Implement default ${actionName} method for ${entityName}`;
      }
    } else {
      // For custom handlers, use result and context parameters
      methodParams = 'result: any, context: any';
      returnType = 'any';
      methodImplementation = `// TODO: Implement custom ${methodName} method for ${entityName}`;
    }

    const permissionCheck = isDefault ? this.generatePermissionCheck(actionName, roles, entityName) : '';
    const hasUserParam = roles.length > 0 && !roles.includes('all');

    const variables = {
      METHOD_NAME: methodName,
      METHOD_PARAMS: methodParams,
      USER_PARAM: hasUserParam ? ', user: AuthenticatedUser' : '',
      RETURN_TYPE: returnType,
      PERMISSION_CHECK: permissionCheck,
      METHOD_IMPLEMENTATION: methodImplementation
    };

    return this.replaceTemplateVars(serviceTemplates.serviceMethod, variables);
  }

  public generateServiceForModel(model: ModelConfig, moduleName: string, moduleConfig: ModuleConfig, hasGlobalPermissions: boolean): string {
    if (!moduleConfig.actions) {
      return '';
    }

    const entityName = model.name;
    const entityLower = entityName.toLowerCase();
    const actionPermissions = this.getActionPermissions(moduleName, moduleConfig);
    const hasPermissions = !!(hasGlobalPermissions && moduleConfig.permissions && moduleConfig.permissions.length > 0);

    // Collect all unique handlers for this model
    const modelHandlers = new Set<string>();
    Object.entries(moduleConfig.actions || {}).forEach(([action, actionConfig]) => {
      const handlers = actionConfig.handlers || [];
      handlers.forEach(handler => {
        // Only include handlers that apply to this model
        if (handler.startsWith(`${entityLower}:`) || handler.startsWith(`${entityName}:`)) {
          modelHandlers.add(handler);
        }
      });
    });

    // Generate a method for each unique handler
    const serviceMethods = Array.from(modelHandlers)
      .map(handler => {
        // Determine which actions use this handler to get permissions
        const actionsUsingHandler = Object.entries(moduleConfig.actions || {})
          .filter(([, actionConfig]) => (actionConfig.handlers || []).includes(handler))
          .map(([action]) => action);
        
        // Use permissions from the first action that uses this handler
        const firstAction = actionsUsingHandler[0];
        const roles = firstAction ? (actionPermissions[firstAction] || []) : [];
        
        return this.generateHandlerMethod(handler, entityName, roles, hasPermissions, moduleConfig);
      })
      .filter(method => method) // Remove empty methods
      .join('\n\n');

    const serviceClass = this.replaceTemplateVars(serviceTemplates.serviceClass, {
      ENTITY_NAME: entityName,
      ENTITY_LOWER: entityLower,
      AUTH_SERVICE_PARAM: '',
      SERVICE_METHODS: serviceMethods
    });

    const customImports = this.generateCustomImports(moduleConfig);

    return this.replaceTemplateVars(serviceFileTemplate, {
      ENTITY_NAME: entityName,
      PERMISSIONS_IMPORT: hasPermissions ? "\nimport type { AuthenticatedUser } from '@currentjs/router';" : '',
      CUSTOM_IMPORTS: customImports,
      SERVICE_CLASS: serviceClass
    });
  }

  public generateService(moduleName: string, moduleConfig: ModuleConfig, hasGlobalPermissions: boolean): string {
    // Legacy method for backward compatibility - use first model
    if (!moduleConfig.models || moduleConfig.models.length === 0) {
      return '';
    }
    return this.generateServiceForModel(moduleConfig.models[0], moduleName, moduleConfig, hasGlobalPermissions);
  }

  private generateCustomImports(moduleConfig: ModuleConfig): string {
    if (!moduleConfig.actions) return '';

    const imports: string[] = [];

    Object.values(moduleConfig.actions).forEach(actionConfig => {
      if (actionConfig.handlers) {
        actionConfig.handlers.forEach(handler => {
          if (handler.startsWith(PATH_PATTERNS.MODULES_DIRECTIVE)) {
            const functionName = this.extractFunctionName(handler);
            const importPath = handler.replace(PATH_PATTERNS.MODULES_DIRECTIVE, '../../');
            imports.push(`import ${functionName} from '${importPath}';`);
          }
        });
      }
    });

    return imports.length > 0 ? '\n' + imports.join('\n') : '';
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;

    const result: Record<string, string> = {};
    const hasGlobalPermissions = this.hasPermissions(config);

    if ((config as any).modules) {
      Object.entries((config as any).modules as Record<string, ModuleConfig>).forEach(([moduleName, moduleConfig]) => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          // Generate a service for each model
          moduleConfig.models.forEach(model => {
            const serviceCode = this.generateServiceForModel(model, moduleName, moduleConfig, hasGlobalPermissions);
            if (serviceCode) {
              result[model.name] = serviceCode;
            }
          });
        }
      });
    } else {
      const moduleName = 'Module';
      const moduleConfig = config as ModuleConfig;
      if (moduleConfig.models && moduleConfig.models.length > 0) {
        // Generate a service for each model
        moduleConfig.models.forEach(model => {
          const serviceCode = this.generateServiceForModel(model, moduleName, moduleConfig, hasGlobalPermissions);
          if (serviceCode) {
            result[model.name] = serviceCode;
          }
        });
      }
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string = COMMON_FILES.APP_YAML,
    outputDir: string = 'application',
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const services = this.generateFromYamlFile(yamlFilePath);

    const servicesDir = path.join(outputDir, 'services');

    fs.mkdirSync(servicesDir, { recursive: true });

    for (const [moduleName, serviceCode] of Object.entries(services)) {
      const fileName = `${moduleName}Service.ts`;
      const filePath = path.join(servicesDir, fileName);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, serviceCode, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Service files generated successfully!') + '\n');
  }
}

