export const controllerTemplates = {
  controllerClass: `@Controller('{{CONTROLLER_BASE}}', {})
export class {{CONTROLLER_NAME}} {
  constructor(
    private {{ENTITY_LOWER}}Service: {{ENTITY_NAME}}Service
  ) {}

{{CONTROLLER_METHODS}}
}`,

  controllerMethod: `  @{{HTTP_DECORATOR}}("{{ENDPOINT_PATH}}"){{RENDER_DECORATOR}}
  async {{METHOD_NAME}}(context: IContext): Promise<{{RETURN_TYPE}}> {
{{METHOD_IMPLEMENTATION}}
  }`,

  userExtraction: `    const user = context.request.user;
    if (!user) {
      throw new Error('User authentication required');
    }`,

  methodImplementations: {
    list: `{{USER_EXTRACTION}}
    // Extract pagination from URL parameters
    const page = parseInt(context.request.parameters.page as string) || 1;
    const limit = parseInt(context.request.parameters.limit as string) || 10;
    
    const {{ENTITY_LOWER}}s = await this.{{ENTITY_LOWER}}Service.list(page, limit{{USER_PARAM}});
    return {{ENTITY_LOWER}}s;`,
      
    get: `{{USER_EXTRACTION}}
    const id = parseInt(context.request.parameters.id as string);
    if (isNaN(id)) {
      throw new Error('Invalid ID parameter');
    }
    
    const {{ENTITY_LOWER}} = await this.{{ENTITY_LOWER}}Service.get(id{{USER_PARAM}});
    return {{ENTITY_LOWER}};`,
      
    create: `{{USER_EXTRACTION}}
    const new{{ENTITY_NAME}} = await this.{{ENTITY_LOWER}}Service.create(context.request.body as {{ENTITY_NAME}}DTO{{USER_PARAM}});
    return new{{ENTITY_NAME}};`,
      
    update: `{{USER_EXTRACTION}}
    const id = parseInt(context.request.parameters.id as string);
    if (isNaN(id)) {
      throw new Error('Invalid ID parameter');
    }
    
    const updated{{ENTITY_NAME}} = await this.{{ENTITY_LOWER}}Service.update(id, context.request.body as {{ENTITY_NAME}}DTO{{USER_PARAM}});
    return updated{{ENTITY_NAME}};`,
      
    delete: `{{USER_EXTRACTION}}
    const id = parseInt(context.request.parameters.id as string);
    if (isNaN(id)) {
      throw new Error('Invalid ID parameter');
    }
    
    const result = await this.{{ENTITY_LOWER}}Service.delete(id{{USER_PARAM}});
    return result;`
  ,
    empty: `{{USER_EXTRACTION}}
    // Provide an empty/default {{ENTITY_NAME}} for create form rendering
    // Note: actual create happens via API endpoint using custom form handling
    return {} as any;`
  },

  responseFormats: {
    list: `{ data: {{ENTITY_LOWER}}s, page, limit }`,
    get: `{ data: {{ENTITY_LOWER}} }`,
    create: `{ data: new{{ENTITY_NAME}}, message: '{{ENTITY_NAME}} created successfully' }`,
    update: `{ data: updated{{ENTITY_NAME}}, message: '{{ENTITY_NAME}} updated successfully' }`,
    delete: `result`
  },

  statusCodes: {
    list: { success: 200, error: 500 },
    get: { success: 200, error: 404 },
    create: { success: 201, error: 400 },
    update: { success: 200, error: 400 },
    delete: { success: 200, error: 400 }
  }
};

export const controllerFileTemplate = `import { {{ENTITY_NAME}} } from '../../domain/entities/{{ENTITY_NAME}}';
import { {{ENTITY_NAME}}Service } from '../../application/services/{{ENTITY_NAME}}Service';
import { {{ENTITY_NAME}}DTO } from '../../application/validation/{{ENTITY_NAME}}Validation';{{JWT_IMPORT}}
import { Get, Post, Put, Patch, Delete, Controller, Render } from '@currentjs/router';
import type { IContext } from '@currentjs/router';

{{CONTROLLER_CLASS}}`;