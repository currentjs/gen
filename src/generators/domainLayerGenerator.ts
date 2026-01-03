import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, AggregateConfig, ValueObjectConfig, isNewModuleConfig } from '../types/configTypes';

interface TypeMapping {
  [key: string]: string;
}

export class DomainLayerGenerator {
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

  private availableAggregates: Set<string> = new Set();
  private availableValueObjects: Set<string> = new Set();

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private mapType(yamlType: string): string {
    // Check if this is a known aggregate
    if (this.availableAggregates.has(yamlType)) {
      return yamlType;
    }
    // Check if this is a known value object (case-insensitive)
    const capitalizedType = this.capitalize(yamlType);
    if (this.availableValueObjects.has(capitalizedType)) {
      return capitalizedType;
    }
    return this.typeMapping[yamlType] || 'any';
  }

  private getDefaultValue(type: string): string {
    switch (type) {
      case 'datetime':
      case 'date':
        return 'new Date()';
      case 'string':
        return "''";
      case 'number':
      case 'integer':
      case 'decimal':
        return '0';
      case 'boolean':
        return 'false';
      case 'array':
        return '[]';
      case 'object':
      case 'json':
        return '{}';
      default:
        return 'undefined';
    }
  }

  private generateValueObject(name: string, config: ValueObjectConfig): string {
    const fields = Object.entries(config.fields);
    
    // Collect type definitions for enum fields
    const typeDefinitions: string[] = [];
    
    // Generate constructor parameters
    const constructorParams = fields.map(([fieldName, fieldConfig]) => {
      if (typeof fieldConfig === 'object' && 'values' in fieldConfig) {
        // Enum type - generate a type alias
        const typeName = `${name}${this.capitalize(fieldName)}`;
        const uniqueValues = [...new Set(fieldConfig.values)]; // dedupe
        const enumValues = uniqueValues.map(v => `'${v}'`).join(' | ');
        typeDefinitions.push(`export type ${typeName} = ${enumValues};`);
        return `public ${fieldName}: ${typeName}`;
      } else {
        const tsType = this.mapType(fieldConfig.type);
        return `public ${fieldName}: ${tsType}`;
      }
    }).join(',\n        ');

    // Generate validation logic
    const validations: string[] = [];
    fields.forEach(([fieldName, fieldConfig]) => {
      if (typeof fieldConfig === 'object' && 'constraints' in fieldConfig && fieldConfig.constraints) {
        const constraints = fieldConfig.constraints;
        
        if (constraints.min !== undefined) {
          validations.push(`    if (this.${fieldName} < ${constraints.min}) {
      throw new Error('${name}.${fieldName} must be at least ${constraints.min}');
    }`);
        }
        
        if (constraints.max !== undefined) {
          validations.push(`    if (this.${fieldName} > ${constraints.max}) {
      throw new Error('${name}.${fieldName} must be at most ${constraints.max}');
    }`);
        }
        
        if (constraints.pattern) {
          validations.push(`    if (!/${constraints.pattern}/.test(String(this.${fieldName}))) {
      throw new Error('${name}.${fieldName} does not match required pattern');
    }`);
        }
      }
      
      if (typeof fieldConfig === 'object' && 'values' in fieldConfig) {
        const uniqueValues = [...new Set(fieldConfig.values)]; // dedupe
        const values = uniqueValues.map(v => `'${v}'`).join(', ');
        validations.push(`    if (![${values}].includes(this.${fieldName})) {
      throw new Error(\`${name}.${fieldName} must be one of: ${values}\`);
    }`);
      }
    });

    const validationCode = validations.length > 0 ? `\n    this.validate();\n  }\n\n  private validate(): void {\n${validations.join('\n')}\n  }` : '\n  }';

    const typeDefsCode = typeDefinitions.length > 0 ? typeDefinitions.join('\n') + '\n\n' : '';

    return `${typeDefsCode}export class ${name} {
  public constructor(
        ${constructorParams}
    ) {${validationCode}
}`;
  }

  private generateAggregate(name: string, config: AggregateConfig, allAggregates: Record<string, AggregateConfig>): string {
    const fields = Object.entries(config.fields);
    
    // Determine which entities are contained in this aggregate
    const containedEntities = config.entities || [];
    
    // Generate imports for contained entities
    const entityImports = containedEntities
      .filter(entityName => entityName !== name && allAggregates[entityName])
      .map(entityName => `import { ${entityName} } from './${entityName}';`)
      .join('\n');
    
    // Generate imports for value objects used in fields
    const valueObjectImports = fields
      .filter(([, fieldConfig]) => this.availableValueObjects.has(this.capitalize(fieldConfig.type)))
      .map(([, fieldConfig]) => {
        const voName = this.capitalize(fieldConfig.type);
        return `import { ${voName} } from '../valueObjects/${voName}';`;
      })
      .filter((imp, idx, arr) => arr.indexOf(imp) === idx) // dedupe
      .join('\n');
    
    const imports = [entityImports, valueObjectImports].filter(Boolean).join('\n');

    // Generate constructor parameters
    const constructorParams: string[] = ['public id: number'];
    
    // Sort fields: required first, then optional
    // Fields are required by default unless required: false
    const sortedFields = fields.sort((a, b) => {
      const aRequired = a[1].required !== false && !a[1].auto;
      const bRequired = b[1].required !== false && !b[1].auto;
      if (aRequired === bRequired) return 0;
      return aRequired ? -1 : 1;
    });

    sortedFields.forEach(([fieldName, fieldConfig]) => {
      const tsType = this.mapType(fieldConfig.type);
      // Fields are required by default, only optional if explicitly set to required: false
      const isOptional = fieldConfig.required === false;
      const hasDefault = fieldConfig.auto;
      
      let param = `public ${fieldName}`;
      
      if (isOptional && !hasDefault) {
        param += '?';
      }
      
      param += `: ${tsType}`;
      
      if (hasDefault) {
        param += ` = ${this.getDefaultValue(fieldConfig.type)}`;
      }
      
      constructorParams.push(param);
    });

    const constructorParamsStr = constructorParams.join(',\n        ');

    // Generate setter methods
    const setterMethods = sortedFields
      .filter(([fieldName, fieldConfig]) => !fieldConfig.auto && fieldName !== 'id')
      .map(([fieldName, fieldConfig]) => {
        const tsType = this.mapType(fieldConfig.type);
        const methodName = `set${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`;
        // Fields are required by default, only optional if explicitly set to required: false
        const isOptional = fieldConfig.required === false;
        
        return `
    ${methodName}(${fieldName}: ${tsType}${isOptional ? ' | undefined' : ''}): void {
        this.${fieldName} = ${fieldName};
    }`;
      })
      .join('\n');

    const rootComment = config.root ? '// Aggregate Root\n' : '';

    return `${imports ? imports + '\n\n' : ''}${rootComment}export class ${name} {
    public constructor(
        ${constructorParamsStr}
    ) { }
${setterMethods}
}`;
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, { code: string; type: 'entity' | 'valueObject' }> {
    const result: Record<string, { code: string; type: 'entity' | 'valueObject' }> = {};
    
    // First pass: collect all aggregate and value object names
    if (config.domain.aggregates) {
      Object.keys(config.domain.aggregates).forEach(name => {
        this.availableAggregates.add(name);
      });
    }
    
    if (config.domain.valueObjects) {
      Object.keys(config.domain.valueObjects).forEach(name => {
        this.availableValueObjects.add(name);
      });
    }

    // Generate value objects first (they may be used by aggregates)
    if (config.domain.valueObjects) {
      Object.entries(config.domain.valueObjects).forEach(([name, voConfig]) => {
        result[name] = {
          code: this.generateValueObject(name, voConfig),
          type: 'valueObject'
        };
      });
    }

    // Generate aggregates
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        result[name] = {
          code: this.generateAggregate(name, aggConfig, config.domain.aggregates),
          type: 'entity'
        };
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, { code: string; type: 'entity' | 'valueObject' }> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isNewModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain.aggregates structure.');
    }

    return this.generateFromConfig(config);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const codeByEntity = this.generateFromYamlFile(yamlFilePath);
    
    const entitiesDir = path.join(moduleDir, 'domain', 'entities');
    const valueObjectsDir = path.join(moduleDir, 'domain', 'valueObjects');
    
    fs.mkdirSync(entitiesDir, { recursive: true });
    fs.mkdirSync(valueObjectsDir, { recursive: true });

    for (const [name, { code, type }] of Object.entries(codeByEntity)) {
      const outputDir = type === 'valueObject' ? valueObjectsDir : entitiesDir;
      const filePath = path.join(outputDir, `${name}.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Domain layer files generated successfully!') + '\n');
  }
}

