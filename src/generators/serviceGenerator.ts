import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  ModuleConfig,
  UseCaseDefinition,
  UseCaseInputConfig,
  AggregateConfig,
  isValidModuleConfig 
} from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo } from '../utils/childEntityUtils';
import { capitalize, mapType as mapTypeUtil, isAggregateReference } from '../utils/typeUtils';

interface HandlerContext {
  actionName: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  prevHandlerReturnType: string | null;
  inputDtoType: string;
  useCaseReturnType: string;
  inputConfig?: UseCaseInputConfig;
}

export class ServiceGenerator {
  private availableAggregates: Map<string, AggregateConfig> = new Map();

  private mapType(yamlType: string): string {
    return mapTypeUtil(yamlType, this.availableAggregates);
  }

  private getDefaultHandlerReturnType(actionName: string, modelName: string): string {
    switch (actionName) {
      case 'create':
      case 'get':
      case 'update':
        return modelName;
      case 'delete':
        return '{ success: boolean; message: string }';
      case 'list':
        return `{ items: ${modelName}[]; total: number; page: number; limit: number }`;
      default:
        return modelName;
    }
  }

  private buildHandlerContextMap(
    modelName: string,
    useCases: Record<string, UseCaseDefinition>
  ): Map<string, HandlerContext[]> {
    const contextMap = new Map<string, HandlerContext[]>();

    Object.entries(useCases).forEach(([actionName, useCaseConfig]) => {
      const inputDtoType = `${modelName}${capitalize(actionName)}Input`;

      let useCaseReturnType: string;
      if (useCaseConfig.output === 'void') {
        useCaseReturnType = '{ success: boolean; message: string }';
      } else if (actionName === 'list') {
        useCaseReturnType = `{ items: ${modelName}[]; total: number; page: number; limit: number }`;
      } else {
        useCaseReturnType = modelName;
      }

      useCaseConfig.handlers.forEach((handler, index) => {
        const isFirst = index === 0;
        const isLast = index === useCaseConfig.handlers.length - 1;

        let prevHandlerReturnType: string | null = null;
        if (!isFirst) {
          const prevHandler = useCaseConfig.handlers[index - 1];
          if (prevHandler.startsWith('default:')) {
            prevHandlerReturnType = this.getDefaultHandlerReturnType(
              prevHandler.replace('default:', ''),
              modelName
            );
          } else {
            prevHandlerReturnType = modelName;
          }
        }

        const context: HandlerContext = {
          actionName,
          index,
          isFirst,
          isLast,
          prevHandlerReturnType,
          inputDtoType,
          useCaseReturnType,
          inputConfig: useCaseConfig.input
        };

        const existing = contextMap.get(handler) || [];
        existing.push(context);
        contextMap.set(handler, existing);
      });
    });

    return contextMap;
  }

  private deriveInputType(contexts: HandlerContext[]): string {
    const inputTypes = [...new Set(contexts.map(c => c.inputDtoType))];
    return inputTypes.join(' | ');
  }

  private deriveCustomHandlerTypes(
    contexts: HandlerContext[],
    modelName: string
  ): { inputType: string; resultType: string; returnType: string } {
    const inputTypes = [...new Set(contexts.map(c => c.inputDtoType))];

    const resultTypeParts: Set<string> = new Set();
    contexts.forEach(c => {
      if (c.isFirst) {
        resultTypeParts.add('null');
      }
      if (c.prevHandlerReturnType) {
        resultTypeParts.add(c.prevHandlerReturnType);
      }
    });

    const returnTypeParts: Set<string> = new Set();
    contexts.forEach(c => {
      if (c.isLast) {
        returnTypeParts.add(c.useCaseReturnType);
      } else {
        returnTypeParts.add(modelName);
      }
    });

    return {
      inputType: inputTypes.join(' | '),
      resultType: [...resultTypeParts].join(' | '),
      returnType: [...returnTypeParts].join(' | ')
    };
  }

  private getInputDtoFields(
    inputConfig: UseCaseInputConfig | undefined,
    aggregateConfig: AggregateConfig,
    childInfo?: ChildEntityInfo
  ): Set<string> {
    const fields = new Set<string>();
    if (!inputConfig) return fields;

    if (!inputConfig.identifier && !inputConfig.partial) {
      fields.add(childInfo ? childInfo.parentIdField : 'ownerId');
    }

    if (inputConfig.from) {
      let fieldNames = Object.keys(aggregateConfig.fields)
        .filter(f => !aggregateConfig.fields[f].auto && f !== 'id');

      if (inputConfig.pick && inputConfig.pick.length > 0) {
        fieldNames = fieldNames.filter(f => inputConfig.pick!.includes(f));
      }
      if (inputConfig.omit && inputConfig.omit.length > 0) {
        fieldNames = fieldNames.filter(f => !inputConfig.omit!.includes(f));
      }
      fieldNames.forEach(f => fields.add(f));
    }

    if (inputConfig.add) {
      Object.keys(inputConfig.add).forEach(f => fields.add(f));
    }

    return fields;
  }

  private computeDtoFieldsForHandler(
    contexts: HandlerContext[],
    aggregateConfig: AggregateConfig,
    childInfo?: ChildEntityInfo
  ): Set<string> {
    const fieldSets = contexts.map(ctx =>
      this.getInputDtoFields(ctx.inputConfig, aggregateConfig, childInfo)
    );

    if (fieldSets.length === 0) {
      return new Set(
        Object.keys(aggregateConfig.fields).filter(f => !aggregateConfig.fields[f].auto && f !== 'id')
      );
    }

    const result = new Set(fieldSets[0]);
    for (let i = 1; i < fieldSets.length; i++) {
      for (const field of result) {
        if (!fieldSets[i].has(field)) {
          result.delete(field);
        }
      }
    }
    return result;
  }

  private generateListHandler(
    modelName: string,
    storeName: string,
    hasPagination: boolean
  ): string {
    const returnType = `{ items: ${modelName}[]; total: number; page: number; limit: number }`;

    if (hasPagination) {
      return `  async list(page: number = 1, limit: number = 20, ownerId?: number): Promise<${returnType}> {
    const [items, total] = await Promise.all([
      this.${storeName}.getPaginated(page, limit, ownerId),
      this.${storeName}.count(ownerId)
    ]);
    return { items, total, page, limit };
  }`;
    }

    return `  async list(ownerId?: number): Promise<${returnType}> {
    const items = await this.${storeName}.getAll(ownerId);
    return { items, total: items.length, page: 1, limit: items.length };
  }`;
  }

  private generateGetHandler(modelName: string, storeName: string, entityLower: string): string {
    return `  async get(id: number): Promise<${modelName}> {
    const ${entityLower} = await this.${storeName}.getById(id);
    if (!${entityLower}) {
      throw new Error('${modelName} not found');
    }
    return ${entityLower};
  }`;
  }

  private generateCreateHandler(
    modelName: string,
    storeName: string,
    entityLower: string,
    aggregateConfig: AggregateConfig,
    childInfo: ChildEntityInfo | undefined,
    inputType: string,
    dtoFields: Set<string>
  ): string {
    const firstArgField = childInfo ? childInfo.parentIdField : 'ownerId';
    const fields = Object.entries(aggregateConfig.fields)
      .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id')
      .sort((a, b) => {
        const aIsAggRef = isAggregateReference(a[1].type, this.availableAggregates);
        const bIsAggRef = isAggregateReference(b[1].type, this.availableAggregates);
        const aRequired = a[1].required !== false && !aIsAggRef;
        const bRequired = b[1].required !== false && !bIsAggRef;
        if (aRequired === bRequired) return 0;
        return aRequired ? -1 : 1;
      });
    const fieldArgs = fields.map(([fieldName, fieldConfig]) => {
      if (!dtoFields.has(fieldName)) {
        return 'undefined';
      }
      if (isAggregateReference(fieldConfig.type, this.availableAggregates)) {
        return `input.${fieldName} != null ? ({ id: input.${fieldName} } as unknown as ${fieldConfig.type}) : undefined`;
      }
      if (fieldConfig.type === 'enum' && fieldConfig.values && fieldConfig.values.length > 0) {
        const enumTypeName = `${modelName}${capitalize(fieldName)}`;
        return `input.${fieldName} as ${enumTypeName}`;
      }
      return `input.${fieldName}`;
    }).join(', ');
    const constructorArgs = `input.${firstArgField}, ${fieldArgs}`;
    return `  async create(input: ${inputType}): Promise<${modelName}> {
    const ${entityLower} = new ${modelName}(0, ${constructorArgs});
    return await this.${storeName}.insert(${entityLower});
  }`;
  }

  private generateUpdateHandler(
    modelName: string,
    storeName: string,
    aggregateConfig: AggregateConfig,
    inputType: string,
    dtoFields: Set<string>
  ): string {
    const setterCalls = Object.entries(aggregateConfig.fields)
      .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id' && dtoFields.has(fieldName))
      .map(([fieldName, fieldConfig]) => {
        const methodName = `set${capitalize(fieldName)}`;
        if (isAggregateReference(fieldConfig.type, this.availableAggregates)) {
          return `    if (input.${fieldName} !== undefined) {
      existing${modelName}.${methodName}(input.${fieldName} != null ? ({ id: input.${fieldName} } as unknown as ${fieldConfig.type}) : undefined);
    }`;
        }
        if (fieldConfig.type === 'enum' && fieldConfig.values && fieldConfig.values.length > 0) {
          const enumTypeName = `${modelName}${capitalize(fieldName)}`;
          return `    if (input.${fieldName} !== undefined) {
      existing${modelName}.${methodName}(input.${fieldName} as ${enumTypeName});
    }`;
        }
        return `    if (input.${fieldName} !== undefined) {
      existing${modelName}.${methodName}(input.${fieldName});
    }`;
      })
      .join('\n');
    return `  async update(id: number, input: ${inputType}): Promise<${modelName}> {
    const existing${modelName} = await this.${storeName}.getById(id);
    if (!existing${modelName}) {
      throw new Error('${modelName} not found');
    }
    
${setterCalls}
    
    return await this.${storeName}.update(id, existing${modelName});
  }`;
  }

  private generateDeleteHandler(modelName: string, storeName: string): string {
    return `  async delete(id: number): Promise<{ success: boolean; message: string }> {
    const success = await this.${storeName}.softDelete(id);
    if (!success) {
      throw new Error('${modelName} not found or could not be deleted');
    }
    return { success: true, message: '${modelName} deleted successfully' };
  }`;
  }

  private generateDefaultHandlerMethod(
    modelName: string,
    actionName: string,
    aggregateConfig: AggregateConfig,
    childInfo: ChildEntityInfo | undefined,
    inputType: string,
    dtoFields: Set<string>,
    listConfig?: { hasPagination: boolean }
  ): string {
    const entityLower = modelName.toLowerCase();
    const storeName = `${entityLower}Store`;

    switch (actionName) {
      case 'list':
        return this.generateListHandler(
          modelName,
          storeName,
          listConfig?.hasPagination ?? true
        );
      case 'get':
        return this.generateGetHandler(modelName, storeName, entityLower);
      case 'create':
        return this.generateCreateHandler(modelName, storeName, entityLower, aggregateConfig, childInfo, inputType, dtoFields);
      case 'update':
        return this.generateUpdateHandler(modelName, storeName, aggregateConfig, inputType, dtoFields);
      case 'delete':
        return this.generateDeleteHandler(modelName, storeName);
      default:
        return `  async ${actionName}(input: ${inputType}): Promise<${modelName}> {
    // TODO: Implement default ${actionName} handler
    throw new Error('Not implemented');
  }`;
    }
  }

  private generateCustomHandlerMethod(
    modelName: string,
    handlerName: string,
    resultType: string,
    inputType: string,
    returnType: string
  ): string {
    return `  async ${handlerName}(result: ${resultType}, input: ${inputType}): Promise<${returnType}> {
    // TODO: Implement custom ${handlerName} handler
    // This method receives the result from the previous handler (or null if first)
    // and the input context
    return result;
  }`;
  }

  private collectHandlers(useCases: Record<string, UseCaseDefinition>): Set<string> {
    const handlers = new Set<string>();
    
    Object.values(useCases).forEach(useCaseConfig => {
      useCaseConfig.handlers.forEach(handler => {
        handlers.add(handler);
      });
    });

    return handlers;
  }

  private generateListByParentMethod(modelName: string, childInfo?: ChildEntityInfo): string {
    if (!childInfo) return '';
    const storeVar = `${modelName.toLowerCase()}Store`;
    return `
  async listByParent(parentId: number): Promise<${modelName}[]> {
    return await this.${storeVar}.getByParentId(parentId);
  }`;
  }

  private generateGetResourceOwnerMethod(modelName: string): string {
    const storeVar = `${modelName.toLowerCase()}Store`;
    
    return `
  /**
   * Get the owner ID of a resource by its ID.
   * Used for pre-mutation authorization checks.
   */
  async getResourceOwner(id: number): Promise<number | null> {
    return await this.${storeVar}.getResourceOwner(id);
  }`;
  }

  private generateService(
    modelName: string,
    useCases: Record<string, UseCaseDefinition>,
    aggregateConfig: AggregateConfig,
    childInfo?: ChildEntityInfo
  ): string {
    const serviceName = `${modelName}Service`;
    const storeName = `${modelName}Store`;
    const storeVar = `${modelName.toLowerCase()}Store`;

    // Build handler-to-context map for type inference
    const handlerContextMap = this.buildHandlerContextMap(modelName, useCases);

    // Collect all unique handlers
    const handlers = this.collectHandlers(useCases);

    // Collect DTO types needed for imports
    const dtoTypes = new Set<string>();
    const enumTypeNames = new Set<string>();

    // Generate methods for each handler
    const methods: string[] = [];
    
    handlers.forEach(handler => {
      const contexts = handlerContextMap.get(handler) || [];

      if (handler.startsWith('default:')) {
        const actionName = handler.replace('default:', '');
        const inputType = this.deriveInputType(contexts);
        const dtoFields = this.computeDtoFieldsForHandler(contexts, aggregateConfig, childInfo);

        if (actionName !== 'list' && actionName !== 'get' && actionName !== 'delete') {
          contexts.forEach(c => dtoTypes.add(c.inputDtoType));
        }

        if (actionName === 'create' || actionName === 'update') {
          for (const [fieldName, fieldConfig] of Object.entries(aggregateConfig.fields)) {
            if (fieldConfig.type === 'enum' && fieldConfig.values && fieldConfig.values.length > 0 && dtoFields.has(fieldName)) {
              enumTypeNames.add(`${modelName}${capitalize(fieldName)}`);
            }
          }
        }

        const listConfig = actionName === 'list'
          ? { hasPagination: !!(contexts[0]?.inputConfig?.pagination) }
          : undefined;
        methods.push(this.generateDefaultHandlerMethod(modelName, actionName, aggregateConfig, childInfo, inputType, dtoFields, listConfig));
      } else {
        const { inputType, resultType, returnType } = this.deriveCustomHandlerTypes(contexts, modelName);
        contexts.forEach(c => dtoTypes.add(c.inputDtoType));
        methods.push(this.generateCustomHandlerMethod(modelName, handler, resultType, inputType, returnType));
      }
    });

    const listByParentMethod = this.generateListByParentMethod(modelName, childInfo);
    if (listByParentMethod) {
      methods.push(listByParentMethod);
    }

    const getResourceOwnerMethod = this.generateGetResourceOwnerMethod(modelName);
    if (getResourceOwnerMethod) {
      methods.push(getResourceOwnerMethod);
    }

    // Collect imports for aggregate reference types used in fields
    const aggRefImports = Object.entries(aggregateConfig.fields)
      .filter(([, fc]) => isAggregateReference(fc.type, this.availableAggregates) && fc.type !== modelName)
      .map(([, fc]) => `import { ${fc.type} } from '../../domain/entities/${fc.type}';`)
      .filter((imp, idx, arr) => arr.indexOf(imp) === idx);

    const aggRefImportStr = aggRefImports.length > 0 ? '\n' + aggRefImports.join('\n') : '';

    // Generate DTO import statements
    const dtoImports = [...dtoTypes].map(dtoType => {
      const fileSuffix = dtoType.replace(modelName, '').replace('Input', '');
      return `import { ${dtoType} } from '../dto/${modelName}${fileSuffix}';`;
    }).join('\n');
    const dtoImportStr = dtoImports ? '\n' + dtoImports : '';

    const entityImports = [modelName, ...enumTypeNames].join(', ');

    return `import { Injectable } from '../../../../system';
import { ${entityImports} } from '../../domain/entities/${modelName}';${aggRefImportStr}${dtoImportStr}
import { ${storeName} } from '../../infrastructure/stores/${storeName}';

/**
 * Service layer for ${modelName}
 * Contains business logic handlers that can be composed in use cases
 */
@Injectable()
export class ${serviceName} {
  constructor(
    private ${storeVar}: ${storeName}
  ) {}

${methods.join('\n\n')}
}`;
  }

  public generateFromConfig(config: ModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // Collect all aggregates
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    const childEntityMap = buildChildEntityMap(config);

    // Generate a Service file for each model
    Object.entries(config.useCases).forEach(([modelName, useCases]) => {
      const aggregateConfig = this.availableAggregates.get(modelName);
      
      if (!aggregateConfig) {
        console.warn(`Warning: No aggregate found for model ${modelName}`);
        return;
      }

      const childInfo = childEntityMap.get(modelName);
      result[modelName] = this.generateService(modelName, useCases, aggregateConfig, childInfo);
    });

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected useCases structure.');
    }

    return this.generateFromConfig(config);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const servicesByModel = this.generateFromYamlFile(yamlFilePath);
    
    const servicesDir = path.join(moduleDir, 'application', 'services');
    fs.mkdirSync(servicesDir, { recursive: true });

    for (const [modelName, code] of Object.entries(servicesByModel)) {
      const filePath = path.join(servicesDir, `${modelName}Service.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Service files generated successfully!') + '\n');
  }
}
