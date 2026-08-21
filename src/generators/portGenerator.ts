import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import {
  ModuleConfig,
  UseCaseInputConfig,
  UseCaseOutputConfig,
  AggregateConfig,
  isValidModuleConfig,
  IdentifierType,
  idTsType
} from '../types/configTypes';
import { capitalize, mapType as mapTypeUtil, isAggregateReference } from '../utils/typeUtils';
import { AppConfig } from '../utils/commandUtils';
import { resolveCommandModel } from '../utils/crossModuleUtils';

export class PortGenerator {
  private availableAggregates: Map<string, AggregateConfig> = new Map();
  private identifiers: IdentifierType = 'numeric';

  private mapType(yamlType: string): string {
    return mapTypeUtil(yamlType, this.availableAggregates);
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

  private generatePortInput(pascalQueryName: string, inputConfig: UseCaseInputConfig | undefined): string {
    const className = `${pascalQueryName}Input`;

    if (!inputConfig) {
      return `export class ${className} {
  private constructor() {}

  static parse(_body: unknown): ${className} {
    return new ${className}();
  }
}`;
    }

    const fieldDeclarations: string[] = [];
    const constructorAssignments: string[] = [];
    const validationChecks: string[] = [];
    const fieldTransforms: string[] = [];

    // identifier (for get/delete-style queries)
    if (inputConfig.identifier) {
      const fieldName = inputConfig.identifier;
      const idTs = idTsType(this.identifiers);
      const idTransform = this.identifiers === 'numeric'
        ? `typeof b.${fieldName} === 'string' ? parseInt(b.${fieldName}, 10) : b.${fieldName} as number`
        : `b.${fieldName} as string`;
      fieldDeclarations.push(`  readonly ${fieldName}: ${idTs};`);
      constructorAssignments.push(`    this.${fieldName} = data.${fieldName};`);
      validationChecks.push(`    if (b.${fieldName} === undefined || b.${fieldName} === null) {
      throw new Error('${fieldName} is required');
    }`);
      fieldTransforms.push(`      ${fieldName}: ${idTransform}`);
    }

    // pagination
    if (inputConfig.pagination) {
      const defaultLimit = inputConfig.pagination.defaults?.limit || 20;
      const maxLimit = inputConfig.pagination.defaults?.maxLimit || 100;
      fieldDeclarations.push(`  readonly page: number;`);
      fieldDeclarations.push(`  readonly limit: number;`);
      constructorAssignments.push(`    this.page = data.page;`);
      constructorAssignments.push(`    this.limit = data.limit;`);
      fieldTransforms.push(`      page: typeof b.page === 'string' ? parseInt(b.page, 10) : (b.page as number || 1)`);
      fieldTransforms.push(`      limit: Math.min(typeof b.limit === 'string' ? parseInt(b.limit, 10) : (b.limit as number || ${defaultLimit}), ${maxLimit})`);
    }

    // fields from aggregate (pick/omit)
    if (inputConfig.from) {
      const aggregateConfig = this.availableAggregates.get(inputConfig.from);
      if (aggregateConfig) {
        let aggregateFields = Object.entries(aggregateConfig.fields);
        if (inputConfig.pick && inputConfig.pick.length > 0) {
          aggregateFields = aggregateFields.filter(([f]) => inputConfig.pick!.includes(f));
        }
        if (inputConfig.omit && inputConfig.omit.length > 0) {
          aggregateFields = aggregateFields.filter(([f]) => !inputConfig.omit!.includes(f));
        }
        const idTs = idTsType(this.identifiers);
        aggregateFields.forEach(([fieldName, fieldConfig]) => {
          if (fieldName === 'id' || fieldConfig.auto) return;
          const isAggRef = isAggregateReference(fieldConfig.type, this.availableAggregates);
          const tsType = isAggRef ? idTs : this.mapType(fieldConfig.type);
          const effectiveType = isAggRef ? (this.identifiers === 'numeric' ? 'number' : 'string') : fieldConfig.type;
          const isRequired = !isAggRef && !inputConfig.partial && fieldConfig.required !== false;
          const optional = isRequired ? '' : '?';
          fieldDeclarations.push(`  readonly ${fieldName}${optional}: ${tsType};`);
          constructorAssignments.push(`    this.${fieldName} = data.${fieldName};`);
          if (isRequired) {
            validationChecks.push(`    if (b.${fieldName} === undefined || b.${fieldName} === null) {
      throw new Error('${fieldName} is required');
    }`);
          }
          fieldTransforms.push(`      ${fieldName}: ${this.getTransformCode(fieldName, effectiveType)}`);
        });
      }
    }

    // add fields (standalone, not from aggregate)
    if (inputConfig.add) {
      Object.entries(inputConfig.add).forEach(([fieldName, fieldDef]) => {
        if (fieldDef.source) return; // auto-injected fields are not parsed from body
        const tsType = this.mapType(fieldDef.type);
        fieldDeclarations.push(`  readonly ${fieldName}: ${tsType};`);
        constructorAssignments.push(`    this.${fieldName} = data.${fieldName};`);
        validationChecks.push(`    if (b.${fieldName} === undefined || b.${fieldName} === null) {
      throw new Error('${fieldName} is required');
    }`);
        fieldTransforms.push(`      ${fieldName}: ${this.getTransformCode(fieldName, fieldDef.type)}`);
      });
    }

    // filters
    if (inputConfig.filters) {
      Object.entries(inputConfig.filters).forEach(([filterName, filterConfig]) => {
        const tsType = this.mapType(filterConfig.type);
        const isRequired = !filterConfig.optional;
        const optional = isRequired ? '' : '?';
        fieldDeclarations.push(`  readonly ${filterName}${optional}: ${tsType};`);
        constructorAssignments.push(`    this.${filterName} = data.${filterName};`);
        if (isRequired) {
          validationChecks.push(`    if (b.${filterName} === undefined || b.${filterName} === null) {
      throw new Error('${filterName} is required');
    }`);
        }
        fieldTransforms.push(`      ${filterName}: ${this.getTransformCode(filterName, filterConfig.type)}`);
      });
    }

    const fieldsStr = fieldDeclarations.length > 0 ? fieldDeclarations.join('\n') : '  // No fields';
    const assignmentsStr = constructorAssignments.join('\n');
    const validationsStr = validationChecks.length > 0 ? '\n' + validationChecks.join('\n') + '\n' : '';
    const transformsStr = fieldTransforms.join(',\n');

    return `export class ${className} {
${fieldsStr}

  private constructor(data: Record<string, any>) {
${assignmentsStr}
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

  private generatePortOutput(
    pascalQueryName: string,
    outputConfig: UseCaseOutputConfig | 'void' | undefined
  ): string {
    const className = `${pascalQueryName}Output`;

    if (!outputConfig || outputConfig === 'void') {
      return `export type ${className} = void;`;
    }

    const fieldDeclarations: string[] = [];
    const constructorAssignments: string[] = [];
    const fromMappings: string[] = [];
    const modelRef = outputConfig.from;

    if (modelRef) {
      const idTs = idTsType(this.identifiers);
      fieldDeclarations.push(`  readonly id: ${idTs};`);
      constructorAssignments.push(`    this.id = data.id;`);
      fromMappings.push(`      id: entity.id`);

      const aggregateConfig = this.availableAggregates.get(modelRef);
      if (aggregateConfig) {
        let aggregateFields = Object.entries(aggregateConfig.fields);
        if (outputConfig.pick && outputConfig.pick.length > 0) {
          aggregateFields = aggregateFields.filter(([f]) => outputConfig.pick!.includes(f));
        }
        const idTs2 = idTsType(this.identifiers);
        aggregateFields.forEach(([fieldName, fieldConfig]) => {
          if (fieldName === 'id') return;
          const isAggRef = isAggregateReference(fieldConfig.type, this.availableAggregates);
          const tsType = isAggRef ? idTs2 : this.mapType(fieldConfig.type);
          const isOptional = fieldConfig.required === false || isAggRef;
          const optional = isOptional ? '?' : '';
          fieldDeclarations.push(`  readonly ${fieldName}${optional}: ${tsType};`);
          constructorAssignments.push(`    this.${fieldName} = data.${fieldName};`);
          fromMappings.push(isAggRef
            ? `      ${fieldName}: entity.${fieldName}?.id`
            : `      ${fieldName}: entity.${fieldName}`);
        });
      }
    }

    // add fields
    if (outputConfig.add) {
      Object.entries(outputConfig.add).forEach(([fieldName, fieldDef]) => {
        const tsType = this.mapType(fieldDef.type);
        fieldDeclarations.push(`  readonly ${fieldName}: ${tsType};`);
        constructorAssignments.push(`    this.${fieldName} = data.${fieldName};`);
        fromMappings.push(`      ${fieldName}: (entity as any).${fieldName}`);
      });
    }

    const fieldsStr = fieldDeclarations.length > 0 ? fieldDeclarations.join('\n') : '  // No fields';
    const assignmentsStr = constructorAssignments.join('\n');
    const mappingsStr = fromMappings.join(',\n');

    if (outputConfig.pagination) {
      return `export class ${className}Item {
${fieldsStr}

  private constructor(data: Record<string, any>) {
${assignmentsStr}
  }

  static from(entity: ${modelRef}): ${className}Item {
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

  static from(data: { items: ${modelRef}[]; total: number; page?: number; limit?: number }): ${className} {
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

  private constructor(data: Record<string, any>) {
${assignmentsStr}
  }

  static from(entity: ${modelRef}): ${className} {
    return new ${className}({
${mappingsStr}
    });
  }
}`;
  }

  /** Generate port interface files for this module's exported queries and commands */
  public generateExportPorts(config: ModuleConfig, identifiers: IdentifierType): Record<string, string> {
    const result: Record<string, string> = {};
    this.identifiers = identifiers;
    this.availableAggregates.clear();

    if (config.domain?.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    // Detect name collisions between queries and commands (both emit to the same interface file)
    const queryNames = new Set(Object.keys(config.exports?.queries || {}));
    for (const cmdName of Object.keys(config.exports?.commands || {})) {
      if (queryNames.has(cmdName)) {
        // eslint-disable-next-line no-console
        console.warn(colors.yellow(`Warning: '${cmdName}' is declared as both a query and a command in exports — the command interface will overwrite the query interface.`));
      }
    }

    const queries = config.exports?.queries || {};
    for (const [queryName, queryConfig] of Object.entries(queries)) {
      const pascalName = capitalize(queryName);

      const inputCode = this.generatePortInput(pascalName, queryConfig.input);
      const outputCode = this.generatePortOutput(pascalName, queryConfig.output);

      const modelRef = queryConfig.output !== 'void' && queryConfig.output?.from
        ? queryConfig.output.from
        : undefined;
      const imports: string[] = [];
      if (modelRef) {
        imports.push(`import { ${modelRef} } from '../../domain/entities/${modelRef}';`);
      }

      const interfaceCode = `export interface I${pascalName}Query {
  execute(input: ${pascalName}Input): Promise<${pascalName}Output>;
}`;

      const parts = [...(imports.length ? [imports.join('\n')] : []), inputCode, outputCode, interfaceCode];
      result[`${pascalName}Interface`] = parts.join('\n\n');
    }

    const commands = config.exports?.commands || {};
    for (const [commandName, commandConfig] of Object.entries(commands)) {
      const pascalName = capitalize(commandName);

      const inputCode = this.generatePortInput(pascalName, commandConfig.input);
      const outputCode = this.generatePortOutput(pascalName, commandConfig.output);

      const modelRef = resolveCommandModel(commandConfig);
      const imports: string[] = [];
      if (modelRef) {
        imports.push(`import { ${modelRef} } from '../../domain/entities/${modelRef}';`);
      }

      const interfaceCode = `export interface I${pascalName}Command {
  execute(input: ${pascalName}Input): Promise<${pascalName}Output>;
}`;

      const parts = [...(imports.length ? [imports.join('\n')] : []), inputCode, outputCode, interfaceCode];
      result[`${pascalName}Interface`] = parts.join('\n\n');
    }

    return result;
  }

  /** Generate re-export port files for this module's dependencies (queries and commands) */
  public generateDependencyPorts(
    config: ModuleConfig,
    moduleDir: string,
    appConfig: AppConfig
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const dependencies = config.dependencies || {};
    const consumerPortsDir = path.join(moduleDir, 'application', 'ports');

    for (const [depModuleName, depConfig] of Object.entries(dependencies)) {
      const queryNames = depConfig.queries || [];
      const commandNames = depConfig.commands || [];
      if (queryNames.length === 0 && commandNames.length === 0) continue;

      // Find the exporting module's directory from app.yaml
      const exporterEntry = Object.entries(appConfig.modules).find(
        ([name]) => name.toLowerCase() === depModuleName.toLowerCase()
      );
      if (!exporterEntry) {
        // eslint-disable-next-line no-console
        console.warn(colors.yellow(`Warning: dependency module '${depModuleName}' not found in app.yaml`));
        continue;
      }

      const exporterYamlPath = path.isAbsolute(exporterEntry[1].path)
        ? exporterEntry[1].path
        : path.resolve(process.cwd(), exporterEntry[1].path);
      const exporterPortsDir = path.join(path.dirname(exporterYamlPath), 'application', 'ports');

      for (const queryName of queryNames) {
        const pascalName = capitalize(queryName);
        const portFileName = `${pascalName}Interface`;
        const exporterPortFile = path.join(exporterPortsDir, portFileName);

        let relPath = path.relative(consumerPortsDir, exporterPortFile).replace(/\\/g, '/');
        if (!relPath.startsWith('.')) relPath = `./${relPath}`;

        result[portFileName] =
          `export { I${pascalName}Query, ${pascalName}Input, ${pascalName}Output } from '${relPath}';`;
      }

      for (const commandName of commandNames) {
        const pascalName = capitalize(commandName);
        const portFileName = `${pascalName}Interface`;
        const exporterPortFile = path.join(exporterPortsDir, portFileName);

        let relPath = path.relative(consumerPortsDir, exporterPortFile).replace(/\\/g, '/');
        if (!relPath.startsWith('.')) relPath = `./${relPath}`;

        result[portFileName] =
          `export { I${pascalName}Command, ${pascalName}Input, ${pascalName}Output } from '${relPath}';`;
      }
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean },
    identifiers: IdentifierType = 'numeric',
    appConfig?: AppConfig
  ): Promise<void> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) return;

    const hasQueryExports = !!(config.exports?.queries && Object.keys(config.exports.queries).length > 0);
    const hasCommandExports = !!(config.exports?.commands && Object.keys(config.exports.commands).length > 0);
    const hasExports = hasQueryExports || hasCommandExports;
    const hasDeps = !!(config.dependencies && Object.keys(config.dependencies).some(
      k => (config.dependencies![k].queries?.length ?? 0) > 0 || (config.dependencies![k].commands?.length ?? 0) > 0
    ));
    if (!hasExports && !hasDeps) return;

    const portsDir = path.join(moduleDir, 'application', 'ports');
    fs.mkdirSync(portsDir, { recursive: true });

    if (hasExports) {
      const exportPorts = this.generateExportPorts(config, identifiers);
      for (const [name, code] of Object.entries(exportPorts)) {
        const filePath = path.join(portsDir, `${name}.ts`);
        // eslint-disable-next-line no-await-in-loop
        await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      }
    }

    if (hasDeps && appConfig) {
      const depPorts = this.generateDependencyPorts(config, moduleDir, appConfig);
      for (const [name, code] of Object.entries(depPorts)) {
        const filePath = path.join(portsDir, `${name}.ts`);
        // eslint-disable-next-line no-await-in-loop
        await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Port interface files generated successfully!') + '\n');
  }
}
