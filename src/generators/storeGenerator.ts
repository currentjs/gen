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

  private mapType(yamlType: string): string {
    return this.typeMapping[yamlType] || 'any';
  }

  private generateRowFields(modelConfig: ModelConfig): string {
    const fields: string[] = [];

    modelConfig.fields.forEach(field => {
      if (field.name === 'createdAt') {
        return;
      }
      const tsType = this.mapType(field.type);
      const isOptional = !field.required && !field.auto;
      const fieldDef = `  ${field.name}${isOptional ? '?' : ''}: ${tsType};`;
      fields.push(fieldDef);
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

  private generateRowToModelMapping(modelConfig: ModelConfig): string {
    const mappings = modelConfig.fields.map(field => {
      if (field.name === 'createdAt') {
        return '      row.created_at';
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
    const storeClass = this.replaceTemplateVars(storeTemplates.storeClass, {
      ...variables,
      CONVERSION_METHODS: conversionMethods
    });

    return this.replaceTemplateVars(fileTemplates.storeFile, {
      ENTITY_NAME: entityName,
      ROW_INTERFACE: rowInterface,
      STORE_CLASS: storeClass
    });
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
          const stores = this.generateStores(moduleConfig.models);
          Object.assign(result, stores);
        }
      });
    } else if ((config as any).models) {
      const module = config as ModuleConfig;
      if (module.models && module.models.length > 0) {
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
