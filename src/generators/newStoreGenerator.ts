import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, AggregateConfig, isNewModuleConfig } from '../types/configTypes';

export class NewStoreGenerator {
  private generateStore(modelName: string, aggregateConfig: AggregateConfig): string {
    const storeName = `${modelName}Store`;
    const entityLower = modelName.toLowerCase();
    const tableName = entityLower.toLowerCase();

    // Generate field list for SQL queries
    const fields = Object.entries(aggregateConfig.fields);
    const fieldNames = ['id', ...fields.map(([name]) => name)];
    // Escape backticks for use inside template string
    const fieldNamesStr = fieldNames.map(f => `\\\`${f}\\\``).join(', ');

    // Generate field mappings for rowToModel
    const fieldMappings = fields
      .map(([fieldName, fieldConfig]) => {
        const tsType = fieldConfig.type;
        if (tsType === 'datetime' || tsType === 'date') {
          return `      row.${fieldName} ? new Date(row.${fieldName}) : undefined`;
        } else if (tsType === 'boolean') {
          return `      Boolean(row.${fieldName})`;
        } else {
          return `      row.${fieldName}`;
        }
      })
      .join(',\n');

    // Generate constructor args for entity creation
    const constructorArgs = ['row.id', ...fields.map(() => '')];
    const constructorArgsStr = `row.id,\n${fieldMappings}`;

    return `import { ${modelName} } from '../../domain/entities/${modelName}';
import type { ISqlProvider } from '@currentjs/provider-mysql';

/**
 * Data access layer for ${modelName}
 */
export class ${storeName} {
  private tableName = '${tableName}';

  constructor(private db: ISqlProvider) {}

  private rowToModel(row: any): ${modelName} {
    return new ${modelName}(
${constructorArgsStr}
    );
  }

  async getAll(page: number = 1, limit: number = 20): Promise<${modelName}[]> {
    const offset = (page - 1) * limit;
    const result = await this.db.query(
      \`SELECT ${fieldNamesStr} FROM \\\`\${this.tableName}\\\` WHERE deleted_at IS NULL LIMIT :limit OFFSET :offset\`,
      { limit, offset }
    );

    if (result.success && result.data) {
      return result.data.map(row => this.rowToModel(row));
    }
    return [];
  }

  async count(): Promise<number> {
    const result = await this.db.query(
      \`SELECT COUNT(*) as count FROM \\\`\${this.tableName}\\\` WHERE deleted_at IS NULL\`,
      {}
    );

    if (result.success && result.data && result.data.length > 0) {
      return parseInt(result.data[0].count, 10);
    }
    return 0;
  }

  async getById(id: number): Promise<${modelName} | null> {
    const result = await this.db.query(
      \`SELECT ${fieldNamesStr} FROM \\\`\${this.tableName}\\\` WHERE id = :id AND deleted_at IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return this.rowToModel(result.data[0]);
    }
    return null;
  }

  async insert(entity: ${modelName}): Promise<${modelName}> {
    const now = new Date();
    const data: any = {
${fields.map(([fieldName]) => `      ${fieldName}: entity.${fieldName}`).join(',\n')},
      created_at: now,
      updated_at: now
    };

    const fieldsList = Object.keys(data).map(f => \`\\\`\${f}\\\`\`).join(', ');
    const placeholders = Object.keys(data).map(f => \`:\${f}\`).join(', ');

    const result = await this.db.query(
      \`INSERT INTO \\\`\${this.tableName}\\\` (\${fieldsList}) VALUES (\${placeholders})\`,
      data
    );

    if (result.success && result.insertId) {
      const newId = typeof result.insertId === 'string' ? parseInt(result.insertId, 10) : result.insertId;
      return this.getById(newId) as Promise<${modelName}>;
    }

    throw new Error('Failed to insert ${modelName}');
  }

  async update(id: number, entity: ${modelName}): Promise<${modelName}> {
    const now = new Date();
    const data: any = {
${fields.map(([fieldName]) => `      ${fieldName}: entity.${fieldName}`).join(',\n')},
      updated_at: now,
      id
    };

    const updateFields = ${JSON.stringify(fields.map(([name]) => name))}.map(f => \`\\\`\${f}\\\` = :\${f}\`).join(', ');

    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET \${updateFields}, updated_at = :updated_at WHERE id = :id\`,
      data
    );

    if (result.success) {
      return this.getById(id) as Promise<${modelName}>;
    }

    throw new Error('Failed to update ${modelName}');
  }

  async softDelete(id: number): Promise<boolean> {
    const now = new Date();
    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET deleted_at = :deleted_at WHERE id = :id\`,
      { deleted_at: now, id }
    );

    return result.success;
  }

  async hardDelete(id: number): Promise<boolean> {
    const result = await this.db.query(
      \`DELETE FROM \\\`\${this.tableName}\\\` WHERE id = :id\`,
      { id }
    );

    return result.success;
  }
}
`;
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

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

