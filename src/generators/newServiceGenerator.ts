import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  NewModuleConfig,
  UseCaseDefinition,
  AggregateConfig,
  isNewModuleConfig 
} from '../types/configTypes';

interface TypeMapping {
  [key: string]: string;
}

export class NewServiceGenerator {
  private typeMapping: TypeMapping = {
    string: 'string',
    number: 'number',
    integer: 'number',
    decimal: 'number',
    boolean: 'boolean',
    datetime: 'Date',
    date: 'Date',
    id: 'number',
    money: 'Money',
    json: 'any',
    array: 'any[]',
    object: 'object'
  };

  private availableAggregates: Map<string, AggregateConfig> = new Map();

  private mapType(yamlType: string): string {
    if (this.availableAggregates.has(yamlType)) {
      return yamlType;
    }
    return this.typeMapping[yamlType] || 'any';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private generateDefaultHandlerMethod(
    modelName: string,
    actionName: string,
    aggregateConfig: AggregateConfig
  ): string {
    const entityLower = modelName.toLowerCase();
    const storeName = `${entityLower}Store`;

    switch (actionName) {
      case 'list':
        return `  async list(page: number = 1, limit: number = 20): Promise<{ items: ${modelName}[]; total: number; page: number; limit: number }> {
    const [items, total] = await Promise.all([
      this.${storeName}.getAll(page, limit),
      this.${storeName}.count()
    ]);
    return { items, total, page, limit };
  }`;

      case 'get':
        return `  async get(id: number): Promise<${modelName}> {
    const ${entityLower} = await this.${storeName}.getById(id);
    if (!${entityLower}) {
      throw new Error('${modelName} not found');
    }
    return ${entityLower};
  }`;

      case 'create':
        // Generate constructor args
        const fields = Object.entries(aggregateConfig.fields)
          .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id')
          .sort((a, b) => {
            const aRequired = a[1].required !== false;
            const bRequired = b[1].required !== false;
            if (aRequired === bRequired) return 0;
            return aRequired ? -1 : 1;
          });
        
        const fieldArgs = fields
          .map(([fieldName]) => `input.${fieldName}`)
          .join(', ');
        
        // For aggregate roots, include ownerId as the second argument
        const isRoot = aggregateConfig.root === true;
        const constructorArgs = isRoot
          ? `input.ownerId, ${fieldArgs}`
          : fieldArgs;

        return `  async create(input: any): Promise<${modelName}> {
    const ${entityLower} = new ${modelName}(0, ${constructorArgs});
    return await this.${storeName}.insert(${entityLower});
  }`;

      case 'update':
        const setterCalls = Object.entries(aggregateConfig.fields)
          .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id')
          .map(([fieldName]) => {
            const methodName = `set${this.capitalize(fieldName)}`;
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

      case 'delete':
        return `  async delete(id: number): Promise<{ success: boolean; message: string }> {
    const success = await this.${storeName}.softDelete(id);
    if (!success) {
      throw new Error('${modelName} not found or could not be deleted');
    }
    return { success: true, message: '${modelName} deleted successfully' };
  }`;

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

  /**
   * Generate getResourceOwner method for aggregate roots.
   * This method is used by the use case for pre-mutation authorization checks.
   */
  private generateGetResourceOwnerMethod(modelName: string, isRoot: boolean): string {
    if (!isRoot) {
      return '';
    }
    
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
    aggregateConfig: AggregateConfig
  ): string {
    const serviceName = `${modelName}Service`;
    const storeName = `${modelName}Store`;
    const storeVar = `${modelName.toLowerCase()}Store`;
    const isRoot = aggregateConfig.root === true;

    // Collect all unique handlers
    const handlers = this.collectHandlers(useCases);

    // Generate methods for each handler
    const methods: string[] = [];
    
    handlers.forEach(handler => {
      if (handler.startsWith('default:')) {
        const actionName = handler.replace('default:', '');
        methods.push(this.generateDefaultHandlerMethod(modelName, actionName, aggregateConfig));
      } else {
        methods.push(this.generateCustomHandlerMethod(modelName, handler));
      }
    });

    // Add getResourceOwner method for aggregate roots
    const getResourceOwnerMethod = this.generateGetResourceOwnerMethod(modelName, isRoot);
    if (getResourceOwnerMethod) {
      methods.push(getResourceOwnerMethod);
    }

    return `import { ${modelName} } from '../../domain/entities/${modelName}';
import { ${storeName} } from '../../infrastructure/stores/${storeName}';

/**
 * Service layer for ${modelName}
 * Contains business logic handlers that can be composed in use cases
 */
export class ${serviceName} {
  constructor(
    private ${storeVar}: ${storeName}
  ) {}

${methods.join('\n\n')}
}`;
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // Collect all aggregates
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    // Generate a Service file for each model
    Object.entries(config.useCases).forEach(([modelName, useCases]) => {
      const aggregateConfig = this.availableAggregates.get(modelName);
      
      if (!aggregateConfig) {
        console.warn(`Warning: No aggregate found for model ${modelName}`);
        return;
      }

      result[modelName] = this.generateService(modelName, useCases, aggregateConfig);
    });

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isNewModuleConfig(config)) {
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

