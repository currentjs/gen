import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  ModuleConfig,
  UseCaseDefinition,
  AggregateConfig,
  isValidModuleConfig 
} from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo } from '../utils/childEntityUtils';
import { capitalize, mapType as mapTypeUtil, isAggregateReference } from '../utils/typeUtils';

export class ServiceGenerator {
  private availableAggregates: Map<string, AggregateConfig> = new Map();

  private mapType(yamlType: string): string {
    return mapTypeUtil(yamlType, this.availableAggregates);
  }

  private generateListHandler(modelName: string, storeName: string): string {
    return `  async list(page: number = 1, limit: number = 20): Promise<{ items: ${modelName}[]; total: number; page: number; limit: number }> {
    const [items, total] = await Promise.all([
      this.${storeName}.getAll(page, limit),
      this.${storeName}.count()
    ]);
    return { items, total, page, limit };
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
    childInfo?: ChildEntityInfo
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
      if (isAggregateReference(fieldConfig.type, this.availableAggregates)) {
        return `input.${fieldName} != null ? ({ id: input.${fieldName} } as unknown as ${fieldConfig.type}) : undefined`;
      }
      return `input.${fieldName}`;
    }).join(', ');
    const constructorArgs = `input.${firstArgField}, ${fieldArgs}`;
    return `  async create(input: any): Promise<${modelName}> {
    const ${entityLower} = new ${modelName}(0, ${constructorArgs});
    return await this.${storeName}.insert(${entityLower});
  }`;
  }

  private generateUpdateHandler(
    modelName: string,
    storeName: string,
    aggregateConfig: AggregateConfig
  ): string {
    const setterCalls = Object.entries(aggregateConfig.fields)
      .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id')
      .map(([fieldName, fieldConfig]) => {
        const methodName = `set${capitalize(fieldName)}`;
        if (isAggregateReference(fieldConfig.type, this.availableAggregates)) {
          return `    if (input.${fieldName} !== undefined) {
      existing${modelName}.${methodName}(input.${fieldName} != null ? ({ id: input.${fieldName} } as unknown as ${fieldConfig.type}) : undefined);
    }`;
        }
        return `    if (input.${fieldName} !== undefined) {
      existing${modelName}.${methodName}(input.${fieldName});
    }`;
      })
      .join('\n');
    return `  async update(id: number, input: any): Promise<${modelName}> {
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
    childInfo?: ChildEntityInfo
  ): string {
    const entityLower = modelName.toLowerCase();
    const storeName = `${entityLower}Store`;

    switch (actionName) {
      case 'list':
        return this.generateListHandler(modelName, storeName);
      case 'get':
        return this.generateGetHandler(modelName, storeName, entityLower);
      case 'create':
        return this.generateCreateHandler(modelName, storeName, entityLower, aggregateConfig, childInfo);
      case 'update':
        return this.generateUpdateHandler(modelName, storeName, aggregateConfig);
      case 'delete':
        return this.generateDeleteHandler(modelName, storeName);
      default:
        return `  async ${actionName}(input: any): Promise<any> {
    // TODO: Implement default ${actionName} handler
    throw new Error('Not implemented');
  }`;
    }
  }

  private generateCustomHandlerMethod(
    modelName: string,
    handlerName: string
  ): string {
    return `  async ${handlerName}(result: any, input: any): Promise<any> {
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

    // Collect all unique handlers
    const handlers = this.collectHandlers(useCases);

    // Generate methods for each handler
    const methods: string[] = [];
    
    handlers.forEach(handler => {
      if (handler.startsWith('default:')) {
        const actionName = handler.replace('default:', '');
        methods.push(this.generateDefaultHandlerMethod(modelName, actionName, aggregateConfig, childInfo));
      } else {
        methods.push(this.generateCustomHandlerMethod(modelName, handler));
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

    return `import { Injectable } from '../../../../system';
import { ${modelName} } from '../../domain/entities/${modelName}';${aggRefImportStr}
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
