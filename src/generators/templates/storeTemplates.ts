export const storeTemplates = {
  rowInterface: `export interface {{ENTITY_NAME}}Row {
  id: number;
{{ROW_FIELDS}}
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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

  private rowToModel(row: {{ENTITY_NAME}}Row): {{ENTITY_NAME}} {
    return new {{ENTITY_NAME}}(
      row.id,
{{ROW_TO_MODEL_MAPPING}}
    );
  }

  async getAll(page: number = 1, limit: number = 20): Promise<{{ENTITY_NAME}}[]> {
    const offset = (page - 1) * limit;
    const result = await this.db.query(
      \`SELECT {{FIELD_NAMES}} FROM \\\`\${this.tableName}\\\` WHERE deleted_at IS NULL LIMIT :limit OFFSET :offset\`,
      { limit: String(limit), offset: String(offset) }
    );

    if (result.success && result.data) {
      return result.data.map((row: {{ENTITY_NAME}}Row) => this.rowToModel(row));
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

  async getById(id: number): Promise<{{ENTITY_NAME}} | null> {
    const result = await this.db.query(
      \`SELECT {{FIELD_NAMES}} FROM \\\`\${this.tableName}\\\` WHERE id = :id AND deleted_at IS NULL\`,
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
      created_at: this.toMySQLDatetime(now),
      updated_at: this.toMySQLDatetime(now)
    };

    const fieldsList = Object.keys(data).map(f => \`\\\`\${f}\\\`\`).join(', ');
    const placeholders = Object.keys(data).map(f => \`:\${f}\`).join(', ');

    const result = await this.db.query(
      \`INSERT INTO \\\`\${this.tableName}\\\` (\${fieldsList}) VALUES (\${placeholders})\`,
      data
    );

    if (result.success && result.insertId) {
      const newId = typeof result.insertId === 'string' ? parseInt(result.insertId, 10) : result.insertId;
      return this.getById(newId) as Promise<{{ENTITY_NAME}}>;
    }

    throw new Error('Failed to insert {{ENTITY_NAME}}');
  }

  async update(id: number, entity: {{ENTITY_NAME}}): Promise<{{ENTITY_NAME}}> {
    const now = new Date();
    const data: Partial<{{ENTITY_NAME}}Row> & { id: number } = {
{{UPDATE_DATA_MAPPING}},
      updated_at: this.toMySQLDatetime(now),
      id
    };

    const updateFields = {{UPDATE_FIELDS_ARRAY}}.map(f => \`\\\`\${f}\\\` = :\${f}\`).join(', ');

    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET \${updateFields}, updated_at = :updated_at WHERE id = :id\`,
      data
    );

    if (result.success) {
      return this.getById(id) as Promise<{{ENTITY_NAME}}>;
    }

    throw new Error('Failed to update {{ENTITY_NAME}}');
  }

  async softDelete(id: number): Promise<boolean> {
    const now = new Date();
    const result = await this.db.query(
      \`UPDATE \\\`\${this.tableName}\\\` SET deleted_at = :deleted_at WHERE id = :id\`,
      { deleted_at: this.toMySQLDatetime(now), id }
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
import { {{ENTITY_NAME}} } from '../../domain/entities/{{ENTITY_NAME}}';
import type { ISqlProvider } from '@currentjs/provider-mysql';{{VALUE_OBJECT_IMPORTS}}

{{ROW_INTERFACE}}

{{STORE_CLASS}}
`;
