import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, AggregateConfig, AggregateFieldConfig, ValueObjectConfig, isNewModuleConfig } from '../types/configTypes';
import { newStoreTemplates, newStoreFileTemplate } from './templates/newStoreTemplates';

export class NewStoreGenerator {
  // Maps YAML types to TypeScript types for Row interface (database representation)
  private rowTypeMapping: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    datetime: 'string',  // MySQL returns datetime as string
    date: 'string',      // MySQL returns date as string
    json: 'string',      // JSON stored as string in MySQL
    array: 'string',     // Arrays serialized as string
    object: 'string'     // Objects serialized as string
  };

  private availableValueObjects: Map<string, ValueObjectConfig> = new Map();

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private isValueObjectType(fieldType: string): boolean {
    // Check if the type matches a known value object (case-insensitive)
    const capitalizedType = this.capitalize(fieldType);
    return this.availableValueObjects.has(capitalizedType);
  }

  private getValueObjectName(fieldType: string): string {
    return this.capitalize(fieldType);
  }

  private getValueObjectConfig(fieldType: string): ValueObjectConfig | undefined {
    return this.availableValueObjects.get(this.getValueObjectName(fieldType));
  }

  /**
   * Gets the type name for a value object field (for casting).
   * For enum fields, returns the generated type name (e.g., BreedName).
   * For other fields, returns the basic TypeScript type.
   */
  private getValueObjectFieldTypeName(voName: string, voConfig: ValueObjectConfig): string | null {
    const fields = Object.entries(voConfig.fields);
    
    // Look for enum fields - they get generated type names
    for (const [fieldName, fieldConfig] of fields) {
      if (typeof fieldConfig === 'object' && 'values' in fieldConfig) {
        // This is an enum field, return the generated type name
        return `${voName}${this.capitalize(fieldName)}`;
      }
    }
    
    return null;
  }

  private mapTypeToRowType(yamlType: string): string {
    // Value objects are stored as strings in the database
    if (this.isValueObjectType(yamlType)) {
      return 'string';
    }
    return this.rowTypeMapping[yamlType] || 'string';
  }

  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  }

  private generateRowFields(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const tsType = this.mapTypeToRowType(fieldConfig.type);
        const isOptional = !fieldConfig.required;
        return `  ${fieldName}${isOptional ? '?' : ''}: ${tsType};`;
      })
      .join('\n');
  }

  private generateFieldNamesStr(fields: [string, AggregateFieldConfig][]): string {
    const fieldNames = ['id', ...fields.map(([name]) => name)];
    return fieldNames.map(f => `\\\`${f}\\\``).join(', ');
  }

  private generateRowToModelMapping(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const fieldType = fieldConfig.type;
        
        // Handle datetime/date conversion
        if (fieldType === 'datetime' || fieldType === 'date') {
          return `      row.${fieldName} ? new Date(row.${fieldName}) : undefined`;
        }
        
        // Handle boolean conversion
        if (fieldType === 'boolean') {
          return `      Boolean(row.${fieldName})`;
        }
        
        // Handle value object conversion with proper type cast
        if (this.isValueObjectType(fieldType)) {
          const voName = this.getValueObjectName(fieldType);
          const voConfig = this.getValueObjectConfig(fieldType);
          
          if (voConfig) {
            const enumTypeName = this.getValueObjectFieldTypeName(voName, voConfig);
            if (enumTypeName) {
              // Cast to the enum type
              return `      row.${fieldName} ? new ${voName}(row.${fieldName} as ${enumTypeName}) : undefined`;
            }
          }
          
          // Fallback without cast
          return `      row.${fieldName} ? new ${voName}(row.${fieldName}) : undefined`;
        }
        
        return `      row.${fieldName}`;
      })
      .join(',\n');
  }

  private generateInsertDataMapping(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const fieldType = fieldConfig.type;
        
        // Handle datetime/date - convert Date to ISO string for MySQL
        if (fieldType === 'datetime' || fieldType === 'date') {
          return `      ${fieldName}: entity.${fieldName}?.toISOString()`;
        }
        
        // Handle value object - extract the value
        if (this.isValueObjectType(fieldType)) {
          // Value objects typically have a 'name' or similar field
          return `      ${fieldName}: entity.${fieldName}?.name`;
        }
        
        return `      ${fieldName}: entity.${fieldName}`;
      })
      .join(',\n');
  }

  private generateUpdateDataMapping(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const fieldType = fieldConfig.type;
        
        // Handle datetime/date - convert Date to ISO string for MySQL
        if (fieldType === 'datetime' || fieldType === 'date') {
          return `      ${fieldName}: entity.${fieldName}?.toISOString()`;
        }
        
        // Handle value object - extract the value
        if (this.isValueObjectType(fieldType)) {
          return `      ${fieldName}: entity.${fieldName}?.name`;
        }
        
        return `      ${fieldName}: entity.${fieldName}`;
      })
      .join(',\n');
  }

  private generateUpdateFieldsArray(fields: [string, AggregateFieldConfig][]): string {
    return JSON.stringify(fields.map(([name]) => name));
  }

  private generateValueObjectImports(fields: [string, AggregateFieldConfig][]): string {
    const imports: string[] = [];
    
    fields.forEach(([, fieldConfig]) => {
      if (this.isValueObjectType(fieldConfig.type)) {
        const voName = this.getValueObjectName(fieldConfig.type);
        const voConfig = this.getValueObjectConfig(fieldConfig.type);
        
        // Import the class
        const importItems = [voName];
        
        // Also import the type if it's an enum
        if (voConfig) {
          const enumTypeName = this.getValueObjectFieldTypeName(voName, voConfig);
          if (enumTypeName) {
            importItems.push(enumTypeName);
          }
        }
        
        imports.push(`import { ${importItems.join(', ')} } from '../../domain/valueObjects/${voName}';`);
      }
    });
    
    // Dedupe imports
    const uniqueImports = [...new Set(imports)];
    
    if (uniqueImports.length === 0) {
      return '';
    }
    
    return '\n' + uniqueImports.join('\n');
  }

  private generateStore(modelName: string, aggregateConfig: AggregateConfig): string {
    const tableName = modelName.toLowerCase();
    const fields = Object.entries(aggregateConfig.fields);

    const variables = {
      ENTITY_NAME: modelName,
      TABLE_NAME: tableName,
      ROW_FIELDS: this.generateRowFields(fields),
      FIELD_NAMES: this.generateFieldNamesStr(fields),
      ROW_TO_MODEL_MAPPING: this.generateRowToModelMapping(fields),
      INSERT_DATA_MAPPING: this.generateInsertDataMapping(fields),
      UPDATE_DATA_MAPPING: this.generateUpdateDataMapping(fields),
      UPDATE_FIELDS_ARRAY: this.generateUpdateFieldsArray(fields),
      VALUE_OBJECT_IMPORTS: this.generateValueObjectImports(fields)
    };

    const rowInterface = this.replaceTemplateVars(newStoreTemplates.rowInterface, variables);
    const storeClass = this.replaceTemplateVars(newStoreTemplates.storeClass, variables);

    return this.replaceTemplateVars(newStoreFileTemplate, {
      ENTITY_NAME: modelName,
      ROW_INTERFACE: rowInterface,
      STORE_CLASS: storeClass,
      VALUE_OBJECT_IMPORTS: variables.VALUE_OBJECT_IMPORTS
    });
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    // First, collect all value object names and configs
    this.availableValueObjects.clear();
    if (config.domain.valueObjects) {
      Object.entries(config.domain.valueObjects).forEach(([name, voConfig]) => {
        this.availableValueObjects.set(name, voConfig);
      });
    }

    // Generate a store for each aggregate
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([modelName, aggregateConfig]) => {
        result[modelName] = this.generateStore(modelName, aggregateConfig);
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
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
    const storesByModel = this.generateFromYamlFile(yamlFilePath);
    
    const storesDir = path.join(moduleDir, 'infrastructure', 'stores');
    fs.mkdirSync(storesDir, { recursive: true });

    for (const [modelName, code] of Object.entries(storesByModel)) {
      const filePath = path.join(storesDir, `${modelName}Store.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Store files generated successfully!') + '\n');
  }
}
