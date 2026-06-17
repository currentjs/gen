import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import {
  ModuleConfig,
  ExportedQueryConfig,
  AggregateConfig,
  isValidModuleConfig,
  IdentifierType,
  idTsType
} from '../types/configTypes';
import { capitalize } from '../utils/typeUtils';

export class QueryGenerator {
  private availableAggregates: Map<string, AggregateConfig> = new Map();
  private identifiers: IdentifierType = 'numeric';

  /**
   * Generate the body of the execute() method using smart patterns based on the query's input config,
   * mirroring what serviceGenerator does for default:get, default:list, etc.
   */
  private generateExecuteBody(queryName: string, queryConfig: ExportedQueryConfig): string {
    const pascalName = capitalize(queryName);
    const inputConfig = queryConfig.input;
    const outputConfig = queryConfig.output;
    const modelRef = outputConfig !== 'void' && outputConfig?.from ? outputConfig.from : null;
    const modelVar = modelRef ? modelRef.charAt(0).toLowerCase() + modelRef.slice(1) : null;
    const storeVar = modelVar ? `this.${modelVar}Store` : null;

    // get-by-id pattern: input has an identifier
    if (inputConfig?.identifier && modelRef && storeVar && modelVar) {
      return `    const ${modelVar} = await ${storeVar}.getById(input.${inputConfig.identifier});
    if (!${modelVar}) {
      throw new Error('${modelRef} not found');
    }
    return ${pascalName}Output.from(${modelVar});`;
    }

    // paginated list pattern
    if (inputConfig?.pagination && modelRef && storeVar) {
      const hasPagination = outputConfig !== 'void' && outputConfig?.pagination;
      if (hasPagination) {
        return `    const [items, total] = await Promise.all([
      ${storeVar}.getPaginated(input.page, input.limit),
      ${storeVar}.count()
    ]);
    return ${pascalName}Output.from({ items, total, page: input.page, limit: input.limit });`;
      }
      return `    const items = await ${storeVar}.getPaginated(input.page, input.limit);
    return ${pascalName}Output.from({ items, total: items.length, page: input.page, limit: input.limit });`;
    }

    // from-model without identifier: fetch all and return first, or return as list
    if (inputConfig?.from && modelRef && storeVar && modelVar) {
      return `    const items = await ${storeVar}.getAll();
    return ${pascalName}Output.from(items[0]);`;
    }

    // add-only fields or no input: custom query — return sensible stub
    if (modelRef && storeVar && modelVar) {
      return `    // TODO: Implement ${queryName} query logic
    const ${modelVar} = await ${storeVar}.getAll();
    return ${pascalName}Output.from(${modelVar}[0]);`;
    }

    // no model reference — pure custom logic
    return `    // TODO: Implement ${queryName} query logic
    throw new Error('${queryName} not implemented');`;
  }

  public generateFromConfig(config: ModuleConfig, identifiers: IdentifierType): Record<string, string> {
    const result: Record<string, string> = {};
    this.identifiers = identifiers;
    this.availableAggregates.clear();

    if (config.domain?.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([name, aggConfig]) => {
        this.availableAggregates.set(name, aggConfig);
      });
    }

    const queries = config.exports?.queries || {};
    for (const [queryName, queryConfig] of Object.entries(queries)) {
      const pascalName = capitalize(queryName);
      const className = `${pascalName}Query`;
      const outputConfig = queryConfig.output;
      const modelRef = outputConfig !== 'void' && outputConfig?.from ? outputConfig.from : null;
      const storeClass = modelRef ? `${modelRef}Store` : null;
      const storeVar = modelRef ? `${modelRef.charAt(0).toLowerCase() + modelRef.slice(1)}Store` : null;
      const idTs = idTsType(this.identifiers);

      const imports: string[] = [
        `import { Injectable } from '../../../../system';`,
        `import { I${pascalName}Query, ${pascalName}Input, ${pascalName}Output } from '../ports/${pascalName}Interface';`,
      ];
      if (storeClass) {
        imports.push(`import { ${storeClass} } from '../../infrastructure/stores/${storeClass}';`);
      }

      const constructorParam = storeClass && storeVar
        ? `private ${storeVar}: ${storeClass}`
        : '';

      const executeBody = this.generateExecuteBody(queryName, queryConfig);

      const code = `${imports.join('\n')}

@Injectable()
export class ${className} implements I${pascalName}Query {
  constructor(${constructorParam ? `\n    ${constructorParam}\n  ` : ''}) {}

  async execute(input: ${pascalName}Input): Promise<${pascalName}Output> {
${executeBody}
  }
}`;

      result[className] = code;
    }

    return result;
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean },
    identifiers: IdentifierType = 'numeric'
  ): Promise<void> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) return;
    if (!config.exports?.queries || Object.keys(config.exports.queries).length === 0) return;

    const queriesDir = path.join(moduleDir, 'application', 'queries');
    fs.mkdirSync(queriesDir, { recursive: true });

    const queriesByName = this.generateFromConfig(config, identifiers);
    for (const [name, code] of Object.entries(queriesByName)) {
      const filePath = path.join(queriesDir, `${name}.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Query files generated successfully!') + '\n');
  }
}
