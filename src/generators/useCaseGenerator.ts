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
import { capitalize } from '../utils/typeUtils';

export class UseCaseGenerator {
  private availableAggregates: Map<string, AggregateConfig> = new Map();

  private generateUseCaseMethod(
    modelName: string,
    actionName: string,
    useCaseConfig: UseCaseDefinition
  ): string {
    const methodName = actionName;
    const inputType = `${modelName}${capitalize(actionName)}Input`;
    
    // Determine the return type based on action
    let returnType: string;
    if (useCaseConfig.output === 'void') {
      returnType = '{ success: boolean; message: string }';
    } else if (actionName === 'list') {
      returnType = `{ items: ${modelName}[]; total: number; page: number; limit: number }`;
    } else {
      returnType = modelName;
    }

    // Generate handler calls
    const handlerCalls = useCaseConfig.handlers.map((handler, index) => {
      const isLast = index === useCaseConfig.handlers.length - 1;
      
      if (handler.startsWith('default:')) {
        // Default handler - call service method directly
        const defaultAction = handler.replace('default:', '');
        const resultVar = isLast ? 'result' : `result${index}`;
        
        // Determine parameters based on action
        let params = '';
        if (defaultAction === 'list') {
          params = useCaseConfig.input?.pagination
            ? 'input.page || 1, input.limit || 20'
            : '';
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
        
        return `    const ${resultVar} = await this.${modelName.toLowerCase()}Service.${defaultAction}(${params});`;
      } else {
        // Custom handler
        const prevResult = index === 0 ? 'null' : `result${index - 1}`;
        const resultVar = isLast ? 'result' : `result${index}`;
        return `    const ${resultVar} = await this.${modelName.toLowerCase()}Service.${handler}(${prevResult}, input);`;
      }
    }).join('\n');

    const returnStatement = '\n    return result;';

    return `  async ${methodName}(input: ${inputType}): Promise<${returnType}> {
${handlerCalls}${returnStatement}
  }`;
  }

  private generateGetResourceOwnerMethod(modelName: string): string {
    const serviceVar = `${modelName.toLowerCase()}Service`;
    
    return `
  /**
   * Get the owner ID of a resource by its ID.
   * Used for pre-mutation authorization checks in controllers.
   */
  async getResourceOwner(id: number): Promise<number | null> {
    return await this.${serviceVar}.getResourceOwner(id);
  }`;
  }

  private generateUseCase(
    modelName: string,
    useCases: Record<string, UseCaseDefinition>
  ): string {
    const className = `${modelName}UseCase`;
    const serviceName = `${modelName}Service`;
    const serviceVar = `${modelName.toLowerCase()}Service`;
    
    // Generate imports for DTOs (only Input types since UseCases return models)
    const dtoImports = Object.keys(useCases)
      .map(actionName => {
        const inputType = `${modelName}${capitalize(actionName)}Input`;
        return `import { ${inputType} } from '../dto/${modelName}${capitalize(actionName)}';`;
      })
      .join('\n');

    // Generate methods
    const methods = Object.entries(useCases)
      .map(([actionName, useCaseConfig]) => 
        this.generateUseCaseMethod(modelName, actionName, useCaseConfig)
      )
      .join('\n\n');

    const getResourceOwnerMethod = this.generateGetResourceOwnerMethod(modelName);

    return `import { ${modelName} } from '../../domain/entities/${modelName}';
${dtoImports}
import { ${serviceName} } from '../services/${serviceName}';

/**
 * Use Case orchestrator for ${modelName}
 * Coordinates business logic by calling service handlers in sequence
 */
export class ${className} {
  constructor(
    private ${serviceVar}: ${serviceName}
  ) {}

${methods}${getResourceOwnerMethod}
}`;
  }

  public generateFromConfig(config: ModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // Collect all aggregates to know which are roots
    this.availableAggregates.clear();
    if (config.domain?.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    // Generate a UseCase file for each model
    Object.entries(config.useCases).forEach(([modelName, useCases]) => {
      result[modelName] = this.generateUseCase(modelName, useCases);
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
    const useCasesByModel = this.generateFromYamlFile(yamlFilePath);
    
    const useCasesDir = path.join(moduleDir, 'application', 'useCases');
    fs.mkdirSync(useCasesDir, { recursive: true });

    for (const [modelName, code] of Object.entries(useCasesByModel)) {
      const filePath = path.join(useCasesDir, `${modelName}UseCase.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Use Case files generated successfully!') + '\n');
  }
}
