import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  NewModuleConfig,
  ApiEndpointConfig,
  WebPageConfig,
  AuthConfig,
  isNewModuleConfig 
} from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo, getChildrenOfParent, ParentChildInfo } from '../utils/childEntityUtils';

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
   * Normalize auth config to an array of roles
   */
  private normalizeAuth(auth?: AuthConfig): string[] {
    if (!auth) return [];
    if (Array.isArray(auth)) return auth;
    return [auth];
  }

  /**
   * Check if auth config includes owner permission
   */
  private hasOwnerAuth(auth?: AuthConfig): boolean {
    const roles = this.normalizeAuth(auth);
    return roles.includes('owner');
  }

  /**
   * Generate pre-fetch authentication/authorization check code.
   * This runs before fetching the entity and validates authentication and role-based access.
   * @param auth - The auth requirement: 'all', 'authenticated', 'owner', role names, or array of roles
   * @returns Code string for the auth check, or empty string if no check needed
   */
  private generateAuthCheck(auth?: AuthConfig): string {
    const roles = this.normalizeAuth(auth);
    
    if (roles.length === 0 || (roles.length === 1 && roles[0] === 'all')) {
      return ''; // No check needed - public access
    }

    // If only 'authenticated' is specified
    if (roles.length === 1 && roles[0] === 'authenticated') {
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
    }

    // If only 'owner' is specified - just require authentication here
    // (owner check happens post-fetch)
    if (roles.length === 1 && roles[0] === 'owner') {
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
    }

    // Filter out 'owner' and 'all' for role checks (owner is checked post-fetch)
    const roleChecks = roles.filter(r => r !== 'owner' && r !== 'all' && r !== 'authenticated');
    const hasOwner = roles.includes('owner');
    const hasAuthenticated = roles.includes('authenticated');
    
    // If we have role checks or owner, we need authentication
    if (roleChecks.length > 0 || hasOwner) {
      if (roleChecks.length === 0) {
        // Only owner (and maybe authenticated) - just require auth
        return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
      }
      
      if (roleChecks.length === 1 && !hasOwner) {
        // Single role check
        return `if (!context.request.user) {
      throw new Error('Authentication required');
    }
    if (context.request.user.role !== '${roleChecks[0]}') {
      throw new Error('Insufficient permissions: ${roleChecks[0]} role required');
    }`;
      }
      
      // Multiple roles OR owner - use OR logic
      // If owner is included, we can't fully check here (post-fetch), so we just require auth
      // and mark that owner check should happen later
      if (hasOwner) {
        // With owner: require auth, role check will be combined with owner check post-fetch
        return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
      }
      
      // Multiple roles without owner - check if user has ANY of the roles
      const roleConditions = roleChecks.map(r => `context.request.user.role === '${r}'`).join(' || ');
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }
    if (!(${roleConditions})) {
      throw new Error('Insufficient permissions: one of [${roleChecks.join(', ')}] role required');
    }`;
    }

    // Only 'authenticated' in the mix
    if (hasAuthenticated) {
      return `if (!context.request.user) {
      throw new Error('Authentication required');
    }`;
    }

    return '';
  }

  /**
   * Generate post-fetch authorization check for owner validation.
   * This runs after fetching the entity and validates ownership.
   * Used for READ operations (get, list) where we check after fetch.
   * For child entities, uses getResourceOwner() since result has no ownerId.
   */
  private generatePostFetchOwnerCheck(
    auth?: AuthConfig,
    resultVar: string = 'result',
    useCaseVar?: string,
    childInfo?: ChildEntityInfo
  ): string {
    const roles = this.normalizeAuth(auth);
    
    if (!roles.includes('owner')) {
      return ''; // No owner check needed
    }

    const bypassRoles = roles.filter(r => r !== 'owner' && r !== 'all' && r !== 'authenticated');

    // Child entities don't have ownerId on result; resolve via getResourceOwner
    if (childInfo && useCaseVar) {
      if (bypassRoles.length === 0) {
        return `
    // Owner validation (post-fetch for reads, via parent)
    const resourceOwnerId = await this.${useCaseVar}.getResourceOwner(${resultVar}.id);
    if (resourceOwnerId === null) {
      throw new Error('Resource not found');
    }
    if (resourceOwnerId !== context.request.user?.id) {
      throw new Error('Access denied: you do not own this resource');
    }`;
      }
      const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
      return `
    // Owner validation (post-fetch for reads, via parent, bypassed for: ${bypassRoles.join(', ')})
    const resourceOwnerId = await this.${useCaseVar}.getResourceOwner(${resultVar}.id);
    if (resourceOwnerId === null) {
      throw new Error('Resource not found');
    }
    const isOwner = resourceOwnerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new Error('Access denied: you do not own this resource');
    }`;
    }

    // Root entity: result has ownerId
    if (bypassRoles.length === 0) {
      return `
    // Owner validation (post-fetch for reads)
    if (${resultVar}.ownerId !== context.request.user?.id) {
      throw new Error('Access denied: you do not own this resource');
    }`;
    }
    const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
    return `
    // Owner validation (post-fetch for reads, bypassed for: ${bypassRoles.join(', ')})
    const isOwner = ${resultVar}.ownerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new Error('Access denied: you do not own this resource');
    }`;
  }

  /**
   * Generate pre-mutation authorization check for owner validation.
   * This runs BEFORE the mutation to prevent unauthorized changes.
   * Used for WRITE operations (update, delete).
   * @param auth - The auth requirement
   * @param useCaseVar - The use case variable name
   * @returns Code string for the pre-mutation owner check, or empty string if not needed
   */
  private generatePreMutationOwnerCheck(auth?: AuthConfig, useCaseVar: string = 'useCase'): string {
    const roles = this.normalizeAuth(auth);
    
    if (!roles.includes('owner')) {
      return ''; // No owner check needed
    }

    // Get non-owner roles for the bypass check
    const bypassRoles = roles.filter(r => r !== 'owner' && r !== 'all' && r !== 'authenticated');
    
    if (bypassRoles.length === 0) {
      // Only owner - strict ownership check
      return `
    // Pre-mutation owner validation
    const resourceOwnerId = await this.${useCaseVar}.getResourceOwner(input.id);
    if (resourceOwnerId === null) {
      throw new Error('Resource not found');
    }
    if (resourceOwnerId !== context.request.user?.id) {
      throw new Error('Access denied: you do not own this resource');
    }
`;
    }
    
    // Owner OR other roles - bypass if user has a privileged role
    const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
    return `
    // Pre-mutation owner validation (bypassed for: ${bypassRoles.join(', ')})
    const resourceOwnerId = await this.${useCaseVar}.getResourceOwner(input.id);
    if (resourceOwnerId === null) {
      throw new Error('Resource not found');
    }
    const isOwner = resourceOwnerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new Error('Access denied: you do not own this resource');
    }
`;
  }

  private generateApiEndpointMethod(
    endpoint: ApiEndpointConfig,
    resourceName: string,
    childInfo?: ChildEntityInfo
  ): { method: string; dtoImports: Set<string> } {
    const { model, action } = this.parseUseCase(endpoint.useCase);
    const methodName = action;
    const decorator = this.getHttpDecorator(endpoint.method);
    const useCaseVar = `${model.toLowerCase()}UseCase`;
    const inputClass = `${model}${this.capitalize(action)}Input`;
    const outputClass = `${model}${this.capitalize(action)}Output`;

    const dtoImports = new Set<string>();
    dtoImports.add(`${model}${this.capitalize(action)}`);

    // Generate auth check (pre-fetch)
    const authCheck = this.generateAuthCheck(endpoint.auth);
    const authLine = authCheck ? `\n    ${authCheck}\n` : '';

    // Build parsing logic
    // For create: root gets ownerId from user, child gets parentId from URL params
    let parseLogic: string;
    if (action === 'list') {
      parseLogic = `const input = ${inputClass}.parse(context.request.parameters);`;
    } else if (action === 'get' || action === 'delete') {
      parseLogic = `const input = ${inputClass}.parse({ id: context.request.parameters.id });`;
    } else if (action === 'create') {
      if (childInfo) {
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} });`;
      } else {
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ownerId: context.request.user?.id });`;
      }
    } else if (action === 'update') {
      parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, id: context.request.parameters.id });`;
    } else {
      parseLogic = `const input = ${inputClass}.parse(context.request.body || {});`;
    }

    // Generate owner checks:
    // - For mutations (update, delete): PRE-mutation check (before operation)
    // - For reads (get): POST-fetch check (after fetching)
    const hasOwner = this.hasOwnerAuth(endpoint.auth);
    const isMutation = action === 'update' || action === 'delete';
    const isRead = action === 'get';
    
    // Pre-mutation owner check for write operations
    const preMutationOwnerCheck = (hasOwner && isMutation) 
      ? this.generatePreMutationOwnerCheck(endpoint.auth, useCaseVar) 
      : '';
    
    // Post-fetch owner check for read operations only
    const postFetchOwnerCheck = (hasOwner && isRead) 
      ? this.generatePostFetchOwnerCheck(endpoint.auth, 'result', useCaseVar, childInfo) 
      : '';

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
    ${parseLogic}${preMutationOwnerCheck}
    const result = await this.${useCaseVar}.${action}(input);${postFetchOwnerCheck}
    ${outputTransform}
  }`;

    return { method, dtoImports };
  }

  private generateWebPageMethod(
    page: WebPageConfig,
    resourceName: string,
    layout: string,
    methodIndex: number,
    childInfo?: ChildEntityInfo,
    withChildChildren?: ParentChildInfo[]
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

    // Generate auth check (pre-fetch)
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

        // Generate post-fetch owner check for GET pages (reads only)
        const hasOwner = this.hasOwnerAuth(page.auth);
        const isReadAction = action === 'get' || action === 'list';
        const postFetchOwnerCheck = (hasOwner && isReadAction) 
          ? this.generatePostFetchOwnerCheck(page.auth, 'result', useCaseVar, childInfo) 
          : '';

        // For get + withChild: load child entities and merge into result for template
        const loadChildBlocks: string[] = [];
        let returnExpr: string;
        if (childInfo) {
          returnExpr = `{ ...result, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} }`;
        } else if (withChildChildren?.length && action === 'get') {
          const childKeys: string[] = [];
          for (const child of withChildChildren) {
            const childVar = child.childEntityName.charAt(0).toLowerCase() + child.childEntityName.slice(1);
            const childItemsKey = `${childVar}Items`;
            childKeys.push(childItemsKey);
            loadChildBlocks.push(`const ${childItemsKey} = await this.${childVar}Service.listByParent(result.id);`);
          }
          returnExpr = `{ ...result, ${childKeys.map(k => `${k}: ${k}`).join(', ')} }`;
        } else {
          returnExpr = 'result';
        }

        const loadChildCode = loadChildBlocks.length ? '\n    ' + loadChildBlocks.join('\n    ') + '\n    ' : '';
        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    ${parseLogic}
    const result = await this.${useCaseVar}.${action}(input);${postFetchOwnerCheck}${loadChildCode}
    return ${returnExpr};
  }`;

        return { method: methodCode, dtoImports };
      } else {
        // No use case - just render view (e.g. create form)
        // Child entities need the parent ID from URL params for link rendering
        const emptyFormData = childInfo
          ? `{ formData: {}, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} }`
          : '{ formData: {} }';
        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    return ${emptyFormData};
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
      } else if (action === 'create') {
        if (childInfo) {
          parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} });`;
        } else {
          parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ownerId: context.request.user?.id });`;
        }
      } else {
        parseLogic = `const input = ${inputClass}.parse(context.request.body);`;
      }

      // Generate PRE-mutation owner check for update/delete actions (POST requests)
      const hasOwner = this.hasOwnerAuth(page.auth);
      const isMutation = action === 'update' || action === 'delete';
      const preMutationOwnerCheck = (hasOwner && isMutation) 
        ? this.generatePreMutationOwnerCheck(page.auth, useCaseVar) 
        : '';

      // Handle onSuccess and onError strategies
      const onSuccessHandler = this.generateOnSuccessHandler(page);
      const onErrorHandler = this.generateOnErrorHandler(page);

      const methodCode = `  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    try {
      ${parseLogic}${preMutationOwnerCheck}
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

  /**
   * Sort routes so static paths are registered before parameterized ones.
   * This prevents parameterized routes (e.g. /:id) from catching requests
   * meant for static routes (e.g. /create).
   */
  private sortRoutesBySpecificity<T extends { path: string }>(routes: T[]): T[] {
    return [...routes].sort((a, b) => {
      const aSegments = a.path.split('/').filter(Boolean);
      const bSegments = b.path.split('/').filter(Boolean);
      const aParamCount = aSegments.filter(s => s.startsWith(':')).length;
      const bParamCount = bSegments.filter(s => s.startsWith(':')).length;
      return aParamCount - bParamCount;
    });
  }

  private generateApiController(
    resourceName: string,
    prefix: string,
    endpoints: ApiEndpointConfig[],
    childInfo?: ChildEntityInfo
  ): string {
    const controllerName = `${resourceName}ApiController`;
    
    // Determine which use cases and DTOs are referenced
    const useCaseModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const methods: string[] = [];

    const sortedEndpoints = this.sortRoutesBySpecificity(endpoints);
    sortedEndpoints.forEach(endpoint => {
      const { model } = this.parseUseCase(endpoint.useCase);
      useCaseModels.add(model);
      
      const { method, dtoImports } = this.generateApiEndpointMethod(endpoint, resourceName, childInfo);
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
    pages: WebPageConfig[],
    config: NewModuleConfig,
    childInfo?: ChildEntityInfo
  ): string {
    const controllerName = `${resourceName}WebController`;
    
    // Child entities of this resource (for withChild). Only root entities can have withChild.
    const withChildChildren = childInfo ? [] : getChildrenOfParent(config, resourceName);

    // Determine which use cases and DTOs are referenced
    const useCaseModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const methods: string[] = [];

    const sortedPages = this.sortRoutesBySpecificity(pages);
    sortedPages.forEach((page, index) => {
      if (page.useCase) {
        const { model } = this.parseUseCase(page.useCase);
        useCaseModels.add(model);
      }

      const { model, action } = page.useCase ? this.parseUseCase(page.useCase) : { model: '', action: '' };
      const useCaseWithChild = model && action && (config.useCases[model] as Record<string, { withChild?: boolean }>)?.[action]?.withChild === true;
      const withChildForThisPage = useCaseWithChild && action === 'get' && withChildChildren.length > 0 ? withChildChildren : undefined;
      
      const { method, dtoImports } = this.generateWebPageMethod(page, resourceName, layout, index, childInfo, withChildForThisPage);
      methods.push(method);
      dtoImports.forEach(d => allDtoImports.add(d));
    });

    // Determine if any page actually uses withChild (only then inject child services)
    const needsChildServices = withChildChildren.length > 0 && sortedPages.some(page => {
      if (!page.useCase) return false;
      const { model: m, action: a } = this.parseUseCase(page.useCase);
      return a === 'get' && (config.useCases[m] as Record<string, { withChild?: boolean }>)?.[a]?.withChild === true;
    });

    // Constructor: use cases + child entity services when withChild is actually used
    const serviceImports: string[] = [];
    const constructorParams: string[] = [];
    Array.from(useCaseModels).forEach(model => {
      constructorParams.push(`private ${model.toLowerCase()}UseCase: ${model}UseCase`);
    });
    if (needsChildServices) {
      withChildChildren.forEach(child => {
        const childVar = child.childEntityName.charAt(0).toLowerCase() + child.childEntityName.slice(1);
        serviceImports.push(`import { ${child.childEntityName}Service } from '../../application/services/${child.childEntityName}Service';`);
        constructorParams.push(`private ${childVar}Service: ${child.childEntityName}Service`);
      });
    }

    const useCaseImports = Array.from(useCaseModels)
      .map(model => `import { ${model}UseCase } from '../../application/useCases/${model}UseCase';`)
      .join('\n');

    const dtoImportStatements = Array.from(allDtoImports)
      .map(dto => `import { ${dto}Input } from '../../application/dto/${dto}';`)
      .join('\n');

    const constructorBlock = constructorParams.length > 0
      ? `constructor(
    ${constructorParams.join(',\n    ')}
  ) {}`
      : 'constructor() {}';

    return `import { Controller, Get, Post, Render, type IContext } from '@currentjs/router';
${useCaseImports}
${serviceImports.join('\n')}
${dtoImportStatements}

@Controller('${prefix}')
export class ${controllerName} {
  ${constructorBlock}

${methods.join('\n\n')}
}`;
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};
    const childEntityMap = buildChildEntityMap(config);

    // Generate API controllers
    if (config.api) {
      Object.entries(config.api).forEach(([resourceName, resourceConfig]) => {
        const childInfo = childEntityMap.get(resourceName);
        const code = this.generateApiController(
          resourceName,
          resourceConfig.prefix,
          resourceConfig.endpoints,
          childInfo
        );
        result[`${resourceName}Api`] = code;
      });
    }

    // Generate Web controllers
    if (config.web) {
      Object.entries(config.web).forEach(([resourceName, resourceConfig]) => {
        const childInfo = childEntityMap.get(resourceName);
        const code = this.generateWebController(
          resourceName,
          resourceConfig.prefix,
          resourceConfig.layout || 'main_view',
          resourceConfig.pages,
          config,
          childInfo
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
      throw new Error('Configuration does not match new module format. Expected domain/useCases/api/web structure.');
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
