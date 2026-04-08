import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { ModuleConfig, AggregateConfig, ValueObjectConfig, isValidModuleConfig, IdentifierType, idTsType } from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo } from '../utils/childEntityUtils';
import { capitalize, mapType as mapTypeUtil, isAggregateReference, getReferencedValueObjects } from '../utils/typeUtils';

export class DomainLayerGenerator {
  private availableAggregates: Set<string> = new Set();
  private availableValueObjects: Set<string> = new Set();
  private identifiers: IdentifierType = 'numeric';

  private mapType(yamlType: string): string {
    return mapTypeUtil(yamlType, this.availableAggregates, this.availableValueObjects);
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
        const typeName = `${name}${capitalize(fieldName)}`;
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

  private generateAggregate(
    name: string,
    config: AggregateConfig,
    allAggregates: Record<string, AggregateConfig>,
    childInfo: ChildEntityInfo | undefined
  ): string {
    const fields = Object.entries(config.fields);
    
    // Determine which entities are contained in this aggregate
    const containedEntities = config.entities || [];
    
    // Generate imports for contained entities
    const entityImports = containedEntities
      .filter(entityName => entityName !== name && allAggregates[entityName])
      .map(entityName => `import { ${entityName} } from './${entityName}';`)
      .join('\n');
    
    // Generate imports for value objects used in fields (including compound types like Foo[] and Foo | Bar)
    const referencedVoNames = new Set<string>();
    fields.forEach(([, fieldConfig]) => {
      getReferencedValueObjects(fieldConfig.type, this.availableValueObjects).forEach(name => referencedVoNames.add(name));
    });
    const valueObjectImports = [...referencedVoNames]
      .map(voName => `import { ${voName} } from '../valueObjects/${voName}';`)
      .join('\n');

    // Generate imports for aggregate references in fields (e.g. idea: { type: Idea })
    const aggregateRefImports = fields
      .filter(([, fieldConfig]) =>
        isAggregateReference(fieldConfig.type, this.availableAggregates) &&
        fieldConfig.type !== name
      )
      .map(([, fieldConfig]) => `import { ${fieldConfig.type} } from './${fieldConfig.type}';`)
      .filter((imp, idx, arr) => arr.indexOf(imp) === idx)
      .join('\n');
    
    const imports = [entityImports, valueObjectImports, aggregateRefImports].filter(Boolean).join('\n');

    // Generate constructor parameters: id, then ownerId (root) or parentId field (child)
    const idTs = idTsType(this.identifiers);
    const constructorParams: string[] = [`public id: ${idTs}`];
    if (childInfo) {
      constructorParams.push(`public ${childInfo.parentIdField}: ${idTs}`);
    } else {
      constructorParams.push(`public ownerId: ${idTs}`);
    }
    
    // Sort fields: required first, then optional
    // Fields are required by default unless required: false
    // Aggregate references are always treated as optional (store can't populate them from FK alone)
    const sortedFields = fields.sort((a, b) => {
      const aIsAggRef = isAggregateReference(a[1].type, this.availableAggregates);
      const bIsAggRef = isAggregateReference(b[1].type, this.availableAggregates);
      const aRequired = a[1].required !== false && !a[1].auto && !aIsAggRef;
      const bRequired = b[1].required !== false && !b[1].auto && !bIsAggRef;
      if (aRequired === bRequired) return 0;
      return aRequired ? -1 : 1;
    });

    const enumTypeDefinitions: string[] = [];
    const enumTypeNames: Record<string, string> = {};

    sortedFields.forEach(([fieldName, fieldConfig]) => {
      if (fieldConfig.type === 'enum' && fieldConfig.values && fieldConfig.values.length > 0) {
        const typeName = `${name}${capitalize(fieldName)}`;
        const uniqueValues = [...new Set(fieldConfig.values)];
        const enumValues = uniqueValues.map(v => `'${v}'`).join(' | ');
        enumTypeDefinitions.push(`export type ${typeName} = ${enumValues};`);
        enumTypeNames[fieldName] = typeName;
      }
    });

    sortedFields.forEach(([fieldName, fieldConfig]) => {
      const isAggRef = isAggregateReference(fieldConfig.type, this.availableAggregates);
      const tsType = enumTypeNames[fieldName] || this.mapType(fieldConfig.type);
      const isOptional = fieldConfig.required === false || isAggRef;
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
        const isAggRef = isAggregateReference(fieldConfig.type, this.availableAggregates);
        const tsType = enumTypeNames[fieldName] || this.mapType(fieldConfig.type);
        const methodName = `set${capitalize(fieldName)}`;
        const isOptional = fieldConfig.required === false || isAggRef;
        
        return `
    ${methodName}(${fieldName}: ${tsType}${isOptional ? ' | undefined' : ''}): void {
        this.${fieldName} = ${fieldName};
    }`;
      })
      .join('\n');

    // Generate validation logic from field constraints
    // we don't use constraints at models, since we use DTOs (use cases) for validation
    // Model – is a place not for validation, but for business logic!
    // kept this code for reference
    /*
    const validations: string[] = [];
    sortedFields.forEach(([fieldName, fieldConfig]) => {
      const { constraints } = fieldConfig;
      if (!constraints) return;

      if (constraints.min !== undefined) {
        validations.push(`        if (this.${fieldName} < ${constraints.min}) {
            throw new Error('${name}.${fieldName} must be at least ${constraints.min}');
        }`);
      }
      if (constraints.max !== undefined) {
        validations.push(`        if (this.${fieldName} > ${constraints.max}) {
            throw new Error('${name}.${fieldName} must be at most ${constraints.max}');
        }`);
      }
      if (constraints.pattern) {
        validations.push(`        if (!/${constraints.pattern}/.test(String(this.${fieldName}))) {
            throw new Error('${name}.${fieldName} does not match required pattern');
        }`);
      }
    });

    const constructorBody = validations.length > 0
      ? `\n        this.validate();\n    }\n\n    private validate(): void {\n${validations.join('\n')}\n    }`
      : ' }';
    */
   const constructorBody = '';
    const rootComment = config.root ? '// Aggregate Root\n' : '';
    const enumTypeDefsCode = enumTypeDefinitions.length > 0 ? enumTypeDefinitions.join('\n') + '\n\n' : '';

    return `${imports ? imports + '\n\n' : ''}${enumTypeDefsCode}${rootComment}export class ${name} {
    public constructor(
        ${constructorParamsStr}
    ) {${constructorBody}
    }
${setterMethods}
}`;
  }

  public generateFromConfig(config: ModuleConfig, identifiers: IdentifierType = 'numeric'): Record<string, { code: string; type: 'entity' | 'valueObject' }> {
    const result: Record<string, { code: string; type: 'entity' | 'valueObject' }> = {};
    this.identifiers = identifiers;
    
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
    const childEntityMap = buildChildEntityMap(config);
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        const childInfo = childEntityMap.get(name);
        result[name] = {
          code: this.generateAggregate(name, aggConfig, config.domain.aggregates, childInfo),
          type: 'entity'
        };
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string, identifiers: IdentifierType = 'numeric'): Record<string, { code: string; type: 'entity' | 'valueObject' }> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain.aggregates structure.');
    }

    return this.generateFromConfig(config, identifiers);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean },
    identifiers: IdentifierType = 'numeric'
  ): Promise<void> {
    const codeByEntity = this.generateFromYamlFile(yamlFilePath, identifiers);
    
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

