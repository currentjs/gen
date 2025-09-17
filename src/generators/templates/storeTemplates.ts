export const storeTemplates = {
  rowInterface: `export interface {{ENTITY_NAME}}Row {
  id: number;
{{ROW_FIELDS}}
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}`,

  storeClass: `export class {{ENTITY_NAME}}Store implements StoreInterface<{{ENTITY_NAME}}, {{ENTITY_NAME}}Row> {
  private static readonly FILTERABLE_FIELDS = [{{FILTERABLE_FIELDS_ARRAY}}];
  private static readonly UPDATABLE_FIELDS = [{{UPDATABLE_FIELDS_ARRAY}}];
  
  constructor(private db: ISqlProvider) {}

  async getById(id: number): Promise<{{ENTITY_NAME}} | null> {
    try {
      const query = 'SELECT * FROM {{TABLE_NAME}} WHERE id = :id AND deleted_at IS NULL';
      const result = await this.db.query(query, { id });
      
      if (!result.success || result.data.length === 0) {
        return null;
      }
      
      return {{ENTITY_NAME}}Store.rowToModel(result.data[0] as {{ENTITY_NAME}}Row);
    } catch (error) {
      if (error instanceof MySQLConnectionError) {
        throw new Error(\`Database connection error while fetching {{ENTITY_NAME}} with id \${id}: \${error.message}\`);
      } else if (error instanceof MySQLQueryError) {
        throw new Error(\`Query error while fetching {{ENTITY_NAME}} with id \${id}: \${error.message}\`);
      }
      throw error;
    }
  }

  async getAll(page: number = 1, limit: number = 10): Promise<{{ENTITY_NAME}}[]> {
    const offset = (page - 1) * limit;
    const query = \`SELECT * FROM {{TABLE_NAME}} WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT \${limit} OFFSET \${offset}\`;
    const result = await this.db.query(query, {});
    
    if (!result.success) {
      return [];
    }
    
    return result.data.map((row: {{ENTITY_NAME}}Row) => {{ENTITY_NAME}}Store.rowToModel(row));
  }

  async getAllByUserId(userId: number, page: number = 1, limit: number = 10): Promise<{{ENTITY_NAME}}[]> {
    const offset = (page - 1) * limit;
    const query = \`SELECT * FROM {{TABLE_NAME}} WHERE user_id = :userId AND deleted_at IS NULL ORDER BY created_at DESC LIMIT \${limit} OFFSET \${offset}\`;
    const result = await this.db.query(query, { userId });
    
    if (!result.success) {
      return [];
    }
    
    return result.data.map((row: {{ENTITY_NAME}}Row) => {{ENTITY_NAME}}Store.rowToModel(row));
  }

  async getBy(filters: Partial<Pick<{{ENTITY_NAME}}Row, {{FILTERABLE_FIELDS}}>>): Promise<{{ENTITY_NAME}} | null> {
    const filterKeys = Object.keys(filters);
    
    // Runtime validation against SQL injection
    for (const key of filterKeys) {
      if (!{{ENTITY_NAME}}Store.FILTERABLE_FIELDS.includes(key)) {
        throw new Error(\`Invalid filter field: \${key}\`);
      }
    }
    
    const whereConditions = filterKeys.map(key => \`\${key} = :\${key}\`);
    
    if (whereConditions.length === 0) {
      throw new Error('At least one filter condition is required');
    }
    
    const query = \`SELECT * FROM {{TABLE_NAME}} WHERE \${whereConditions.join(' AND ')} AND deleted_at IS NULL LIMIT 1\`;
    const result = await this.db.query(query, filters);
    
    if (!result.success || result.data.length === 0) {
      return null;
    }
    
    return {{ENTITY_NAME}}Store.rowToModel(result.data[0] as {{ENTITY_NAME}}Row);
  }

  async getAllBy(filters: Partial<Pick<{{ENTITY_NAME}}Row, {{FILTERABLE_FIELDS}}>>): Promise<{{ENTITY_NAME}}[]> {
    const filterKeys = Object.keys(filters);
    
    // Runtime validation against SQL injection
    for (const key of filterKeys) {
      if (!{{ENTITY_NAME}}Store.FILTERABLE_FIELDS.includes(key)) {
        throw new Error(\`Invalid filter field: \${key}\`);
      }
    }
    
    const whereConditions = filterKeys.map(key => \`\${key} = :\${key}\`);
    
    if (whereConditions.length === 0) {
      return this.getAll();
    }
    
    const query = \`SELECT * FROM {{TABLE_NAME}} WHERE \${whereConditions.join(' AND ')} AND deleted_at IS NULL ORDER BY created_at DESC\`;
    const result = await this.db.query(query, filters);
    
    if (!result.success) {
      return [];
    }
    
    return result.data.map((row: {{ENTITY_NAME}}Row) => {{ENTITY_NAME}}Store.rowToModel(row));
  }

  async insert(model: Omit<{{ENTITY_NAME}}, 'id'>): Promise<{{ENTITY_NAME}}> {
    try {
      const row = {{ENTITY_NAME}}Store.modelToRow(model as {{ENTITY_NAME}});
      delete row.id; // Remove id for insert
      row.created_at = new Date();
      row.updated_at = new Date();
      
      const fields = Object.keys(row);
      const placeholders = fields.map(field => \`:\${field}\`).join(', ');
      
      const query = \`INSERT INTO {{TABLE_NAME}} (\${fields.join(', ')}) VALUES (\${placeholders})\`;
      const result = await this.db.query(query, row);
      
      if (!result.success || !result.insertId) {
        throw new Error('Failed to insert {{ENTITY_NAME}}: Insert operation did not return a valid ID');
      }
      
      return this.getById(Number(result.insertId));
    } catch (error) {
      if (error instanceof MySQLQueryError) {
        throw new Error(\`Failed to insert {{ENTITY_NAME}}: \${error.message}\`);
      } else if (error instanceof MySQLConnectionError) {
        throw new Error(\`Database connection error while inserting {{ENTITY_NAME}}: \${error.message}\`);
      }
      throw error;
    }
  }

  async update(id: number, updates: Partial<Omit<{{ENTITY_NAME}}, 'id' | 'createdAt'>>): Promise<{{ENTITY_NAME}} | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }
    
    // Extract only data properties, not methods
    const updateData = this.extractDataProperties(updates);
    const updateKeys = Object.keys(updateData);
    
    // Runtime validation against SQL injection
    for (const key of updateKeys) {
      if (!{{ENTITY_NAME}}Store.UPDATABLE_FIELDS.includes(key)) {
        throw new Error(\`Invalid update field: \${key}\`);
      }
    }
    
    const updateFields = updateKeys.map(key => \`\${key} = :\${key}\`);
    
    if (updateFields.length === 0) {
      return existing;
    }
    
    const params = { ...updateData, updated_at: new Date(), id };
    
    const query = \`UPDATE {{TABLE_NAME}} SET \${updateFields.join(', ')}, updated_at = :updated_at WHERE id = :id\`;
    await this.db.query(query, params);
    
    return this.getById(id);
  }

  async upsert(model: Partial<{{ENTITY_NAME}}>): Promise<{{ENTITY_NAME}}> {
    if (model.id) {
      const existing = await this.getById(model.id);
      if (existing) {
        return this.update(model.id, model) as Promise<{{ENTITY_NAME}}>;
      }
    }
    
    return this.insert(model as Omit<{{ENTITY_NAME}}, 'id'>);
  }

  async softDelete(id: number): Promise<boolean> {
    const query = 'UPDATE {{TABLE_NAME}} SET deleted_at = :deleted_at WHERE id = :id AND deleted_at IS NULL';
    const result = await this.db.query(query, { deleted_at: new Date(), id });
    
    return result.success && (result.affectedRows || 0) > 0;
  }

  async count(filters?: Partial<Pick<{{ENTITY_NAME}}Row, {{FILTERABLE_FIELDS}}>>): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM {{TABLE_NAME}} WHERE deleted_at IS NULL';
    let params: Record<string, any> = {};
    
    if (filters && Object.keys(filters).length > 0) {
      const whereConditions = Object.keys(filters).map(key => \`\${key} = :\${key}\`);
      params = { ...filters };
      query += \` AND \${whereConditions.join(' AND ')}\`;
    }
    
    const result = await this.db.query(query, params);
    
    if (!result.success || result.data.length === 0) {
      return 0;
    }
    
    return result.data[0].count;
  }

{{CONVERSION_METHODS}}
}`,

  conversionMethods: `  static rowToModel(row: {{ENTITY_NAME}}Row): {{ENTITY_NAME}} {
    return new {{ENTITY_NAME}}(
      row.id,
{{ROW_TO_MODEL_MAPPING}}
    );
  }

  static modelToRow(model: {{ENTITY_NAME}}): Partial<{{ENTITY_NAME}}Row> {
    return {
      id: model.id,
{{MODEL_TO_ROW_MAPPING}},
      updated_at: new Date()
    };
  }

  private extractDataProperties(obj: any): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Only include properties that are not functions and are in updatable fields
      if (typeof value !== 'function' && {{ENTITY_NAME}}Store.UPDATABLE_FIELDS.includes(key)) {
        result[key] = value;
      }
    }
    
    return result;
  }`
};

export const fileTemplates = {
  storeFile: `import { {{ENTITY_NAME}} } from '../../domain/entities/{{ENTITY_NAME}}';
import { StoreInterface } from '../interfaces/StoreInterface';
import { ProviderMysql, ISqlProvider, MySQLQueryError, MySQLConnectionError } from '@currentjs/provider-mysql';

{{ROW_INTERFACE}}

{{STORE_CLASS}}`,

  storeInterface: `export interface StoreInterface<TModel, TRow> {
  getById(id: number): Promise<TModel | null>;
  getAll(page?: number, limit?: number): Promise<TModel[]>;
  getAllByUserId(userId: number, page?: number, limit?: number): Promise<TModel[]>;
  getBy(filters: Partial<TRow>): Promise<TModel | null>;
  getAllBy(filters: Partial<TRow>): Promise<TModel[]>;
  insert(model: Omit<TModel, 'id'>): Promise<TModel>;
  update(id: number, updates: Partial<Omit<TModel, 'id' | 'createdAt'>>): Promise<TModel | null>;
  upsert(model: Partial<TModel>): Promise<TModel>;
  softDelete(id: number): Promise<boolean>;
  count(filters?: Partial<TRow>): Promise<number>;
}`
};