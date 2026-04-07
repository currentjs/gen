export const storeTemplates = {
  rowInterface: `export interface {{ENTITY_NAME}}Row {
  id: number;
{{ROW_FIELDS}}
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}`,

  storeClass: `/**
 * Data access layer for {{ENTITY_NAME}}
 */
@Injectable()
export class {{ENTITY_NAME}}Store {
  private tableName = '{{TABLE_NAME}}';

  constructor(private db: ISqlProvider) {}

  private toMySQLDatetime(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private ensureParsed(value: any): any {
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  private rowToModel(row: {{ENTITY_NAME}}Row): {{ENTITY_NAME}} {
    return new {{ENTITY_NAME}}(
      row.id,
{{ROW_TO_MODEL_MAPPING}}
    );
  }

{{LIST_METHODS}}

  async getById(id: number): Promise<{{ENTITY_NAME}} | null> {
    const result = await this.db.query(
      \`SELECT {{FIELD_NAMES}} FROM \\\`\${this.tableName}\\\` WHERE id = :id AND deletedAt IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return this.rowToModel(result.data[0] as {{ENTITY_NAME}}Row);
    }
    return null;
  }

  async insert(entity: {{ENTITY_NAME}}): Promise<{{ENTITY_NAME}}> {
    const now = new Date();
    const data: Partial<{{ENTITY_NAME}}Row> = {
{{INSERT_DATA_MAPPING}},
      createdAt: this.toMySQLDatetime(now),
      updatedAt: this.toMySQLDatetime(now)
    };

    const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const fieldsList = Object.keys(cleanData).map(f => \`\\\`\${f}\\\`\`).join(', ');
    const placeholders = Object.keys(cleanData).map(f => \`:\${f}\`).join(', ');

    const result = await this.db.query(
      \`INSERT INTO \\\`\${this.tableName}\\\` (\${fieldsList}) VALUES (\${placeholders})\`,
      cleanData
    );

    if (result.success && result.insertId) {
      const newId = typeof result.insertId === 'string' ? parseInt(result.insertId, 10) : result.insertId;
      return this.getById(newId) as Promise<{{ENTITY_NAME}}>;
    }

    throw new Error('Failed to insert {{ENTITY_NAME}}');
  }

  async update(id: number, entity: {{ENTITY_NAME}}): Promise<{{ENTITY_NAME}}> {
    const now = new Date();
    const rawData: Partial<{{ENTITY_NAME}}Row> = {
{{UPDATE_DATA_MAPPING}},
      updatedAt: this.toMySQLDatetime(now)
    };

    const cleanData = Object.fromEntries(Object.entries(rawData).filter(([, v]) => v !== undefined));
    const updateFields = {{UPDATE_FIELDS_ARRAY}}
      .filter(f => f in cleanData)
      .map(f => \`\\\`\${f}\\\` = :\${f}\`).join(', ');

    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET \${updateFields}, updatedAt = :updatedAt WHERE id = :id\`,
      { ...cleanData, id }
    );

    if (result.success) {
      return this.getById(id) as Promise<{{ENTITY_NAME}}>;
    }

    throw new Error('Failed to update {{ENTITY_NAME}}');
  }

  async softDelete(id: number): Promise<boolean> {
    const now = new Date();
    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET deletedAt = :deletedAt WHERE id = :id\`,
      { deletedAt: this.toMySQLDatetime(now), id }
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
{{GET_BY_PARENT_ID_METHOD}}
{{GET_RESOURCE_OWNER_METHOD}}}`
};

export const storeFileTemplate = `import { Injectable } from '../../../../system';
import { {{ENTITY_IMPORT_ITEMS}} } from '../../domain/entities/{{ENTITY_NAME}}';
import type { ISqlProvider } from '@currentjs/provider-mysql';{{VALUE_OBJECT_IMPORTS}}{{AGGREGATE_REF_IMPORTS}}

{{ROW_INTERFACE}}

{{STORE_CLASS}}
`;
