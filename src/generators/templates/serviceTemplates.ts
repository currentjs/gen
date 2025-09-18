export const serviceTemplates = {
  serviceClass: `export class {{ENTITY_NAME}}Service {
  constructor(
    private {{ENTITY_LOWER}}Store: {{ENTITY_NAME}}Store{{AUTH_SERVICE_PARAM}}
  ) {}

{{SERVICE_METHODS}}
}`,

  serviceMethod: `  async {{METHOD_NAME}}({{METHOD_PARAMS}}{{USER_PARAM}}): Promise<{{RETURN_TYPE}}> {
{{PERMISSION_CHECK}}
    {{METHOD_IMPLEMENTATION}}
  }`,

  permissionCheck: `    // Role check: {{REQUIRED_ROLES}}
    const allowedRoles = [{{ROLES_ARRAY}}];
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      throw new Error('Insufficient permissions to perform this action');
    }`,

  ownerPermissionCheck: ``,

  defaultImplementations: {
    list: `const {{ENTITY_LOWER}}s = await this.{{ENTITY_LOWER}}Store.getAll(page, limit);
    return {{ENTITY_LOWER}}s;`,
    
    get: `const {{ENTITY_LOWER}} = await this.{{ENTITY_LOWER}}Store.getById(id);
    if (!{{ENTITY_LOWER}}) {
      throw new Error('{{ENTITY_NAME}} not found');
    }
    return {{ENTITY_LOWER}};`,
    
    getById: `const {{ENTITY_LOWER}} = await this.{{ENTITY_LOWER}}Store.getById(id);
    if (!{{ENTITY_LOWER}}) {
      throw new Error('{{ENTITY_NAME}} not found');
    }
    return {{ENTITY_LOWER}};`,
    
    create: `validateCreate{{ENTITY_NAME}}({{ENTITY_LOWER}}Data);
    const {{ENTITY_LOWER}} = new {{ENTITY_NAME}}(0, {{CONSTRUCTOR_ARGS}});
    return await this.{{ENTITY_LOWER}}Store.insert({{ENTITY_LOWER}});`,
    
    update: `validateUpdate{{ENTITY_NAME}}({{ENTITY_LOWER}}Data);
    const existing{{ENTITY_NAME}} = await this.{{ENTITY_LOWER}}Store.getById(id);
    if (!existing{{ENTITY_NAME}}) {
      throw new Error('{{ENTITY_NAME}} not found');
    }
    {{UPDATE_SETTER_CALLS}}
    return await this.{{ENTITY_LOWER}}Store.update(id, existing{{ENTITY_NAME}});`,
    
    delete: `const success = await this.{{ENTITY_LOWER}}Store.softDelete(id);
    if (!success) {
      throw new Error('{{ENTITY_NAME}} not found or could not be deleted');
    }
    return { success: true, message: '{{ENTITY_NAME}} deleted successfully' };`
  },

  customActionImplementation: `// Custom action implementation
    const result = await {{CUSTOM_FUNCTION_CALL}};
    return result;`
};

export const serviceFileTemplate = `import { {{ENTITY_NAME}} } from '../../domain/entities/{{ENTITY_NAME}}';
import { {{ENTITY_NAME}}Store } from '../../infrastructure/stores/{{ENTITY_NAME}}Store';
import { {{ENTITY_NAME}}DTO, validateCreate{{ENTITY_NAME}}, validateUpdate{{ENTITY_NAME}} } from '../validation/{{ENTITY_NAME}}Validation';{{PERMISSIONS_IMPORT}}{{CUSTOM_IMPORTS}}

{{SERVICE_CLASS}}`;