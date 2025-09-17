import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { validationTemplates, typeMapping } from './templates/validationTemplates';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { COMMON_FILES } from '../utils/constants';

interface FieldConfig {
  name: string;
  type: string;
  required?: boolean;
  auto?: boolean;
  unique?: boolean;
}

interface ModelConfig {
  name: string;
  fields: FieldConfig[];
}

type ModuleConfig = {
  models?: ModelConfig[];
  actions?: Record<string, any>;
  permissions?: any[];
};

type AppConfig =
  | {
      modules: Record<string, ModuleConfig>;
    }
  | ModuleConfig;

export class ValidationGenerator {
  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  }

  private getTypeScriptType(yamlType: string): string {
    return (typeMapping as any)[yamlType] || 'any';
  }

  private generateInterfaceField(field: FieldConfig, isCreate: boolean): string {
    const tsType = this.getTypeScriptType(field.type);

    if (isCreate) {
      if (field.auto || field.name === 'id') {
        return '';
      }
      const optional = !field.required ? '?' : '';
      return `  ${field.name}${optional}: ${tsType};`;
    } else {
      if (field.name === 'id' || field.auto) {
        return '';
      }
      return `  ${field.name}?: ${tsType};`;
    }
  }

  private generateValidationLogic(field: FieldConfig, isCreate: boolean): string {
    const fieldName = field.name;

    if (field.auto || field.name === 'id') {
      return '';
    }

    let template = '';
    const isRequired = isCreate && field.required;

    switch (field.type) {
      case 'string':
        template = isRequired ? validationTemplates.requiredStringValidation : validationTemplates.optionalStringValidation;
        break;
      case 'number':
        template = isRequired ? validationTemplates.requiredNumberValidation : validationTemplates.optionalNumberValidation;
        break;
      case 'boolean':
        template = isRequired ? validationTemplates.requiredBooleanValidation : validationTemplates.optionalBooleanValidation;
        break;
      case 'datetime':
        template = isRequired ? validationTemplates.requiredDateValidation : validationTemplates.optionalDateValidation;
        break;
      default:
        template = isRequired ? validationTemplates.requiredComplexValidation : validationTemplates.optionalComplexValidation;
        break;
    }

    return this.replaceTemplateVars(template, { FIELD_NAME: fieldName });
  }

  private generateDtoField(field: FieldConfig, isCreate: boolean): string {
    const tsType = this.getTypeScriptType(field.type);

    if (isCreate) {
      if (field.auto || field.name === 'id') {
        return '';
      }
      const optional = !field.required ? '?' : '';
      return `  ${field.name}${optional}: ${tsType};`;
    } else {
      if (field.name === 'id' || field.auto) {
        return '';
      }
      return `  ${field.name}?: ${tsType};`;
    }
  }

  private generateDtoInterface(entityName: string, fields: FieldConfig[], isCreate: boolean): string {
    const dtoName = `${entityName}DTO`;
    const dtoFields = fields
      .map(field => this.generateDtoField(field, isCreate))
      .filter(field => field !== '')
      .join('\n');

    return this.replaceTemplateVars(validationTemplates.dtoInterface, {
      DTO_NAME: dtoName,
      DTO_FIELDS: dtoFields
    });
  }

  private generateInputInterface(entityName: string, fields: FieldConfig[], isCreate: boolean): string {
    const interfaceName = `${isCreate ? 'Create' : 'Update'}${entityName}Input`;
    const interfaceFields = fields
      .map(field => this.generateInterfaceField(field, isCreate))
      .filter(field => field !== '')
      .join('\n');

    return this.replaceTemplateVars(validationTemplates.inputInterface, {
      INTERFACE_NAME: interfaceName,
      INTERFACE_FIELDS: interfaceFields
    });
  }

  private generateValidationFunction(entityName: string, fields: FieldConfig[], isCreate: boolean): string {
    const functionName = `validate${isCreate ? 'Create' : 'Update'}${entityName}`;
    const dtoParam = `${entityName.toLowerCase()}Data: ${entityName}DTO`;

    const validationLogic = fields
      .map(field => this.generateValidationLogic(field, isCreate))
      .filter(logic => logic !== '')
      .join('\n');

    return this.replaceTemplateVars(validationTemplates.validationFunction, {
      FUNCTION_NAME: functionName,
      VALIDATION_LOGIC: validationLogic
    }).replace('(data: any)', `(${dtoParam})`).replace(/data\./g, `${entityName.toLowerCase()}Data.`);
  }

  public generateValidation(entityName: string, fields: FieldConfig[]): string {
    const dtoInterface = this.generateDtoInterface(entityName, fields, true);

    const createValidation = this.generateValidationFunction(entityName, fields, true);
    const updateValidation = this.generateValidationFunction(entityName, fields, false);
    const validationFunctions = `${createValidation}\n\n${updateValidation}`;

    return this.replaceTemplateVars(validationTemplates.validationFileTemplate, {
      ENTITY_NAME: entityName,
      DTO_INTERFACES: dtoInterface,
      VALIDATION_FUNCTIONS: validationFunctions
    });
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent) as AppConfig;
    const validations: Record<string, string> = {};

    if ((config as any).modules) {
      Object.values((config as any).modules as Record<string, ModuleConfig>).forEach(moduleConfig => {
        if (moduleConfig.models && moduleConfig.models.length > 0) {
          moduleConfig.models.forEach(model => {
            const validationCode = this.generateValidation(model.name, model.fields);
            validations[model.name] = validationCode;
          });
        }
      });
    } else if ((config as any).models) {
      const module = config as ModuleConfig;
      if (module.models) {
        module.models.forEach(model => {
          const validationCode = this.generateValidation(model.name, model.fields);
          validations[model.name] = validationCode;
        });
      }
    }

    return validations;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string = COMMON_FILES.APP_YAML,
    outputDir: string = 'application',
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const validations = this.generateFromYamlFile(yamlFilePath);

    const validationDir = path.join(outputDir, 'validation');
    fs.mkdirSync(validationDir, { recursive: true });

    for (const [entityName, validationCode] of Object.entries(validations)) {
      const fileName = `${entityName}Validation.ts`;
      const filePath = path.join(validationDir, fileName);
      // Sequential to avoid multiple prompts overlapping
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, validationCode, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Validation files generated successfully!') + '\n');
  }
}

