import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';

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

export class DomainModelGenerator {
  private typeMapping: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    datetime: 'Date',
    json: 'any',
    array: 'any[]',
    object: 'object'
  };

  private getDefaultValue(type: string): string {
    switch (type) {
      case 'datetime':
        return 'new Date()';
      case 'string':
        return "''";
      case 'number':
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

  private mapType(yamlType: string): string {
    return this.typeMapping[yamlType] || 'any';
  }

  private generateConstructorParameter(field: FieldConfig): string {
    const tsType = this.mapType(field.type);
    const isOptional = !field.required && !field.auto;
    const hasDefault = field.auto;

    let param = `public ${field.name}`;

    if (isOptional && !hasDefault) {
      param += '?';
    }

    param += `: ${tsType}`;

    if (hasDefault) {
      param += ` = ${this.getDefaultValue(field.type)}`;
    }

    return param;
  }

  private generateSetterMethods(modelConfig: ModelConfig): string {
    const setterMethods: string[] = [];

    modelConfig.fields.forEach(field => {
      if (!field.auto && field.name !== 'id') {
        const tsType = this.mapType(field.type);
        const methodName = `set${field.name.charAt(0).toUpperCase() + field.name.slice(1)}`;
        const setter = `
    ${methodName}(${field.name}: ${tsType}): void {
        this.${field.name} = ${field.name};
    }`;
        setterMethods.push(setter);
      }
    });

    return setterMethods.join('\n');
  }

  private sortFieldsByRequired(fields: FieldConfig[]): FieldConfig[] {
    // Sort fields: required fields first, then optional fields
    return [...fields].sort((a, b) => {
      const aRequired = a.required !== false && !a.auto;
      const bRequired = b.required !== false && !b.auto;
      
      if (aRequired === bRequired) {
        return 0; // Keep original order if both have same required status
      }
      return aRequired ? -1 : 1; // Required fields come first
    });
  }

  public generateModel(modelConfig: ModelConfig): string {
    const className = modelConfig.name;

    // Always add id field first
    const constructorParams: string[] = ['public id: number'];

    // Sort fields to put required fields before optional ones
    const sortedFields = this.sortFieldsByRequired(modelConfig.fields);

    // Process other fields
    sortedFields.forEach(field => {
      constructorParams.push(this.generateConstructorParameter(field));
    });

    const constructorParamsStr = constructorParams.join(',\n        ');
    const setterMethods = this.generateSetterMethods(modelConfig);

    return `export class ${className} {
    public constructor(
        ${constructorParamsStr}
    ) { }
${setterMethods}
}`;
  }

  public generateModels(models: ModelConfig[]): string {
    return models.map(model => this.generateModel(model)).join('\n\n');
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;

    const result: Record<string, string> = {};

    if ((config as any).modules) {
      const app = config as { modules: Record<string, ModuleConfig> };
      Object.values(app.modules).forEach(moduleConfig => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          moduleConfig.models.forEach(m => {
            result[m.name] = this.generateModel(m);
          });
        }
      });
    } else if ((config as any).models) {
      const module = config as ModuleConfig;
      module.models.forEach(m => {
        result[m.name] = this.generateModel(m);
      });
    }

    return result;
  }

  public generateFromConfig(config: AppConfig): Record<string, string> {
    const result: Record<string, string> = {};

    if ((config as any).modules) {
      Object.values((config as any).modules as Record<string, ModuleConfig>).forEach(moduleConfig => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          moduleConfig.models.forEach(m => {
            result[m.name] = this.generateModel(m);
          });
        }
      });
    } else if ((config as any).models) {
      (config as ModuleConfig).models.forEach(m => {
        result[m.name] = this.generateModel(m);
      });
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    outputDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const codeByEntity = this.generateFromYamlFile(yamlFilePath);
    await Promise.all(
      Object.entries(codeByEntity).map(([entity, code]) => {
        const filePath = path.join(outputDir, `${entity}.ts`);
        return writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      })
    );
    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Domain model files generated successfully!') + '\n');
  }
}

