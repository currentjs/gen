import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  ModuleConfig,
  ApiEndpointConfig,
  WebPageConfig,
  AuthConfig,
  UseCasesConfig,
  UseCaseDefinition,
  isValidModuleConfig,
  IdentifierType,
  idTsType
} from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo, getChildrenOfParent, ParentChildInfo } from '../utils/childEntityUtils';
import { capitalize } from '../utils/typeUtils';
import { AUTH_ROLES, AUTH_ERRORS } from '../utils/constants';

export class ControllerGenerator {
  private identifiers: IdentifierType = 'numeric';

  /** Returns the set of all imported query names declared in dependencies */
  private getImportedQueryNames(config: ModuleConfig): Set<string> {
    const names = new Set<string>();
    if (config.dependencies) {
      for (const depConfig of Object.values(config.dependencies)) {
        (depConfig.queries || []).forEach(q => names.add(q));
      }
    }
    return names;
  }

  /** Returns true when a model exists in dependencies but not in domain.aggregates (pseudo-model) */
  private isPseudoModel(model: string, config: ModuleConfig): boolean {
    const inDeps = !!config.dependencies && model in config.dependencies;
    const hasAggregate = !!config.domain?.aggregates && model in config.domain.aggregates;
    return inDeps && !hasAggregate;
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

  private normalizeAuth(auth?: AuthConfig): string[] {
    if (!auth) return [];
    if (Array.isArray(auth)) return auth;
    return [auth];
  }

  private hasOwnerAuth(auth?: AuthConfig): boolean {
    const roles = this.normalizeAuth(auth);
    return roles.includes(AUTH_ROLES.OWNER);
  }

  private getNeededHttpErrorImports(auths: (AuthConfig | undefined)[]): string[] {
    const needed = new Set<string>();
    for (const auth of auths) {
      const roles = this.normalizeAuth(auth);
      if (roles.length === 0 || (roles.length === 1 && roles[0] === AUTH_ROLES.ALL)) continue;

      needed.add('UnauthorizedError');

      const roleChecks = roles.filter(r => r !== AUTH_ROLES.OWNER && r !== AUTH_ROLES.ALL && r !== AUTH_ROLES.AUTHENTICATED);
      if (roleChecks.length > 0) {
        needed.add('ForbiddenError');
      }

      if (roles.includes(AUTH_ROLES.OWNER)) {
        needed.add('ForbiddenError');
        needed.add('NotFoundError');
      }
    }
    return Array.from(needed).sort();
  }

  private generateAuthCheck(auth?: AuthConfig): string {
    const roles = this.normalizeAuth(auth);
    
    if (roles.length === 0 || (roles.length === 1 && roles[0] === AUTH_ROLES.ALL)) {
      return '';
    }

    if (roles.length === 1 && roles[0] === AUTH_ROLES.AUTHENTICATED) {
      return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }`;
    }

    if (roles.length === 1 && roles[0] === AUTH_ROLES.OWNER) {
      return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }`;
    }

    const roleChecks = roles.filter(r => r !== AUTH_ROLES.OWNER && r !== AUTH_ROLES.ALL && r !== AUTH_ROLES.AUTHENTICATED);
    const hasOwner = roles.includes(AUTH_ROLES.OWNER);
    const hasAuthenticated = roles.includes(AUTH_ROLES.AUTHENTICATED);
    
    if (roleChecks.length > 0 || hasOwner) {
      if (roleChecks.length === 0) {
        return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }`;
      }
      
      if (roleChecks.length === 1 && !hasOwner) {
        return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }
    if (context.request.user.role !== '${roleChecks[0]}') {
      throw new ForbiddenError('${AUTH_ERRORS.INSUFFICIENT_PERMISSIONS}: ${roleChecks[0]} role required');
    }`;
      }
      
      if (hasOwner) {
        return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }`;
      }
      
      const roleConditions = roleChecks.map(r => `context.request.user.role === '${r}'`).join(' || ');
      return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }
    if (!(${roleConditions})) {
      throw new ForbiddenError('${AUTH_ERRORS.INSUFFICIENT_PERMISSIONS}: one of [${roleChecks.join(', ')}] role required');
    }`;
    }

    if (hasAuthenticated) {
      return `if (!context.request.user) {
      throw new UnauthorizedError('${AUTH_ERRORS.REQUIRED}');
    }`;
    }

    return '';
  }

  private generatePostFetchOwnerCheck(
    auth?: AuthConfig,
    resultVar: string = 'result',
    serviceVar?: string,
    childInfo?: ChildEntityInfo
  ): string {
    const roles = this.normalizeAuth(auth);
    
    if (!roles.includes(AUTH_ROLES.OWNER)) {
      return '';
    }

    const bypassRoles = roles.filter(r => r !== AUTH_ROLES.OWNER && r !== AUTH_ROLES.ALL && r !== AUTH_ROLES.AUTHENTICATED);

    if (childInfo && serviceVar) {
      if (bypassRoles.length === 0) {
        return `
    // Owner validation (post-fetch for reads, via parent)
    const resourceOwnerId = await this.${serviceVar}.getResourceOwner(${resultVar}.id);
    if (resourceOwnerId === null) {
      throw new NotFoundError('Resource not found');
    }
    if (resourceOwnerId !== context.request.user?.id) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }`;
      }
      const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
      return `
    // Owner validation (post-fetch for reads, via parent, bypassed for: ${bypassRoles.join(', ')})
    const resourceOwnerId = await this.${serviceVar}.getResourceOwner(${resultVar}.id);
    if (resourceOwnerId === null) {
      throw new NotFoundError('Resource not found');
    }
    const isOwner = resourceOwnerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }`;
    }

    if (bypassRoles.length === 0) {
      return `
    // Owner validation (post-fetch for reads)
    if (${resultVar}.ownerId !== context.request.user?.id) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }`;
    }
    const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
    return `
    // Owner validation (post-fetch for reads, bypassed for: ${bypassRoles.join(', ')})
    const isOwner = ${resultVar}.ownerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }`;
  }

  private generatePreMutationOwnerCheck(auth?: AuthConfig, serviceVar: string = 'service'): string {
    const roles = this.normalizeAuth(auth);
    
    if (!roles.includes(AUTH_ROLES.OWNER)) {
      return '';
    }

    const bypassRoles = roles.filter(r => r !== AUTH_ROLES.OWNER && r !== AUTH_ROLES.ALL && r !== AUTH_ROLES.AUTHENTICATED);
    
    if (bypassRoles.length === 0) {
      return `
    // Pre-mutation owner validation
    const resourceOwnerId = await this.${serviceVar}.getResourceOwner(input.id);
    if (resourceOwnerId === null) {
      throw new NotFoundError('Resource not found');
    }
    if (resourceOwnerId !== context.request.user?.id) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }
`;
    }
    
    const bypassConditions = bypassRoles.map(r => `context.request.user?.role === '${r}'`).join(' || ');
    return `
    // Pre-mutation owner validation (bypassed for: ${bypassRoles.join(', ')})
    const resourceOwnerId = await this.${serviceVar}.getResourceOwner(input.id);
    if (resourceOwnerId === null) {
      throw new NotFoundError('Resource not found');
    }
    const isOwner = resourceOwnerId === context.request.user?.id;
    const hasPrivilegedRole = ${bypassConditions};
    if (!isOwner && !hasPrivilegedRole) {
      throw new ForbiddenError('${AUTH_ERRORS.ACCESS_DENIED}');
    }
`;
  }

  /**
   * Generate inlined handler chain code (previously in UseCase layer).
   * Produces sequential service method calls from the handlers array.
   * Imported query handlers (names in importedQueryNames) are called via their query interface.
   * @param indent - indentation string for each generated line
   */
  private generateHandlerChain(
    actionName: string,
    useCaseDef: UseCaseDefinition,
    serviceVar: string,
    importedQueryNames: Set<string>,
    ownerIdArg?: string,
    indent: string = '    '
  ): string {
    const handlers = useCaseDef.handlers;

    const lines = handlers.map((handler, index) => {
      const isLast = index === handlers.length - 1;
      const resultVar = isLast ? 'result' : `result${index}`;

      if (handler.startsWith('default:')) {
        const defaultAction = handler.replace('default:', '');
        let params = '';
        if (defaultAction === 'list') {
          if (useCaseDef.input?.pagination) {
            params = ownerIdArg
              ? `input.page || 1, input.limit || 20, ${ownerIdArg}`
              : 'input.page || 1, input.limit || 20';
          } else {
            params = ownerIdArg ? ownerIdArg : '';
          }
        } else if (defaultAction === 'get') {
          params = 'input.id';
        } else if (defaultAction === 'create') {
          params = 'input';
        } else if (defaultAction === 'update') {
          params = 'input.id, input';
        } else if (defaultAction === 'delete') {
          params = 'input.id';
        } else {
          params = 'input';
        }
        return `${indent}const ${resultVar} = await this.${serviceVar}.${defaultAction}(${params});`;
      } else if (importedQueryNames.has(handler)) {
        // Imported cross-module query: call via the query interface instance
        const pascalQuery = capitalize(handler);
        const queryVar = `${handler}Query`;
        return `${indent}const ${resultVar} = await this.${queryVar}.execute(${pascalQuery}Input.parse({ ...context.request.body, ...context.request.parameters }));`;
      } else {
        const prevResult = index === 0 ? 'null' : `result${index - 1}`;
        return `${indent}const ${resultVar} = await this.${serviceVar}.${handler}(${prevResult}, input);`;
      }
    });

    return lines.join('\n');
  }

  /** Collect all imported query names actually used across a set of handler lists */
  private collectUsedImportedQueries(
    handlers: string[],
    importedQueryNames: Set<string>
  ): Set<string> {
    const used = new Set<string>();
    for (const h of handlers) {
      if (importedQueryNames.has(h)) used.add(h);
    }
    return used;
  }

  private generateApiEndpointMethod(
    endpoint: ApiEndpointConfig,
    resourceName: string,
    useCasesConfig: UseCasesConfig,
    config: ModuleConfig,
    importedQueryNames: Set<string>,
    childInfo?: ChildEntityInfo
  ): { method: string; dtoImports: Set<string>; voidOutputDtos: Set<string>; usedQueries: Set<string> } {
    const { model, action } = this.parseUseCase(endpoint.useCase);
    const methodName = action;
    const decorator = this.getHttpDecorator(endpoint.method);
    const serviceVar = `${model.toLowerCase()}Service`;
    const isPseudo = this.isPseudoModel(model, config);
    const inputClass = `${model}${capitalize(action)}Input`;
    const outputClass = `${model}${capitalize(action)}Output`;
    const useCaseDef = useCasesConfig[model]?.[action];
    const isVoidOutput = !useCaseDef?.output || useCaseDef.output === 'void';

    const dtoImports = new Set<string>();
    const voidOutputDtos = new Set<string>();
    const usedQueries = new Set<string>();

    // Pseudo-models have no aggregate DTOs — skip adding to dtoImports
    if (!isPseudo) {
      dtoImports.add(`${model}${capitalize(action)}`);
      if (isVoidOutput) {
        voidOutputDtos.add(`${model}${capitalize(action)}`);
      }
    }

    // Collect imported queries used by this endpoint
    if (useCaseDef) {
      useCaseDef.handlers.forEach(h => {
        if (importedQueryNames.has(h)) usedQueries.add(h);
      });
    }

    const authCheck = this.generateAuthCheck(endpoint.auth);
    const authLine = authCheck ? `\n    ${authCheck}\n` : '';

    const hasOwner = this.hasOwnerAuth(endpoint.auth);

    let parseLogic: string;
    if (isPseudo) {
      // Pseudo-models: no aggregate DTO, input parsed by each imported query handler individually
      parseLogic = '';
    } else if (action === 'list') {
      parseLogic = `const input = ${inputClass}.parse(context.request.parameters);`;
    } else if (action === 'get' || action === 'delete') {
      parseLogic = `const input = ${inputClass}.parse({ id: context.request.parameters.id });`;
    } else if (action === 'create') {
      if (childInfo) {
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} });`;
      } else {
        const idTs = idTsType(this.identifiers);
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ownerId: context.request.user?.id as ${idTs} });`;
      }
    } else if (action === 'update') {
      parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, id: context.request.parameters.id });`;
    } else {
      parseLogic = `const input = ${inputClass}.parse(context.request.body || {});`;
    }

    const isMutation = action === 'update' || action === 'delete';
    const isRead = action === 'get';
    
    const preMutationOwnerCheck = (!isPseudo && hasOwner && isMutation) 
      ? this.generatePreMutationOwnerCheck(endpoint.auth, serviceVar) 
      : '';
    
    const postFetchOwnerCheck = (!isPseudo && hasOwner && isRead) 
      ? this.generatePostFetchOwnerCheck(endpoint.auth, 'result', serviceVar, childInfo) 
      : '';

    // Pseudo-models: return result directly (already typed as query output)
    let outputTransform: string;
    if (isPseudo) {
      outputTransform = `return result;`;
    } else if (isVoidOutput || action === 'delete') {
      outputTransform = `return result;`;
    } else {
      outputTransform = `return ${outputClass}.from(result);`;
    }

    const ownerIdArg = (!isPseudo && hasOwner && action === 'list') ? 'context.request.user?.id as number' : undefined;

    let handlerChain: string;
    if (useCaseDef) {
      handlerChain = this.generateHandlerChain(action, useCaseDef, serviceVar, importedQueryNames, ownerIdArg, '    ');
    } else if (!isPseudo) {
      const callArg = ownerIdArg ? `input, ${ownerIdArg}` : 'input';
      handlerChain = `    const result = await this.${serviceVar}.${action}(${callArg});`;
    } else {
      handlerChain = `    // TODO: implement ${action} handler for ${model}`;
    }

    const parseLine = parseLogic ? `    ${parseLogic}` : '';
    const method = `  @${decorator}('${endpoint.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}${parseLine ? `\n${parseLine}` : ''}${preMutationOwnerCheck}
${handlerChain}${postFetchOwnerCheck}
    ${outputTransform}
  }`;

    return { method, dtoImports, voidOutputDtos, usedQueries };
  }

  private generateWebPageMethod(
    page: WebPageConfig,
    resourceName: string,
    layout: string | undefined,
    methodIndex: number,
    config: ModuleConfig,
    importedQueryNames: Set<string>,
    childInfo?: ChildEntityInfo,
    withChildChildren?: ParentChildInfo[]
  ): { method: string; dtoImports: Set<string>; usedQueries: Set<string> } {
    const method = page.method || 'GET';
    const decorator = this.getHttpDecorator(method);
    const dtoImports = new Set<string>();
    const usedQueries = new Set<string>();
    
    const pathSegments = page.path.split('/').filter(Boolean);
    let baseMethodName = pathSegments.length === 0 
      ? 'index'
      : pathSegments.map((seg, idx) => {
          if (seg.startsWith(':')) {
            return 'By' + capitalize(seg.slice(1));
          }
          return idx === 0 ? seg : capitalize(seg);
        }).join('');
    
    const methodName = method === 'POST' ? `${baseMethodName}Submit` : baseMethodName;

    const authCheck = this.generateAuthCheck(page.auth);
    const authLine = authCheck ? `\n    ${authCheck}\n` : '';

    if (method === 'GET' && page.view) {
      const pageLayout = this.resolveLayout(page.layout, layout);
      const renderDecorator = pageLayout
        ? `\n  @Render("${page.view}", "${pageLayout}")`
        : `\n  @Render("${page.view}")`;
      
      if (page.useCase) {
        const { model, action } = this.parseUseCase(page.useCase);
        const serviceVar = `${model.toLowerCase()}Service`;
        const inputClass = `${model}${capitalize(action)}Input`;
        const useCaseDef = config.useCases[model]?.[action];
        
        dtoImports.add(`${model}${capitalize(action)}`);

        const hasOwner = this.hasOwnerAuth(page.auth);

        let parseLogic: string;
        if (page.path.includes(':id')) {
          parseLogic = `const input = ${inputClass}.parse({ id: context.request.parameters.id });`;
        } else if (action === 'list') {
          parseLogic = `const input = ${inputClass}.parse(context.request.parameters);`;
        } else {
          parseLogic = `const input = ${inputClass}.parse({});`;
        }

        const isReadAction = action === 'get' || action === 'list';
        const postFetchOwnerCheck = (hasOwner && isReadAction) 
          ? this.generatePostFetchOwnerCheck(page.auth, 'result', serviceVar, childInfo) 
          : '';

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

        const ownerIdArg = (hasOwner && action === 'list') ? 'context.request.user?.id as number' : undefined;
        const loadChildCode = loadChildBlocks.length ? '\n    ' + loadChildBlocks.join('\n    ') + '\n    ' : '';

        let handlerChain: string;
        if (useCaseDef) {
          handlerChain = this.generateHandlerChain(action, useCaseDef, serviceVar, importedQueryNames, ownerIdArg, '    ');
          useCaseDef.handlers.forEach(h => { if (importedQueryNames.has(h)) usedQueries.add(h); });
        } else {
          const callArg = ownerIdArg ? `input, ${ownerIdArg}` : 'input';
          handlerChain = `    const result = await this.${serviceVar}.${action}(${callArg});`;
        }

        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    ${parseLogic}
${handlerChain}${postFetchOwnerCheck}${loadChildCode}
    return ${returnExpr};
  }`;

        return { method: methodCode, dtoImports, usedQueries };
      } else {
        const emptyFormData = childInfo
          ? `{ formData: {}, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} }`
          : '{ formData: {} }';
        const methodCode = `${renderDecorator}
  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    return ${emptyFormData};
  }`;

        return { method: methodCode, dtoImports, usedQueries };
      }
    } else if (method === 'POST' && page.useCase) {
      const { model, action } = this.parseUseCase(page.useCase);
      const serviceVar = `${model.toLowerCase()}Service`;
      const inputClass = `${model}${capitalize(action)}Input`;
      const useCaseDef = config.useCases[model]?.[action];

      dtoImports.add(`${model}${capitalize(action)}`);

      let parseLogic: string;
      if (page.path.includes(':id')) {
        parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, id: context.request.parameters.id });`;
      } else if (action === 'create') {
        if (childInfo) {
          parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ${childInfo.parentIdField}: context.request.parameters.${childInfo.parentIdField} });`;
        } else {
          const idTs = idTsType(this.identifiers);
          parseLogic = `const input = ${inputClass}.parse({ ...context.request.body, ownerId: context.request.user?.id as ${idTs} });`;
        }
      } else {
        parseLogic = `const input = ${inputClass}.parse(context.request.body);`;
      }

      const hasOwner = this.hasOwnerAuth(page.auth);
      const isMutation = action === 'update' || action === 'delete';
      const preMutationOwnerCheck = (hasOwner && isMutation) 
        ? this.generatePreMutationOwnerCheck(page.auth, serviceVar) 
        : '';

      const onSuccessHandler = this.generateOnSuccessHandler(page);
      const onErrorHandler = this.generateOnErrorHandler(page);

      let handlerChain: string;
      if (useCaseDef) {
        // Inside try block: use 6-space indent
        handlerChain = this.generateHandlerChain(action, useCaseDef, serviceVar, importedQueryNames, undefined, '      ');
        useCaseDef.handlers.forEach(h => { if (importedQueryNames.has(h)) usedQueries.add(h); });
      } else {
        handlerChain = `      const result = await this.${serviceVar}.${action}(input);`;
      }

      const methodCode = `  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {${authLine}
    try {
      ${parseLogic}${preMutationOwnerCheck}
${handlerChain}
      ${onSuccessHandler}
      return { success: true, data: result };
    } catch (error) {
      ${onErrorHandler}
      throw error;
    }
  }`;

      return { method: methodCode, dtoImports, usedQueries };
    }

    const methodCode = `  @${decorator}('${page.path}')
  async ${methodName}(context: IContext): Promise<any> {
    // TODO: Implement ${methodName}
    return {};
  }`;

    return { method: methodCode, dtoImports, usedQueries };
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

  private sortRoutesBySpecificity<T extends { path: string }>(routes: T[]): T[] {
    return [...routes].sort((a, b) => {
      const aSegments = a.path.split('/').filter(Boolean);
      const bSegments = b.path.split('/').filter(Boolean);
      const aParamCount = aSegments.filter(s => s.startsWith(':')).length;
      const bParamCount = bSegments.filter(s => s.startsWith(':')).length;
      return aParamCount - bParamCount;
    });
  }

  private resolveLayout(layout: string | undefined, fallback?: string): string | undefined {
    if (layout === undefined) {
      return fallback;
    }

    const normalized = layout.trim();
    if (!normalized || normalized.toLowerCase() === 'none') {
      return undefined;
    }

    return normalized;
  }

  private generateApiController(
    resourceName: string,
    prefix: string,
    endpoints: ApiEndpointConfig[],
    useCasesConfig: UseCasesConfig,
    config: ModuleConfig,
    importedQueryNames: Set<string>,
    childInfo?: ChildEntityInfo
  ): string {
    const controllerName = `${resourceName}ApiController`;
    
    const serviceModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const allVoidOutputDtos = new Set<string>();
    const allUsedQueries = new Set<string>();
    const methods: string[] = [];

    const sortedEndpoints = this.sortRoutesBySpecificity(endpoints);
    sortedEndpoints.forEach(endpoint => {
      const { model } = this.parseUseCase(endpoint.useCase);
      // Only add real models (not pseudo-models) to service deps
      if (!this.isPseudoModel(model, config)) {
        serviceModels.add(model);
      }
      
      const { method, dtoImports, voidOutputDtos, usedQueries } = this.generateApiEndpointMethod(
        endpoint, resourceName, useCasesConfig, config, importedQueryNames, childInfo
      );
      methods.push(method);
      dtoImports.forEach(d => allDtoImports.add(d));
      voidOutputDtos.forEach(d => allVoidOutputDtos.add(d));
      usedQueries.forEach(q => allUsedQueries.add(q));
    });

    const serviceImports = Array.from(serviceModels)
      .map(model => `import { ${model}Service } from '../../application/services/${model}Service';`)
      .join('\n');

    const dtoImportStatements = Array.from(allDtoImports)
      .map(dto => {
        if (allVoidOutputDtos.has(dto)) {
          return `import { ${dto}Input } from '../../application/dto/${dto}';`;
        }
        return `import { ${dto}Input, ${dto}Output } from '../../application/dto/${dto}';`;
      })
      .join('\n');

    // Imported query interface and input imports
    const queryImportStatements = Array.from(allUsedQueries)
      .map(q => {
        const pascal = capitalize(q);
        return `import { I${pascal}Query, ${pascal}Input } from '../../application/ports/${pascal}Interface';`;
      })
      .join('\n');

    const serviceConstructorParams = Array.from(serviceModels)
      .map(model => `private ${model.toLowerCase()}Service: ${model}Service`);
    const queryConstructorParams = Array.from(allUsedQueries)
      .map(q => `private ${q}Query: I${capitalize(q)}Query`);
    const allConstructorParams = [...serviceConstructorParams, ...queryConstructorParams].join(',\n    ');

    const errorImports = this.getNeededHttpErrorImports(sortedEndpoints.map(e => e.auth));
    const routerImports = ['Controller', 'Get', 'Post', 'Put', 'Delete', 'type IContext', ...errorImports].join(', ');

    const importLines = [
      `import { ${routerImports} } from '@currentjs/router';`,
      serviceImports,
      dtoImportStatements,
      queryImportStatements
    ].filter(Boolean).join('\n');

    return `${importLines}

@Controller('${prefix}')
export class ${controllerName} {
  constructor(
    ${allConstructorParams}
  ) {}

${methods.join('\n\n')}
}`;
  }

  private generateWebController(
    resourceName: string,
    prefix: string,
    layout: string | undefined,
    pages: WebPageConfig[],
    config: ModuleConfig,
    importedQueryNames: Set<string>,
    childInfo?: ChildEntityInfo
  ): string {
    const controllerName = `${resourceName}WebController`;
    
    const withChildChildren = childInfo ? [] : getChildrenOfParent(config, resourceName);

    const serviceModels = new Set<string>();
    const allDtoImports = new Set<string>();
    const allUsedQueries = new Set<string>();
    const methods: string[] = [];

    const sortedPages = this.sortRoutesBySpecificity(pages);
    sortedPages.forEach((page, index) => {
      if (page.useCase) {
        const { model } = this.parseUseCase(page.useCase);
        if (!this.isPseudoModel(model, config)) {
          serviceModels.add(model);
        }
      }

      const { model, action } = page.useCase ? this.parseUseCase(page.useCase) : { model: '', action: '' };
      const useCaseWithChild = model && action && (config.useCases[model] as Record<string, { withChild?: boolean }>)?.[action]?.withChild === true;
      const withChildForThisPage = useCaseWithChild && action === 'get' && withChildChildren.length > 0 ? withChildChildren : undefined;
      
      const { method, dtoImports, usedQueries } = this.generateWebPageMethod(
        page, resourceName, layout, index, config, importedQueryNames, childInfo, withChildForThisPage
      );
      methods.push(method);
      dtoImports.forEach(d => allDtoImports.add(d));
      usedQueries.forEach(q => allUsedQueries.add(q));
    });

    const needsChildServices = withChildChildren.length > 0 && sortedPages.some(page => {
      if (!page.useCase) return false;
      const { model: m, action: a } = this.parseUseCase(page.useCase);
      return a === 'get' && (config.useCases[m] as Record<string, { withChild?: boolean }>)?.[a]?.withChild === true;
    });

    const extraServiceImports: string[] = [];
    const constructorParams: string[] = [];
    Array.from(serviceModels).forEach(model => {
      constructorParams.push(`private ${model.toLowerCase()}Service: ${model}Service`);
    });
    if (needsChildServices) {
      withChildChildren.forEach(child => {
        const childVar = child.childEntityName.charAt(0).toLowerCase() + child.childEntityName.slice(1);
        extraServiceImports.push(`import { ${child.childEntityName}Service } from '../../application/services/${child.childEntityName}Service';`);
        constructorParams.push(`private ${childVar}Service: ${child.childEntityName}Service`);
      });
    }
    // Imported query constructor params
    Array.from(allUsedQueries).forEach(q => {
      constructorParams.push(`private ${q}Query: I${capitalize(q)}Query`);
    });

    const serviceImports = Array.from(serviceModels)
      .map(model => `import { ${model}Service } from '../../application/services/${model}Service';`)
      .join('\n');

    const dtoImportStatements = Array.from(allDtoImports)
      .map(dto => `import { ${dto}Input } from '../../application/dto/${dto}';`)
      .join('\n');

    const queryImportStatements = Array.from(allUsedQueries)
      .map(q => {
        const pascal = capitalize(q);
        return `import { I${pascal}Query } from '../../application/ports/${pascal}Interface';`;
      })
      .join('\n');

    const constructorBlock = constructorParams.length > 0
      ? `constructor(
    ${constructorParams.join(',\n    ')}
  ) {}`
      : 'constructor() {}';

    const errorImports = this.getNeededHttpErrorImports(sortedPages.map(p => p.auth));
    const routerImports = ['Controller', 'Get', 'Post', 'Render', 'type IContext', ...errorImports].join(', ');

    const importLines = [
      `import { ${routerImports} } from '@currentjs/router';`,
      serviceImports,
      extraServiceImports.join('\n'),
      dtoImportStatements,
      queryImportStatements
    ].filter(Boolean).join('\n');

    return `${importLines}

@Controller('${prefix}')
export class ${controllerName} {
  ${constructorBlock}

${methods.join('\n\n')}
}`;
  }

  public generateFromConfig(config: ModuleConfig, identifiers: IdentifierType = 'numeric'): Record<string, string> {
    const result: Record<string, string> = {};
    this.identifiers = identifiers;
    const childEntityMap = buildChildEntityMap(config);
    const importedQueryNames = this.getImportedQueryNames(config);

    if (config.api) {
      Object.entries(config.api).forEach(([resourceName, resourceConfig]) => {
        const childInfo = childEntityMap.get(resourceName);
        const code = this.generateApiController(
          resourceName,
          resourceConfig.prefix,
          resourceConfig.endpoints,
          config.useCases,
          config,
          importedQueryNames,
          childInfo
        );
        result[`${resourceName}Api`] = code;
      });
    }

    if (config.web) {
      Object.entries(config.web).forEach(([resourceName, resourceConfig]) => {
        const childInfo = childEntityMap.get(resourceName);
        const moduleLayout = this.resolveLayout(resourceConfig.layout, 'main_view');
        const code = this.generateWebController(
          resourceName,
          resourceConfig.prefix,
          moduleLayout,
          resourceConfig.pages,
          config,
          importedQueryNames,
          childInfo
        );
        result[`${resourceName}Web`] = code;
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string, identifiers: IdentifierType = 'numeric'): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain/useCases/api/web structure.');
    }

    return this.generateFromConfig(config, identifiers);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean },
    identifiers: IdentifierType = 'numeric'
  ): Promise<string[]> {
    const controllersByName = this.generateFromYamlFile(yamlFilePath, identifiers);
    
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
