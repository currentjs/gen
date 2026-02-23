import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, AggregateConfig, AggregateFieldConfig, ValueObjectConfig, isNewModuleConfig } from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo } from '../utils/childEntityUtils';
import { newStoreTemplates, newStoreFileTemplate } from './templates/newStoreTemplates';

export class NewStoreGenerator {
  // Maps YAML types to TypeScript types for Row interface (database representation)
  private rowTypeMapping: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    decimal: 'number',
    boolean: 'boolean',
    datetime: 'string',  // MySQL returns datetime as string
    date: 'string',      // MySQL returns date as string
    id: 'number',        // Foreign key references are numbers
    json: 'string',      // JSON stored as string in MySQL
    array: 'string',     // Arrays serialized as string
    object: 'string',    // Objects serialized as string
    enum: 'string'       // Enum values stored as strings
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
   * Sort fields the same way as the domain layer generator:
   * Required fields first, then optional fields.
   * This ensures rowToModel parameter order matches entity constructor.
   */
  private sortFieldsForConstructor(fields: [string, AggregateFieldConfig][]): [string, AggregateFieldConfig][] {
    return [...fields].sort((a, b) => {
      const aRequired = a[1].required !== false && !a[1].auto;
      const bRequired = b[1].required !== false && !b[1].auto;
      if (aRequired === bRequired) return 0;
      return aRequired ? -1 : 1;
    });
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

  private generateRowFields(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`  ${ownerOrParentField}: number;`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const tsType = this.mapTypeToRowType(fieldConfig.type);
      const isOptional = !fieldConfig.required;
      result.push(`  ${fieldName}${isOptional ? '?' : ''}: ${tsType};`);
    });
    
    return result.join('\n');
  }

  private generateFieldNamesStr(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const fieldNames = ['id'];
    fieldNames.push(childInfo ? childInfo.parentIdField : 'ownerId');
    fieldNames.push(...fields.map(([name]) => name));
    return fieldNames.map(f => `\\\`${f}\\\``).join(', ');
  }

  private generateRowToModelMapping(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`      row.${ownerOrParentField}`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const fieldType = fieldConfig.type;
      
      // Handle datetime/date conversion
      if (fieldType === 'datetime' || fieldType === 'date') {
        result.push(`      row.${fieldName} ? new Date(row.${fieldName}) : undefined`);
        return;
      }
      
      // Handle boolean conversion
      if (fieldType === 'boolean') {
        result.push(`      Boolean(row.${fieldName})`);
        return;
      }
      
      // Handle value object conversion - deserialize from JSON
      if (this.isValueObjectType(fieldType)) {
        const voName = this.getValueObjectName(fieldType);
        const voConfig = this.getValueObjectConfig(fieldType);
        
        if (voConfig) {
          const voFields = Object.keys(voConfig.fields);
          if (voFields.length > 1) {
            // Multi-field value object - deserialize from JSON
            const voArgs = voFields.map(f => `parsed.${f}`).join(', ');
            result.push(`      row.${fieldName} ? (() => { const parsed = JSON.parse(row.${fieldName}); return new ${voName}(${voArgs}); })() : undefined`);
            return;
          } else if (voFields.length === 1) {
            // Single-field value object
            const singleFieldType = voConfig.fields[voFields[0]];
            const hasEnumValues = typeof singleFieldType === 'object' && 'values' in singleFieldType;
            if (hasEnumValues) {
              const enumTypeName = this.getValueObjectFieldTypeName(voName, voConfig);
              result.push(`      row.${fieldName} ? new ${voName}(row.${fieldName} as ${enumTypeName}) : undefined`);
            } else {
              result.push(`      row.${fieldName} ? new ${voName}(row.${fieldName}) : undefined`);
            }
            return;
          }
        }
        
        // Fallback - try to deserialize from JSON
        result.push(`      row.${fieldName} ? new ${voName}(...Object.values(JSON.parse(row.${fieldName}))) : undefined`);
        return;
      }
      
      result.push(`      row.${fieldName}`);
    });
    
    return result.join(',\n');
  }

  private generateInsertDataMapping(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`      ${ownerOrParentField}: entity.${ownerOrParentField}`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const fieldType = fieldConfig.type;
      
      // Handle datetime/date - convert Date to MySQL DATETIME format
      if (fieldType === 'datetime' || fieldType === 'date') {
        result.push(`      ${fieldName}: entity.${fieldName} ? this.toMySQLDatetime(entity.${fieldName}) : undefined`);
        return;
      }
      
      // Handle value object - serialize to JSON
      if (this.isValueObjectType(fieldType)) {
        const voConfig = this.getValueObjectConfig(fieldType);
        if (voConfig) {
          const voFields = Object.keys(voConfig.fields);
          if (voFields.length > 1) {
            // Multi-field value object - serialize to JSON
            result.push(`      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`);
            return;
          } else if (voFields.length === 1) {
            // Single-field value object - extract the single field
            result.push(`      ${fieldName}: entity.${fieldName}?.${voFields[0]}`);
            return;
          }
        }
        // Fallback - serialize to JSON
        result.push(`      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`);
        return;
      }
      
      result.push(`      ${fieldName}: entity.${fieldName}`);
    });
    
    return result.join(',\n');
  }

  private generateUpdateDataMapping(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const fieldType = fieldConfig.type;
        
        // Handle datetime/date - convert Date to MySQL DATETIME format
        if (fieldType === 'datetime' || fieldType === 'date') {
          return `      ${fieldName}: entity.${fieldName} ? this.toMySQLDatetime(entity.${fieldName}) : undefined`;
        }
        
        // Handle value object - serialize to JSON
        if (this.isValueObjectType(fieldType)) {
          const voConfig = this.getValueObjectConfig(fieldType);
          if (voConfig) {
            const voFields = Object.keys(voConfig.fields);
            if (voFields.length > 1) {
              // Multi-field value object - serialize to JSON
              return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
            } else if (voFields.length === 1) {
              // Single-field value object - extract the single field
              return `      ${fieldName}: entity.${fieldName}?.${voFields[0]}`;
            }
          }
          // Fallback - serialize to JSON
          return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
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

  private generateGetByParentIdMethod(modelName: string, fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    if (!childInfo) return '';
    const fieldList = ['id', childInfo.parentIdField, ...fields.map(([name]) => name)].map(f => '\\`' + f + '\\`').join(', ');
    const parentIdField = childInfo.parentIdField;
    return `

  async getByParentId(parentId: number): Promise<${modelName}[]> {
    const result = await this.db.query(
      \`SELECT ${fieldList} FROM \\\`\${this.tableName}\\\` WHERE \\\`${parentIdField}\\\` = :parentId AND deleted_at IS NULL\`,
      { parentId }
    );

    if (result.success && result.data) {
      return result.data.map((row: ${modelName}Row) => this.rowToModel(row));
    }
    return [];
  }`;
  }

  private generateGetResourceOwnerMethod(childInfo?: ChildEntityInfo): string {
    if (childInfo) {
      const parentTable = childInfo.parentTableName;
      const parentIdField = childInfo.parentIdField;
      return `

  /**
   * Get the owner ID of a resource by its ID (via parent entity).
   * Used for pre-mutation authorization checks.
   */
  async getResourceOwner(id: number): Promise<number | null> {
    const result = await this.db.query(
      \`SELECT p.ownerId FROM \\\`\${this.tableName}\\\` c INNER JOIN \\\`${parentTable}\\\` p ON p.id = c.\\\`${parentIdField}\\\` WHERE c.id = :id AND c.deleted_at IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return result.data[0].ownerId as number;
    }
    return null;
  }`;
    }
    return `

  /**
   * Get the owner ID of a resource by its ID.
   * Used for pre-mutation authorization checks.
   */
  async getResourceOwner(id: number): Promise<number | null> {
    const result = await this.db.query(
      \`SELECT ownerId FROM \\\`\${this.tableName}\\\` WHERE id = :id AND deleted_at IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return result.data[0].ownerId as number;
    }
    return null;
  }`;
  }

  private generateStore(modelName: string, aggregateConfig: AggregateConfig, childInfo?: ChildEntityInfo): string {
    const tableName = modelName.toLowerCase();
    const fields = Object.entries(aggregateConfig.fields);
    
    // Sort fields for rowToModel to match entity constructor order (required first, optional second)
    const sortedFields = this.sortFieldsForConstructor(fields);

    const variables: Record<string, string> = {
      ENTITY_NAME: modelName,
      TABLE_NAME: tableName,
      ROW_FIELDS: this.generateRowFields(fields, childInfo),
      FIELD_NAMES: this.generateFieldNamesStr(fields, childInfo),
      ROW_TO_MODEL_MAPPING: this.generateRowToModelMapping(sortedFields, childInfo),
      INSERT_DATA_MAPPING: this.generateInsertDataMapping(fields, childInfo),
      UPDATE_DATA_MAPPING: this.generateUpdateDataMapping(fields),
      UPDATE_FIELDS_ARRAY: this.generateUpdateFieldsArray(fields),
      VALUE_OBJECT_IMPORTS: this.generateValueObjectImports(fields),
      GET_BY_PARENT_ID_METHOD: this.generateGetByParentIdMethod(modelName, fields, childInfo),
      GET_RESOURCE_OWNER_METHOD: this.generateGetResourceOwnerMethod(childInfo)
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
    const childEntityMap = buildChildEntityMap(config);
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([modelName, aggregateConfig]) => {
        const childInfo = childEntityMap.get(modelName);
        result[modelName] = this.generateStore(modelName, aggregateConfig, childInfo);
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
