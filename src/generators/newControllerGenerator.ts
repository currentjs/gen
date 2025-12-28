import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  NewModuleConfig,
  ApiEndpointConfig,
  WebPageConfig,
  isNewModuleConfig 
} from '../types/configTypes';

export class NewControllerGenerator {
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private getHttpDecorator(method: string): string {
    switch (method.toUpperCase()) {
      case 'GET': return 'Get';
      case 'POST': return 'Post';
      case 'PUT': return 'Put';
      case 'PATCH': return 'Patch';
      case 'DELETE': return 'Delete';
      default: return 'Get';
    }
  }

  private parseUseCase(useCase: string): { model: string; action: string } {
    const [model, action] = useCase.split(':');
    return { model, action };
  }

  /**
   * Generate authentication/authorization check code based on auth config
   * @param auth - The auth requirement: 'all', 'authenticated', 'owner', or role names like 'admin'
   * @returns Code string for the auth check, or empty string if no check needed
   */
  private generateAuthCheck(auth?: string): string {
    if (!auth || auth === 'all') {
      return ''; // No check needed
    }

    if (auth === 'authenticated') {
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
    }

    if (auth === 'owner') {
      // Owner check requires authenticated + later ownership validation
      // The ownership validation would need to happen after fetching the entity
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }
    // Note: Owner validation should be done after fetching the entity`;
    }

    // Role-based auth (admin, editor, etc.)
    return `if (!context.request.user) {
      throw new Error('Authentication required');
    }
    if (context.request.user.role !== '${auth}') {
      throw new Error('Insufficient permissions: ${auth} role required');
    }`;
  }

  private generateApiEndpointMethod(
    endpoint: ApiEndpointConfig,
    resourceName: string
  ): { method: string; dtoImports: Set<string> } {
    const { model, action } = this.parseUseCase(endpoint.useCase);
    const methodName = action;
    const decorator = this.getHttpDecorator(endpoint.method);
    const useCaseVar = `${model.toLowerCase()}UseCase`;
    const inputClass = `${model}${this.capitalize(action)}Input`;
    const outputClass = `${model}${this.capitalize(action)}Output`;

    const dtoImports = new Set<string>();
    dtoImports.add(`${model}${this.capitalize(action)}`);

    // Generate auth check
    const authCheck = this.generateAuthCheck(endpoint.auth);
    const authLine = authCheck ? `\n    ${authCheck}\n` : '';

    // Build parsing logic
    let parseLogic: string;
    if (action === 'list') {
      parseLogic = `const input = ${inputClass}.parse(context.request.parameters);`;
    } else if (action === 'get' || action === 'delete') {
      parseLogic = `const input = ${inputClass}.parse({ id: context.request.parameters.id });`;
    } else if (action === 'create') {
      parseLogic = `const input = ${inputClass}.parse(context.request.body);`;
    } else if (action === 'update') {
      parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, id: context.request.parameters.id });`;
    } else {
      parseLogic = `const input = ${inputClass}.parse(context.request.body || {});`;
    }

    // Generate output transformation based on action
    let outputTransform: string;
    if (action === 'list') {
      outputTransform = `return ${outputClass}.from(result);`;
    } else if (action === 'delete') {
      outputTransform = `return result;`;
    } else {
      outputTransform = `return ${outputClass}.from(result);`;
    }

    const method = `  @${decorator}('${endpoint.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    ${parseLogic}
    const result = await this.${useCaseVar}.${action}(input);
    ${outputTransform}
  }`;

    return { method, dtoImports };
  }

  private generateWebPageMethod(
    page: WebPageConfig,
    resourceName: string,
    layout: string,
    methodIndex: number
  ): { method: string; dtoImports: Set<string> } {
    const method = page.method || 'GET';
    const decorator = this.getHttpDecorator(method);
    const dtoImports = new Set<string>();
    
    // Generate unique method name by appending method type for POST routes
    const pathSegments = page.path.split('/').filter(Boolean);
    let baseMethodName = pathSegments.length === 0 
      ? 'index'
      : pathSegments.map((seg, idx) => {
          if (seg.startsWith(':')) {
            return 'By' + this.capitalize(seg.slice(1));
          }
          return idx === 0 ? seg : this.capitalize(seg);
        }).join('');
    
    // Append method suffix for POST to avoid duplicates
    const methodName = method === 'POST' ? `${baseMethodName}Submit` : baseMethodName;

    // Generate auth check
    const authCheck = this.generateAuthCheck(page.auth);
    const authLine = authCheck ? `\n    ${authCheck}\n` : '';

    // For GET requests with views (display pages)
    if (method === 'GET' && page.view) {
      const renderDecorator = `\n  @Render("${page.view}", "${layout}")`;
      
      if (page.useCase) {
        const { model, action } = this.parseUseCase(page.useCase);
        const useCaseVar = `${model.toLowerCase()}UseCase`;
        const inputClass = `${model}${this.capitalize(action)}Input`;
        
        dtoImports.add(`${model}${this.capitalize(action)}`);

        let parseLogic: string;
        if (page.path.includes(':id')) {
          parseLogic = `const input = ${inputClass}.parse({ id: context.request.parameters.id });`;
        } else if (action === 'list') {
          parseLogic = `const input = ${inputClass}.parse(context.request.parameters);`;
        } else {
          parseLogic = `const input = ${inputClass}.parse({});`;
        }

        // For web pages, we return data for the template, not transformed DTO
        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    ${parseLogic}
    const result = await this.${useCaseVar}.${action}(input);
    return result;
  }`;

        return { method: methodCode, dtoImports };
      } else {
        // No use case - just render view
        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    return { formData: {} };
  }`;

        return { method: methodCode, dtoImports };
      }
    } else if (method === 'POST' && page.useCase) {
      // POST request - form submission
      const { model, action } = this.parseUseCase(page.useCase);
      const useCaseVar = `${model.toLowerCase()}UseCase`;
      const inputClass = `${model}${this.capitalize(action)}Input`;

      dtoImports.add(`${model}${this.capitalize(action)}`);

      let parseLogic: string;
      if (page.path.includes(':id')) {
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, id: context.request.parameters.id });`;
      } else {
        parseLogic = `const input = ${inputClass}.parse(context.request.body);`;
      }

      // Handle onSuccess and onError strategies
      const onSuccessHandler = this.generateOnSuccessHandler(page);
      const onErrorHandler = this.generateOnErrorHandler(page);

      const methodCode = `  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    try {
      ${parseLogic}
      const result = await this.${useCaseVar}.${action}(input);
      ${onSuccessHandler}
      return { success: true, data: result };
    } catch (error) {
      ${onErrorHandler}
      throw error;
    }
  }`;

      return { method: methodCode, dtoImports };
    }

    const methodCode = `  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {
    // TODO: Implement ${methodName}
    return {};
  }`;

    return { method: methodCode, dtoImports };
  }

  private generateOnSuccessHandler(page: WebPageConfig): string {
    if (!page.onSuccess) return '// Success';
    
    const handlers: string[] = [];
    
    if (page.onSuccess.toast) {
      handlers.push(`// Toast: ${page.onSuccess.toast}`);
    }
    
    if (page.onSuccess.redirect) {
      const redirectPath = page.onSuccess.redirect.replace(':id', '${result.id}');
      handlers.push(`// Redirect: ${redirectPath}`);
    }
    
    if (page.onSuccess.back) {
      handlers.push('// Navigate back');
    }
    
    return handlers.join('\n      ') || '// Success';
  }

  private generateOnErrorHandler(page: WebPageConfig): string {
    if (!page.onError) return '// Error occurred';
    
    const handlers: string[] = [];
    
    if (page.onError.stay) {
      handlers.push('// Stay on page');
    }
    
    if (page.onError.toast) {
      handlers.push(`// Error toast: ${page.onError.toast}`);
    }
    
    return handlers.join('\n      ') || '// Error occurred';
  }

  private generateApiController(
    resourceName: string,
    prefix: string,
    endpoints: ApiEndpointConfig[]
  ): string {
    const controllerName = `${resourceName}ApiController`;
    
    // Determine which use cases and DTOs are referenced
    const useCaseModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const methods: string[] = [];

    endpoints.forEach(endpoint => {
      const { model } = this.parseUseCase(endpoint.useCase);
      useCaseModels.add(model);
      
      const { method, dtoImports } = this.generateApiEndpointMethod(endpoint, resourceName);
      methods.push(method);
      dtoImports.forEach(d => allDtoImports.add(d));
    });

    // Generate imports
    const useCaseImports = Array.from(useCaseModels)
      .map(model => `import { ${model}UseCase } from '../../application/useCases/${model}UseCase';`)
      .join('\n');

    const dtoImportStatements = Array.from(allDtoImports)
      .map(dto => `import { ${dto}Input, ${dto}Output } from '../../application/dto/${dto}';`)
      .join('\n');

    // Generate constructor parameters
    const constructorParams = Array.from(useCaseModels)
      .map(model => `private ${model.toLowerCase()}UseCase: ${model}UseCase`)
      .join(',\n    ');

    return `import { Controller, Get, Post, Put, Delete, type IContext } from '@currentjs/router';
${useCaseImports}
${dtoImportStatements}

@Controller('${prefix}')
export class ${controllerName} {
  constructor(
    ${constructorParams}
  ) {}

${methods.join('\n\n')}
}`;
  }

  private generateWebController(
    resourceName: string,
    prefix: string,
    layout: string,
    pages: WebPageConfig[]
  ): string {
    const controllerName = `${resourceName}WebController`;
    
    // Determine which use cases and DTOs are referenced
    const useCaseModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const methods: string[] = [];

    pages.forEach((page, index) => {
      if (page.useCase) {
        const { model } = this.parseUseCase(page.useCase);
        useCaseModels.add(model);
      }
      
      const { method, dtoImports } = this.generateWebPageMethod(page, resourceName, layout, index);
      methods.push(method);
      dtoImports.forEach(d => allDtoImports.add(d));
    });

    // Generate imports
    const useCaseImports = Array.from(useCaseModels)
      .map(model => `import { ${model}UseCase } from '../../application/useCases/${model}UseCase';`)
      .join('\n');

    const dtoImportStatements = Array.from(allDtoImports)
      .map(dto => `import { ${dto}Input } from '../../application/dto/${dto}';`)
      .join('\n');

    // Generate constructor parameters
    const constructorParams = useCaseModels.size > 0
      ? Array.from(useCaseModels)
          .map(model => `private ${model.toLowerCase()}UseCase: ${model}UseCase`)
          .join(',\n    ')
      : '';

    const constructorBlock = constructorParams 
      ? `constructor(
    ${constructorParams}
  ) {}`
      : 'constructor() {}';

    return `import { Controller, Get, Post, Render, type IContext } from '@currentjs/router';
${useCaseImports}
${dtoImportStatements}

@Controller('${prefix}')
export class ${controllerName} {
  ${constructorBlock}

${methods.join('\n\n')}
}`;
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // Generate API controllers
    if (config.api && config.api.resources) {
      Object.entries(config.api.resources).forEach(([resourceName, resourceConfig]) => {
        const code = this.generateApiController(
          resourceName,
          resourceConfig.prefix,
          resourceConfig.endpoints
        );
        result[`${resourceName}Api`] = code;
      });
    }

    // Generate Web controllers
    if (config.web && config.web.resources) {
      Object.entries(config.web.resources).forEach(([resourceName, resourceConfig]) => {
        const code = this.generateWebController(
          resourceName,
          resourceConfig.prefix,
          resourceConfig.layout || 'main_view',
          resourceConfig.pages
        );
        result[`${resourceName}Web`] = code;
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isNewModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected api/web resources structure.');
    }

    return this.generateFromConfig(config);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<string[]> {
    const controllersByName = this.generateFromYamlFile(yamlFilePath);
    
    const controllersDir = path.join(moduleDir, 'infrastructure', 'controllers');
    fs.mkdirSync(controllersDir, { recursive: true });

    const generatedPaths: string[] = [];

    for (const [name, code] of Object.entries(controllersByName)) {
      const filePath = path.join(controllersDir, `${name}Controller.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      generatedPaths.push(filePath);
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Controller files generated successfully!') + '\n');

    return generatedPaths;
  }
}
