import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { 
  NewModuleConfig, 
  UseCaseInputConfig, 
  UseCaseOutputConfig,
  AggregateConfig,
  ValueObjectConfig,
  isNewModuleConfig 
} from '../types/configTypes';

interface TypeMapping {
  [key: string]: string;
}

export class DtoGenerator {
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
    object: 'object',
    enum: 'string'
  };

  private availableAggregates: Map<string, AggregateConfig> = new Map();
  private availableValueObjects: Map<string, ValueObjectConfig> = new Map();

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private mapType(yamlType: string): string {
    if (this.availableAggregates.has(yamlType)) {
      return yamlType;
    }
    // Check for value objects (case-insensitive)
    const capitalizedType = this.capitalize(yamlType);
    if (this.availableValueObjects.has(capitalizedType)) {
      return capitalizedType;
    }
    return this.typeMapping[yamlType] || 'any';
  }

  private isValueObjectType(yamlType: string): boolean {
    const capitalizedType = this.capitalize(yamlType);
    return this.availableValueObjects.has(capitalizedType);
  }

  private getValidationCode(fieldName: string, fieldType: string, isRequired: boolean): string[] {
    const checks: string[] = [];
    
    if (isRequired) {
      if (fieldType === 'string') {
        checks.push(`    if (typeof b.${fieldName} !== 'string' || !b.${fieldName}) {
      throw new Error('${fieldName} is required');
    }`);
      } else if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'decimal' || fieldType === 'id') {
        checks.push(`    if (b.${fieldName} === undefined || b.${fieldName} === null) {
      throw new Error('${fieldName} is required');
    }`);
      } else if (fieldType === 'boolean') {
        checks.push(`    if (typeof b.${fieldName} !== 'boolean') {
      throw new Error('${fieldName} is required');
    }`);
      } else if (fieldType === 'datetime' || fieldType === 'date') {
        checks.push(`    if (!b.${fieldName}) {
      throw new Error('${fieldName} is required');
    }`);
      } else {
        checks.push(`    if (b.${fieldName} === undefined) {
      throw new Error('${fieldName} is required');
    }`);
      }
    }
    
    return checks;
  }

  private getTransformCode(fieldName: string, fieldType: string): string {
    if (fieldType === 'datetime' || fieldType === 'date') {
      return `b.${fieldName} ? new Date(b.${fieldName} as string) : undefined`;
    } else if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'decimal' || fieldType === 'id') {
      return `typeof b.${fieldName} === 'string' ? parseFloat(b.${fieldName}) : b.${fieldName} as number`;
    } else if (fieldType === 'boolean') {
      return `Boolean(b.${fieldName})`;
    }
    return `b.${fieldName} as ${this.mapType(fieldType)}`;
  }

  private generateInputDto(
    modelName: string,
    actionName: string,
    inputConfig: UseCaseInputConfig | undefined,
    aggregateConfig: AggregateConfig
  ): string {
    const className = `${modelName}${this.capitalize(actionName)}Input`;
    
    if (!inputConfig) {
      return `export class ${className} {
  private constructor() {}

  static parse(body: unknown): ${className} {
    return new ${className}();
  }
}`;
    }

    const fieldDeclarations: string[] = [];
    const constructorParams: string[] = [];
    const constructorAssignments: string[] = [];
    const validationChecks: string[] = [];
    const fieldTransforms: string[] = [];

    // Handle identifier (for get, update, delete)
    if (inputConfig.identifier) {
      const fieldName = inputConfig.identifier;
      fieldDeclarations.push(`  readonly ${fieldName}: number;`);
      constructorParams.push(`${fieldName}: number`);
      constructorAssignments.push(`    this.${fieldName} = ${fieldName};`);
      validationChecks.push(`    if (b.${fieldName} === undefined || b.${fieldName} === null) {
      throw new Error('${fieldName} is required');
    }`);
      fieldTransforms.push(`      ${fieldName}: typeof b.${fieldName} === 'string' ? parseInt(b.${fieldName}, 10) : b.${fieldName} as number`);
    }

    // Handle pagination
    if (inputConfig.pagination) {
      fieldDeclarations.push(`  readonly page: number;`);
      fieldDeclarations.push(`  readonly limit: number;`);
      constructorParams.push(`page: number`);
      constructorParams.push(`limit: number`);
      constructorAssignments.push(`    this.page = page;`);
      constructorAssignments.push(`    this.limit = limit;`);
      
      const defaultLimit = inputConfig.pagination.defaults?.limit || 20;
      const maxLimit = inputConfig.pagination.defaults?.maxLimit || 100;
      
      fieldTransforms.push(`      page: typeof b.page === 'string' ? parseInt(b.page, 10) : (b.page as number || 1)`);
      fieldTransforms.push(`      limit: Math.min(typeof b.limit === 'string' ? parseInt(b.limit, 10) : (b.limit as number || ${defaultLimit}), ${maxLimit})`);
      
      if (inputConfig.pagination.type === 'cursor') {
        fieldDeclarations.push(`  readonly cursor?: string;`);
        constructorParams.push(`cursor?: string`);
        constructorAssignments.push(`    this.cursor = cursor;`);
        fieldTransforms.push(`      cursor: b.cursor as string | undefined`);
      }
    }

    // Handle fields from aggregate (pick/omit/add)
    if (inputConfig.from) {
      const aggregateFields = Object.entries(aggregateConfig.fields);
      let fieldsToInclude = aggregateFields;

      // Apply pick
      if (inputConfig.pick && inputConfig.pick.length > 0) {
        fieldsToInclude = fieldsToInclude.filter(([fieldName]) => 
          inputConfig.pick!.includes(fieldName)
        );
      }

      // Apply omit
      if (inputConfig.omit && inputConfig.omit.length > 0) {
        fieldsToInclude = fieldsToInclude.filter(([fieldName]) => 
          !inputConfig.omit!.includes(fieldName)
        );
      }

      // For aggregate roots, add ownerId field (injected from authenticated user)
      // This is needed for create operations to set ownership
      const isRoot = aggregateConfig.root === true;
      const isCreateAction = !inputConfig.identifier && !inputConfig.partial;
      
      if (isRoot && isCreateAction) {
        fieldDeclarations.push(`  readonly ownerId: number;`);
        constructorParams.push(`ownerId: number`);
        constructorAssignments.push(`    this.ownerId = ownerId;`);
        validationChecks.push(`    if (b.ownerId === undefined || b.ownerId === null) {
      throw new Error('ownerId is required');
    }`);
        fieldTransforms.push(`      ownerId: typeof b.ownerId === 'string' ? parseInt(b.ownerId, 10) : b.ownerId as number`);
      }

      // Add fields
      fieldsToInclude.forEach(([fieldName, fieldConfig]) => {
        if (fieldName === 'id' || fieldConfig.auto) return;
        
        const tsType = this.mapType(fieldConfig.type);
        // Fields are required by default unless partial or required: false
        const isRequired = !inputConfig.partial && fieldConfig.required !== false;
        const optional = isRequired ? '' : '?';
        
        fieldDeclarations.push(`  readonly ${fieldName}${optional}: ${tsType};`);
        constructorParams.push(`${fieldName}${optional}: ${tsType}`);
        constructorAssignments.push(`    this.${fieldName} = ${fieldName};`);
        
        validationChecks.push(...this.getValidationCode(fieldName, fieldConfig.type, isRequired));
        fieldTransforms.push(`      ${fieldName}: ${this.getTransformCode(fieldName, fieldConfig.type)}`);
      });
    }

    // Handle filters
    if (inputConfig.filters) {
      Object.entries(inputConfig.filters).forEach(([filterName, filterConfig]) => {
        const tsType = this.mapType(filterConfig.type);
        const isRequired = !filterConfig.optional;
        const optional = isRequired ? '' : '?';
        
        fieldDeclarations.push(`  readonly ${filterName}${optional}: ${tsType};`);
        constructorParams.push(`${filterName}${optional}: ${tsType}`);
        constructorAssignments.push(`    this.${filterName} = ${filterName};`);
        
        if (isRequired) {
          validationChecks.push(...this.getValidationCode(filterName, filterConfig.type, true));
        }
        fieldTransforms.push(`      ${filterName}: ${this.getTransformCode(filterName, filterConfig.type)}`);
      });
    }

    // Handle sorting
    if (inputConfig.sorting) {
      fieldDeclarations.push(`  readonly sortBy?: string;`);
      fieldDeclarations.push(`  readonly sortOrder?: 'asc' | 'desc';`);
      constructorParams.push(`sortBy?: string`);
      constructorParams.push(`sortOrder?: 'asc' | 'desc'`);
      constructorAssignments.push(`    this.sortBy = sortBy;`);
      constructorAssignments.push(`    this.sortOrder = sortOrder;`);
      
      const allowedFields = inputConfig.sorting.allow.map(f => `'${f}'`).join(', ');
      const defaultField = inputConfig.sorting.default?.field || inputConfig.sorting.allow[0];
      const defaultOrder = inputConfig.sorting.default?.order || 'asc';
      
      fieldTransforms.push(`      sortBy: [${allowedFields}].includes(b.sortBy as string) ? b.sortBy as string : '${defaultField}'`);
      fieldTransforms.push(`      sortOrder: b.sortOrder === 'desc' ? 'desc' : '${defaultOrder}'`);
    }

    const fieldsStr = fieldDeclarations.length > 0 ? fieldDeclarations.join('\n') : '  // No fields';
    const paramsStr = constructorParams.join(', ');
    const assignmentsStr = constructorAssignments.join('\n');
    const validationsStr = validationChecks.length > 0 ? '\n' + validationChecks.join('\n') + '\n' : '';
    const transformsStr = fieldTransforms.join(',\n');

    return `export class ${className} {
${fieldsStr}

  private constructor(data: { ${constructorParams.map(p => p.replace('readonly ', '')).join('; ')} }) {
${constructorAssignments.map(a => a.replace('this.', 'this.').replace(' = ', ' = data.')).join('\n').replace(/= data\./g, '= data.').split('\n').map(line => {
  const match = line.match(/this\.(\w+) = data\.(\w+)/);
  if (match) {
    return `    this.${match[1]} = data.${match[1]};`;
  }
  return line;
}).join('\n')}
  }

  static parse(body: unknown): ${className} {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request body');
    }
    const b = body as Record<string, unknown>;
${validationsStr}
    return new ${className}({
${transformsStr}
    });
  }
}`;
  }

  private generateOutputDto(
    modelName: string,
    actionName: string,
    outputConfig: UseCaseOutputConfig | 'void',
    aggregateConfig: AggregateConfig,
    allAggregates: Map<string, AggregateConfig>
  ): string {
    const className = `${modelName}${this.capitalize(actionName)}Output`;

    if (outputConfig === 'void') {
      return `export type ${className} = void;`;
    }

    const fieldDeclarations: string[] = [];
    const constructorParams: string[] = [];
    const fromMappings: string[] = [];

    // Always include id for entity outputs
    if (outputConfig.from) {
      fieldDeclarations.push(`  readonly id: number;`);
      constructorParams.push(`id: number`);
      fromMappings.push(`      id: entity.id`);
    }

    // Handle fields from aggregate (pick)
    if (outputConfig.from) {
      const aggregateFields = Object.entries(aggregateConfig.fields);
      let fieldsToInclude = aggregateFields;

      // Apply pick
      if (outputConfig.pick && outputConfig.pick.length > 0) {
        fieldsToInclude = fieldsToInclude.filter(([fieldName]) => 
          outputConfig.pick!.includes(fieldName)
        );
      }

      // Add fields
      fieldsToInclude.forEach(([fieldName, fieldConfig]) => {
        if (fieldName === 'id') return;
        
        const tsType = this.mapType(fieldConfig.type);
        const isOptional = fieldConfig.required === false;
        const optional = isOptional ? '?' : '';
        
        fieldDeclarations.push(`  readonly ${fieldName}${optional}: ${tsType};`);
        constructorParams.push(`${fieldName}${optional}: ${tsType}`);
        fromMappings.push(`      ${fieldName}: entity.${fieldName}`);
      });
    }

    // Handle includes (nested objects)
    if (outputConfig.include) {
      Object.entries(outputConfig.include).forEach(([includeName, includeConfig]) => {
        const relatedAggregate = allAggregates.get(includeConfig.from);
        
        if (relatedAggregate && includeConfig.pick && includeConfig.pick.length > 0) {
          // Filter out 'id' from picked fields since we add it separately
          const pickedFieldsFiltered = includeConfig.pick.filter(f => f !== 'id');
          const pickedFields = pickedFieldsFiltered.map(fieldName => {
            const fieldConfig = relatedAggregate.fields[fieldName];
            if (fieldConfig) {
              const tsType = this.mapType(fieldConfig.type);
              return `${fieldName}: ${tsType}`;
            }
            return `${fieldName}: any`;
          }).join('; ');
          
          const fieldsStr = pickedFields ? `id: number; ${pickedFields}` : 'id: number';
          fieldDeclarations.push(`  readonly ${includeName}?: { ${fieldsStr} };`);
          constructorParams.push(`${includeName}?: { ${fieldsStr} }`);
          fromMappings.push(`      ${includeName}: (entity as any).${includeName}`);
        } else {
          fieldDeclarations.push(`  readonly ${includeName}?: ${includeConfig.from};`);
          constructorParams.push(`${includeName}?: ${includeConfig.from}`);
          fromMappings.push(`      ${includeName}: (entity as any).${includeName}`);
        }
      });
    }

    // Handle additional fields
    if (outputConfig.add) {
      Object.entries(outputConfig.add).forEach(([fieldName, fieldDef]) => {
        const tsType = this.mapType(fieldDef.type);
        fieldDeclarations.push(`  readonly ${fieldName}: ${tsType};`);
        constructorParams.push(`${fieldName}: ${tsType}`);
        fromMappings.push(`      ${fieldName}: (entity as any).${fieldName}`);
      });
    }

    const fieldsStr = fieldDeclarations.length > 0 ? fieldDeclarations.join('\n') : '  // No fields';
    const paramsStr = constructorParams.map(p => p.replace('readonly ', '')).join('; ');
    const mappingsStr = fromMappings.join(',\n');

    // Wrap in pagination if needed
    if (outputConfig.pagination) {
      return `export class ${className}Item {
${fieldsStr}

  private constructor(data: { ${paramsStr} }) {
${fieldDeclarations.map(d => {
  const match = d.match(/readonly (\w+)/);
  if (match) return `    this.${match[1]} = data.${match[1]};`;
  return '';
}).filter(Boolean).join('\n')}
  }

  static from(entity: ${modelName}): ${className}Item {
    return new ${className}Item({
${mappingsStr}
    });
  }
}

export class ${className} {
  readonly items: ${className}Item[];
  readonly total: number;
  readonly page?: number;
  readonly limit?: number;

  private constructor(data: { items: ${className}Item[]; total: number; page?: number; limit?: number }) {
    this.items = data.items;
    this.total = data.total;
    this.page = data.page;
    this.limit = data.limit;
  }

  static from(data: { items: ${modelName}[]; total: number; page?: number; limit?: number }): ${className} {
    return new ${className}({
      items: data.items.map(item => ${className}Item.from(item)),
      total: data.total,
      page: data.page,
      limit: data.limit
    });
  }
}`;
    }

    return `export class ${className} {
${fieldsStr}

  private constructor(data: { ${paramsStr} }) {
${fieldDeclarations.map(d => {
  const match = d.match(/readonly (\w+)/);
  if (match) return `    this.${match[1]} = data.${match[1]};`;
  return '';
}).filter(Boolean).join('\n')}
  }

  static from(entity: ${modelName}): ${className} {
    return new ${className}({
${mappingsStr}
    });
  }
}`;
  }

  /**
   * Collect types that need to be imported for a use case DTO.
   */
  private collectRequiredImports(
    modelName: string,
    aggregateConfig: AggregateConfig,
    outputConfig: UseCaseOutputConfig | 'void'
  ): { valueObjects: Set<string>; entities: Set<string> } {
    const valueObjects = new Set<string>();
    const entities = new Set<string>();

    // Check aggregate fields for value object types
    if (outputConfig !== 'void' && outputConfig.from) {
      const aggregateFields = Object.entries(aggregateConfig.fields);
      let fieldsToCheck = aggregateFields;

      // Apply pick filter if specified
      if (outputConfig.pick && outputConfig.pick.length > 0) {
        fieldsToCheck = fieldsToCheck.filter(([fieldName]) => 
          outputConfig.pick!.includes(fieldName)
        );
      }

      // Check each field for value object types
      fieldsToCheck.forEach(([, fieldConfig]) => {
        if (this.isValueObjectType(fieldConfig.type)) {
          valueObjects.add(this.capitalize(fieldConfig.type));
        }
      });
    }

    // Check include for child entities
    if (outputConfig !== 'void' && outputConfig.include) {
      Object.entries(outputConfig.include).forEach(([, includeConfig]) => {
        if (includeConfig.from && includeConfig.from !== modelName) {
          entities.add(includeConfig.from);
        }
      });
    }

    return { valueObjects, entities };
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // Collect all aggregates
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    // Collect all value objects
    if (config.domain.valueObjects) {
      Object.entries(config.domain.valueObjects).forEach(([name, voConfig]) => {
        this.availableValueObjects.set(name, voConfig);
      });
    }

    // Generate DTOs for each use case
    Object.entries(config.useCases).forEach(([modelName, useCases]) => {
      const aggregateConfig = this.availableAggregates.get(modelName);
      
      if (!aggregateConfig) {
        console.warn(`Warning: No aggregate found for model ${modelName}`);
        return;
      }

      Object.entries(useCases).forEach(([actionName, useCaseConfig]) => {
        // Generate Input DTO
        const inputDto = this.generateInputDto(
          modelName,
          actionName,
          useCaseConfig.input,
          aggregateConfig
        );

        // Generate Output DTO
        const outputDto = this.generateOutputDto(
          modelName,
          actionName,
          useCaseConfig.output || 'void',
          aggregateConfig,
          this.availableAggregates
        );

        // Collect required imports
        const imports: string[] = [];
        const needsModelImport = useCaseConfig.output !== 'void';
        
        if (needsModelImport) {
          imports.push(`import { ${modelName} } from '../../domain/entities/${modelName}';`);
        }

        // Collect value objects and entities needed
        const { valueObjects, entities } = this.collectRequiredImports(
          modelName,
          aggregateConfig,
          useCaseConfig.output || 'void'
        );

        // Add value object imports
        valueObjects.forEach(voName => {
          imports.push(`import { ${voName} } from '../../domain/valueObjects/${voName}';`);
        });

        // Add entity imports for includes
        entities.forEach(entityName => {
          imports.push(`import { ${entityName} } from '../../domain/entities/${entityName}';`);
        });

        const importStatement = imports.length > 0 ? imports.join('\n') + '\n\n' : '';

        const dtoFileName = `${modelName}${this.capitalize(actionName)}`;
        result[dtoFileName] = `${importStatement}${inputDto}\n\n${outputDto}`;
      });
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
    const dtosByName = this.generateFromYamlFile(yamlFilePath);
    
    const dtoDir = path.join(moduleDir, 'application', 'dto');
    fs.mkdirSync(dtoDir, { recursive: true });

    for (const [name, code] of Object.entries(dtosByName)) {
      const filePath = path.join(dtoDir, `${name}.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('DTO files generated successfully!') + '\n');
  }
}
