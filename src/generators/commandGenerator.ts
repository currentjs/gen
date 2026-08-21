import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import {
  ModuleConfig,
  ExportedCommandConfig,
  isValidModuleConfig,
  IdentifierType
} from '../types/configTypes';
import { capitalize } from '../utils/typeUtils';
import { resolveCommandModel, defaultHandlerArgs } from '../utils/crossModuleUtils';

export class CommandGenerator {
  private identifiers: IdentifierType = 'numeric';

  /**
   * Build the body of the execute() method by walking the command's handler chain.
   * Each handler calls the backing service's method in sequence, passing the previous
   * result to the next custom handler. The final result is returned (or nothing for void).
   */
  private generateExecuteBody(
    commandName: string,
    commandConfig: ExportedCommandConfig,
    modelName: string,
    serviceVar: string
  ): string {
    const pascalName = capitalize(commandName);
    const handlers = commandConfig.handlers;
    const isVoid = !commandConfig.output || commandConfig.output === 'void';
    const lines: string[] = [];

    handlers.forEach((handler, index) => {
      const isLast = index === handlers.length - 1;
      const resultVar = isLast ? 'result' : `result${index}`;
      const prevResult = index === 0 ? 'null' : `result${index - 1}`;

      if (handler.startsWith('default:')) {
        const action = handler.replace('default:', '');
        const rawArgs = defaultHandlerArgs(action, commandConfig.input);
        // Cast to 'any' for create/update since the command's port input type may differ
        // structurally from the service's DTO type (e.g. SendEmailInput vs NotificationCreateInput).
        const args = (action === 'create' || action === 'update') ? `${rawArgs} as any` : rawArgs;
        lines.push(`    const ${resultVar} = await this.${serviceVar}.${action}(${args});`);
      } else if (handler.startsWith('service:')) {
        const method = handler.replace('service:', '');
        lines.push(`    const ${resultVar} = await this.${serviceVar}.${method}(${prevResult}, input);`);
      } else {
        lines.push(`    const ${resultVar} = await this.${serviceVar}.${handler}(${prevResult}, input);`);
      }
    });

    if (handlers.length === 0) {
      lines.push(`    // TODO: Implement ${commandName} command logic`);
      if (isVoid) {
        lines.push(`    return;`);
      } else {
        lines.push(`    throw new Error('${commandName} not implemented');`);
      }
      return lines.join('\n');
    }

    if (isVoid) {
      lines.push(`    return;`);
    } else {
      lines.push(`    return ${pascalName}Output.from(result);`);
    }

    return lines.join('\n');
  }

  public generateFromConfig(config: ModuleConfig, identifiers: IdentifierType): Record<string, string> {
    const result: Record<string, string> = {};
    this.identifiers = identifiers;

    const commands = config.exports?.commands || {};

    for (const [commandName, commandConfig] of Object.entries(commands)) {
      const pascalName = capitalize(commandName);
      const className = `${pascalName}Command`;
      const modelName = resolveCommandModel(commandConfig);
      const serviceClass = modelName ? `${modelName}Service` : null;
      const serviceVar = modelName
        ? `${modelName.charAt(0).toLowerCase() + modelName.slice(1)}Service`
        : null;
      const isVoid = !commandConfig.output || commandConfig.output === 'void';

      const imports: string[] = [
        `import { Injectable } from '../../../../system';`,
        `import { I${pascalName}Command, ${pascalName}Input${isVoid ? '' : `, ${pascalName}Output`} } from '../ports/${pascalName}Interface';`,
      ];
      if (serviceClass) {
        imports.push(`import { ${serviceClass} } from '../../application/services/${serviceClass}';`);
      }

      const constructorParam = serviceClass && serviceVar
        ? `private ${serviceVar}: ${serviceClass}`
        : '';

      const executeBody = this.generateExecuteBody(
        commandName,
        commandConfig,
        modelName || commandName,
        serviceVar || 'service'
      );

      const returnType = isVoid ? 'void' : `${pascalName}Output`;

      const code = `${imports.join('\n')}

@Injectable()
export class ${className} implements I${pascalName}Command {
  constructor(${constructorParam ? `\n    ${constructorParam}\n  ` : ''}) {}

  async execute(input: ${pascalName}Input): Promise<${returnType}> {
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
    if (!config.exports?.commands || Object.keys(config.exports.commands).length === 0) return;

    const commandsDir = path.join(moduleDir, 'application', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const commandsByName = this.generateFromConfig(config, identifiers);
    for (const [name, code] of Object.entries(commandsByName)) {
      const filePath = path.join(commandsDir, `${name}.ts`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, code, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Command files generated successfully!') + '\n');
  }
}
