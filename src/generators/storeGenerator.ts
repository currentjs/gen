import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { storeTemplates, fileTemplates } from './templates/storeTemplates';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { COMMON_FILES, PATH_PATTERNS } from '../utils/constants';

interface FieldConfig {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  auto?: boolean;
  // Relationship configuration
  displayFields?: string[];  // Fields from foreign model to access (e.g., ['name', 'email'])
}

interface ModelConfig {
  name: string;
  fields: FieldConfig[];
}

type ModuleConfig = {
  models: ModelConfig[];
};

type AppConfig =
  | {
      modules: Record<string, ModuleConfig>;
    }
  | ModuleConfig;

export class StoreGenerator {
  private typeMapping: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    datetime: 'Date',
    json: 'any',
    array: 'any[]',
    object: 'object'
  };

  private availableModels: Set<string> = new Set();

  private mapType(yamlType: string, isRelationship: boolean = false): string {
    // For relationships, we store the foreign key (number) in the database
    if (isRelationship) {
      return 'number';
    }
    // Check if this is a known model (relationship) - should use foreign key type
    if (this.availableModels.has(yamlType)) {
      return 'number'; // Foreign keys are numbers
    }
    return this.typeMapping[yamlType] || 'any';
  }

  private setAvailableModels(models: ModelConfig[]): void {
    this.availableModels.clear();
    models.forEach(model => {
      this.availableModels.add(model.name);
    });
  }

  private isRelationshipField(field: FieldConfig): boolean {
    return this.availableModels.has(field.type);
  }

  private getForeignKeyFieldName(field: FieldConfig): string {
    // Convention: fieldName + 'Id' (e.g., owner -> ownerId)
    return field.name + 'Id';
  }

  private generateRowFields(modelConfig: ModelConfig): string {
    const fields: string[] = [];

    modelConfig.fields.forEach(field => {
      if (field.name === 'createdAt') {
        return;
      }
      
      // For relationship fields, store the foreign key instead
      if (this.isRelationshipField(field)) {
        const foreignKeyName = this.getForeignKeyFieldName(field);
        const tsType = 'number'; // Foreign keys are always numbers
        const isOptional = !field.required && !field.auto;
        const fieldDef = `  ${foreignKeyName}${isOptional ? '?' : ''}: ${tsType};`;
        fields.push(fieldDef);
      } else {
        const tsType = this.mapType(field.type);
        const isOptional = !field.required && !field.auto;
        const fieldDef = `  ${field.name}${isOptional ? '?' : ''}: ${tsType};`;
        fields.push(fieldDef);
      }
    });

    return fields.join('\n');
  }

  private generateFilterableFields(modelConfig: ModelConfig): string {
    const filterableFields = modelConfig.fields
      .filter(field => ['string', 'number', 'boolean'].includes(field.type))
      .map(field => `'${field.name}'`);

    return filterableFields.join(' | ');
  }

  private generateFilterableFieldsArray(modelConfig: ModelConfig): string {
    const filterableFields = modelConfig.fields
      .filter(field => ['string', 'number', 'boolean'].includes(field.type))
      .map(field => `'${field.name}'`);

    return filterableFields.join(', ');
  }

  private generateUpdatableFieldsArray(modelConfig: ModelConfig): string {
    const updatableFields = modelConfig.fields
      .filter(field => field.name !== 'id' && field.name !== 'createdAt')
      .map(field => `'${field.name}'`);

    return updatableFields.join(', ');
  }

  private sortFieldsByRequired(fields: FieldConfig[]): FieldConfig[] {
    // Sort fields: required fields first, then optional fields
    // This must match the order used in domainModelGenerator
    return [...fields].sort((a, b) => {
      const aRequired = a.required !== false && !a.auto;
      const bRequired = b.required !== false && !b.auto;
      
      if (aRequired === bRequired) {
        return 0; // Keep original order if both have same required status
      }
      return aRequired ? -1 : 1; // Required fields come first
    });
  }

  private generateRowToModelMapping(modelConfig: ModelConfig): string {
    // Sort fields to match the constructor parameter order
    const sortedFields = this.sortFieldsByRequired(modelConfig.fields);
    
    const mappings = sortedFields.map(field => {
      if (field.name === 'createdAt') {
        return '      row.created_at';
      }
      
      // For relationship fields, we pass null - will be loaded separately
      if (this.isRelationshipField(field)) {
        return '      null as any'; // Placeholder, loaded via loadRelationships
      }
      
      return `      row.${field.name}`;
    });

    return mappings.join(',\n');
  }

  private generateModelToRowMapping(modelConfig: ModelConfig): string {
    const mappings = modelConfig.fields.map(field => {
      if (field.name === 'createdAt') {
        return '      created_at: model.createdAt';
      }
      
      // For relationship fields, extract ID from the object to store as FK
      if (this.isRelationshipField(field)) {
        const foreignKeyName = this.getForeignKeyFieldName(field);
        return `      ${foreignKeyName}: model.${field.name}?.id`;
      }
      
      return `      ${field.name}: model.${field.name}`;
    });

    return mappings.join(',\n');
  }

  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  }

  public generateStoreInterface(): string {
    return fileTemplates.storeInterface;
  }

  private generateRelationshipMethods(modelConfig: ModelConfig): string {
    const relationshipFields = modelConfig.fields.filter(f => this.isRelationshipField(f));
    
    if (relationshipFields.length === 0) {
      return '';
    }

    const entityName = modelConfig.name;
    const methods: string[] = [];

    // Generate loadRelationships method
    const loadCalls = relationshipFields.map(field => {
      const foreignKeyName = this.getForeignKeyFieldName(field);
      const relatedModel = field.type;
      const relatedModelLower = relatedModel.toLowerCase();
      
      return `    if (entity.${field.name} === null && row.${foreignKeyName}) {
      const ${field.name} = await this.${relatedModelLower}Store.getById(row.${foreignKeyName});
      if (${field.name}) {
        entity.set${field.name.charAt(0).toUpperCase() + field.name.slice(1)}(${field.name});
      }
    }`;
    }).join('\n');

    methods.push(`
  async loadRelationships(entity: ${entityName}, row: ${entityName}Row): Promise<${entityName}> {
${loadCalls}
    return entity;
  }`);

    // Generate getByIdWithRelationships method
    methods.push(`
  async getByIdWithRelationships(id: number): Promise<${entityName} | null> {
    try {
      const query = 'SELECT * FROM ${entityName.toLowerCase()}s WHERE id = :id AND deleted_at IS NULL';
      const result = await this.db.query(query, { id });
      
      if (!result.success || result.data.length === 0) {
        return null;
      }
      
      const row = result.data[0] as ${entityName}Row;
      const entity = ${entityName}Store.rowToModel(row);
      return await this.loadRelationships(entity, row);
    } catch (error) {
      if (error instanceof MySQLConnectionError) {
        throw new Error(\`Database connection error while fetching ${entityName} with id \${id}: \${error.message}\`);
      } else if (error instanceof MySQLQueryError) {
        throw new Error(\`Query error while fetching ${entityName} with id \${id}: \${error.message}\`);
      }
      throw error;
    }
  }`);

    return methods.join('\n');
  }

  private generateStoreConstructorParams(modelConfig: ModelConfig): string {
    const relationshipFields = modelConfig.fields.filter(f => this.isRelationshipField(f));
    
    const params = ['private db: ISqlProvider'];
    
    relationshipFields.forEach(field => {
      const relatedModel = field.type;
      const relatedModelLower = relatedModel.toLowerCase();
      params.push(`private ${relatedModelLower}Store: ${relatedModel}Store`);
    });
    
    return params.join(', ');
  }

  private generateRelationshipImports(modelConfig: ModelConfig): string {
    const relationshipFields = modelConfig.fields.filter(f => this.isRelationshipField(f));
    
    if (relationshipFields.length === 0) {
      return '';
    }

    const imports = relationshipFields.map(field => {
      const relatedModel = field.type;
      return `import { ${relatedModel}Store } from './${relatedModel}Store';`;
    });
    
    return '\n' + imports.join('\n');
  }

  public generateStore(modelConfig: ModelConfig): string {
    const entityName = modelConfig.name;
    const tableName = entityName.toLowerCase() + 's';

    const variables = {
      ENTITY_NAME: entityName,
      TABLE_NAME: tableName,
      ROW_FIELDS: this.generateRowFields(modelConfig),
      FILTERABLE_FIELDS: this.generateFilterableFields(modelConfig),
      FILTERABLE_FIELDS_ARRAY: this.generateFilterableFieldsArray(modelConfig),
      UPDATABLE_FIELDS_ARRAY: this.generateUpdatableFieldsArray(modelConfig),
      ROW_TO_MODEL_MAPPING: this.generateRowToModelMapping(modelConfig),
      MODEL_TO_ROW_MAPPING: this.generateModelToRowMapping(modelConfig)
    };

    const rowInterface = this.replaceTemplateVars(storeTemplates.rowInterface, variables);
    const conversionMethods = this.replaceTemplateVars(storeTemplates.conversionMethods, variables);
    
    // Replace constructor in storeClass template
    let storeClass = this.replaceTemplateVars(storeTemplates.storeClass, {
      ...variables,
      CONVERSION_METHODS: conversionMethods
    });
    
    // Update constructor to include foreign store dependencies
    const constructorParams = this.generateStoreConstructorParams(modelConfig);
    storeClass = storeClass.replace(
      'constructor(private db: ISqlProvider) {}',
      `constructor(${constructorParams}) {}`
    );
    
    // Add relationship methods before the closing brace
    const relationshipMethods = this.generateRelationshipMethods(modelConfig);
    if (relationshipMethods) {
      storeClass = storeClass.replace(/}$/, `${relationshipMethods}\n}`);
    }

    // Add relationship store imports
    const relationshipImports = this.generateRelationshipImports(modelConfig);
    
    return this.replaceTemplateVars(fileTemplates.storeFile, {
      ENTITY_NAME: entityName,
      ROW_INTERFACE: rowInterface,
      STORE_CLASS: storeClass
    }) + relationshipImports;
  }

  public generateStores(models: ModelConfig[]): Record<string, string> {
    const result: Record<string, string> = {};

    models.forEach(model => {
      result[model.name] = this.generateStore(model);
    });

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;

    const result: Record<string, string> = {};

    if ((config as any).modules) {
      Object.values((config as any).modules as Record<string, ModuleConfig>).forEach(moduleConfig => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          // Set available models for relationship detection
          this.setAvailableModels(moduleConfig.models);
          const stores = this.generateStores(moduleConfig.models);
          Object.assign(result, stores);
        }
      });
    } else if ((config as any).models) {
      const module = config as ModuleConfig;
      if (module.models && module.models.length > 0) {
        // Set available models for relationship detection
        this.setAvailableModels(module.models);
        const stores = this.generateStores(module.models);
        Object.assign(result, stores);
      }
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string = COMMON_FILES.APP_YAML,
    outputDir: string = 'infrastructure',
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const stores = this.generateFromYamlFile(yamlFilePath);

    const storesDir = path.join(outputDir, 'stores');
    const interfacesDir = path.join(outputDir, 'interfaces');

    fs.mkdirSync(storesDir, { recursive: true });
    fs.mkdirSync(interfacesDir, { recursive: true });

    const storeInterface = this.generateStoreInterface();
    const interfaceFilePath = path.join(interfacesDir, COMMON_FILES.STORE_INTERFACE);
    await writeGeneratedFile(interfaceFilePath, storeInterface, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });

    for (const [entityName, storeCode] of Object.entries(stores)) {
      const fileName = `${entityName}Store.ts`;
      const filePath = path.join(storesDir, fileName);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, storeCode, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('All store files generated successfully!') + '\n');
  }
}
