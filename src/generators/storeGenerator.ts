import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { ModuleConfig, AggregateConfig, AggregateFieldConfig, ValueObjectConfig, isValidModuleConfig, IdentifierType, idTsType } from '../types/configTypes';
import { buildChildEntityMap, ChildEntityInfo } from '../utils/childEntityUtils';
import { storeTemplates, storeFileTemplate } from './templates/storeTemplates';
import { capitalize, mapRowType, isAggregateReference, parseFieldType, getReferencedValueObjects } from '../utils/typeUtils';

export class StoreGenerator {
  private availableValueObjects: Map<string, ValueObjectConfig> = new Map();
  private availableAggregates: Set<string> = new Set();
  private identifiers: IdentifierType = 'numeric';

  private isAggregateField(fieldConfig: AggregateFieldConfig): boolean {
    return isAggregateReference(fieldConfig.type, this.availableAggregates);
  }

  private isValueObjectType(fieldType: string): boolean {
    const { baseTypes } = parseFieldType(fieldType);
    return baseTypes.some(bt => this.availableValueObjects.has(capitalize(bt)));
  }

  private isArrayVoType(fieldType: string): boolean {
    const parsed = parseFieldType(fieldType);
    return parsed.isArray && parsed.baseTypes.some(bt => this.availableValueObjects.has(capitalize(bt)));
  }

  private isUnionVoType(fieldType: string): boolean {
    const parsed = parseFieldType(fieldType);
    return parsed.isUnion && parsed.baseTypes.some(bt => this.availableValueObjects.has(capitalize(bt)));
  }

  private getValueObjectName(fieldType: string): string {
    return capitalize(fieldType);
  }

  private getValueObjectConfig(fieldType: string): ValueObjectConfig | undefined {
    return this.availableValueObjects.get(this.getValueObjectName(fieldType));
  }

  /**
   * Sort fields the same way as the domain layer generator:
   * Required fields first, then optional fields.
   * This ensures rowToModel parameter order matches entity constructor.
   */
  private sortFieldsForConstructor(fields: [string, AggregateFieldConfig][]): [string, AggregateFieldConfig][] {
    return [...fields].sort((a, b) => {
      const aRequired = a[1].required !== false && !a[1].auto && !this.isAggregateField(a[1]);
      const bRequired = b[1].required !== false && !b[1].auto && !this.isAggregateField(b[1]);
      if (aRequired === bRequired) return 0;
      return aRequired ? -1 : 1;
    });
  }

  /**
   * Gets the type name for a value object field (for casting).
   * For enum fields, returns the generated type name (e.g., BreedName).
   * For other fields, returns the basic TypeScript type.
   */
  private getValueObjectFieldTypeName(voName: string, voConfig: ValueObjectConfig): string | null {
    const fields = Object.entries(voConfig.fields);
    
    // Look for enum fields - they get generated type names
    for (const [fieldName, fieldConfig] of fields) {
      if (typeof fieldConfig === 'object' && 'values' in fieldConfig) {
        // This is an enum field, return the generated type name
        return `${voName}${capitalize(fieldName)}`;
      }
    }
    
    return null;
  }

  private mapTypeToRowType(yamlType: string): string {
    return mapRowType(yamlType, this.availableValueObjects);
  }

  /** Single line for serializing a value object field to DB (insert/update). */
  private generateValueObjectSerialization(
    fieldName: string,
    voName: string,
    voConfig: ValueObjectConfig
  ): string {
    const voFields = Object.keys(voConfig.fields);
    if (voFields.length > 1) {
      return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
    }
    if (voFields.length === 1) {
      return `      ${fieldName}: entity.${fieldName}?.${voFields[0]}`;
    }
    return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
  }

  /** Serialization for an array-of-VOs field. */
  private generateArrayVoSerialization(fieldName: string): string {
    return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
  }

  /** Serialization for a union-of-VOs field. Uses _type discriminator. */
  private generateUnionVoSerialization(fieldName: string, unionVoNames: string[]): string {
    const checks = unionVoNames
      .map(voName => `entity.${fieldName} instanceof ${voName} ? '${voName}'`)
      .join(' : ');
    const discriminator = `${checks} : 'unknown'`;
    return `      ${fieldName}: entity.${fieldName} ? JSON.stringify({ _type: ${discriminator}, ...entity.${fieldName} }) : undefined`;
  }

  /** Single line for deserializing a value object from row (rowToModel). */
  private generateValueObjectDeserialization(
    fieldName: string,
    voName: string,
    voConfig: ValueObjectConfig
  ): string {
    const voFields = Object.keys(voConfig.fields);
    if (voFields.length > 1) {
      const voArgs = voFields.map(f => `parsed.${f}`).join(', ');
      return `      row.${fieldName} ? (() => { const parsed = this.ensureParsed(row.${fieldName}); return new ${voName}(${voArgs}); })() : undefined`;
    }
    if (voFields.length === 1) {
      const singleFieldType = voConfig.fields[voFields[0]];
      const hasEnumValues = typeof singleFieldType === 'object' && 'values' in singleFieldType;
      if (hasEnumValues) {
        const enumTypeName = this.getValueObjectFieldTypeName(voName, voConfig);
        return `      row.${fieldName} ? new ${voName}(row.${fieldName} as ${enumTypeName}) : undefined`;
      }
      return `      row.${fieldName} ? new ${voName}(row.${fieldName}) : undefined`;
    }
    return `      row.${fieldName} ? new ${voName}(...Object.values(this.ensureParsed(row.${fieldName}))) : undefined`;
  }

  /** Deserialization for an array-of-VOs field. */
  private generateArrayVoDeserialization(
    fieldName: string,
    voName: string,
    voConfig: ValueObjectConfig
  ): string {
    const voFields = Object.keys(voConfig.fields);
    const itemArgs = voFields.length > 0
      ? voFields.map(f => `item.${f}`).join(', ')
      : '...Object.values(item)';
    return `      row.${fieldName} ? (this.ensureParsed(row.${fieldName}) as any[]).map((item: any) => new ${voName}(${itemArgs})) : []`;
  }

  /** Deserialization for a union-of-VOs field. Uses _type discriminator. */
  private generateUnionVoDeserialization(
    fieldName: string,
    unionVoNames: string[],
    unionVoConfigs: Record<string, ValueObjectConfig>
  ): string {
    const cases = unionVoNames.map(voName => {
      const cfg = unionVoConfigs[voName];
      const voFields = cfg ? Object.keys(cfg.fields) : [];
      const args = voFields.length > 0
        ? voFields.map(f => `parsed.${f}`).join(', ')
        : '...Object.values(parsed)';
      return `if (parsed._type === '${voName}') return new ${voName}(${args});`;
    }).join(' ');
    return `      row.${fieldName} ? (() => { const parsed = this.ensureParsed(row.${fieldName}); ${cases} return undefined; })() : undefined`;
  }

  /** Serialization for an array-of-union-VOs field. Each element tagged with _type discriminator. */
  private generateArrayUnionVoSerialization(fieldName: string, unionVoNames: string[]): string {
    const checks = unionVoNames
      .map(voName => `item instanceof ${voName} ? '${voName}'`)
      .join(' : ');
    const discriminator = `${checks} : 'unknown'`;
    return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}.map((item: any) => ({ _type: ${discriminator}, ...item }))) : undefined`;
  }

  /** Deserialization for an array-of-union-VOs field. Each element reconstructed via _type. */
  private generateArrayUnionVoDeserialization(
    fieldName: string,
    unionVoNames: string[],
    unionVoConfigs: Record<string, ValueObjectConfig>
  ): string {
    const cases = unionVoNames.map(voName => {
      const cfg = unionVoConfigs[voName];
      const voFields = cfg ? Object.keys(cfg.fields) : [];
      const args = voFields.length > 0
        ? voFields.map(f => `item.${f}`).join(', ')
        : '...Object.values(item)';
      return `if (item._type === '${voName}') return new ${voName}(${args});`;
    }).join(' ');
    return `      row.${fieldName} ? (this.ensureParsed(row.${fieldName}) as any[]).map((item: any) => { ${cases} return undefined; }) : []`;
  }

  /** Single line for datetime conversion: toDate (row->model) or toMySQL (entity->row). */
  private generateDatetimeConversion(fieldName: string, direction: 'toDate' | 'toMySQL'): string {
    if (direction === 'toDate') {
      return `      row.${fieldName} ? new Date(row.${fieldName}) : undefined`;
    }
    return `      ${fieldName}: entity.${fieldName} ? this.toMySQLDatetime(entity.${fieldName}) : undefined`;
  }

  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  }

  private generateRowFields(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    const idTs = idTsType(this.identifiers);
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`  ${ownerOrParentField}: ${idTs};`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      if (this.isAggregateField(fieldConfig)) {
        result.push(`  ${fieldName}Id?: ${idTs};`);
        return;
      }
      const tsType = this.mapTypeToRowType(fieldConfig.type);
      const isOptional = !fieldConfig.required;
      result.push(`  ${fieldName}${isOptional ? '?' : ''}: ${tsType};`);
    });
    
    return result.join('\n');
  }

  private generateFieldNamesStr(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const isUuid = this.identifiers === 'uuid';
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    const allFields = [
      'id',
      ownerOrParentField,
      ...fields.map(([name, config]) => this.isAggregateField(config) ? `${name}Id` : name)
    ];

    if (!isUuid) {
      return allFields.map(f => `\\\`${f}\\\``).join(', ');
    }

    // For UUID: id-type columns need BIN_TO_UUID wrapping in SELECT
    const idFields = new Set(['id', ownerOrParentField]);
    fields.forEach(([name, config]) => {
      if (this.isAggregateField(config)) idFields.add(`${name}Id`);
    });

    return allFields.map(f => {
      if (idFields.has(f)) return `BIN_TO_UUID(\\\`${f}\\\`, 1) as \\\`${f}\\\``;
      return `\\\`${f}\\\``;
    }).join(', ');
  }

  private generateRowToModelMapping(modelName: string, fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`      row.${ownerOrParentField}`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const fieldType = fieldConfig.type;

      // Handle enum type - cast string to the generated union type
      if (fieldType === 'enum' && fieldConfig.values && fieldConfig.values.length > 0) {
        const enumTypeName = `${modelName}${capitalize(fieldName)}`;
        result.push(`      row.${fieldName} as ${enumTypeName}`);
        return;
      }

      // Handle aggregate reference - create stub from FK
      if (this.isAggregateField(fieldConfig)) {
        result.push(`      row.${fieldName}Id != null ? ({ id: row.${fieldName}Id } as unknown as ${fieldType}) : undefined`);
        return;
      }
      
      // Handle datetime/date conversion
      if (fieldType === 'datetime' || fieldType === 'date') {
        result.push(this.generateDatetimeConversion(fieldName, 'toDate'));
        return;
      }
      
      // Handle boolean conversion
      if (fieldType === 'boolean') {
        result.push(`      Boolean(row.${fieldName})`);
        return;
      }
      
      // Handle value object conversion - deserialize from JSON (simple, array, union, or array-of-union)
      if (this.isValueObjectType(fieldType)) {
        const parsed = parseFieldType(fieldType);

        if (parsed.isArray && parsed.isUnion) {
          const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
          const unionVoConfigs: Record<string, ValueObjectConfig> = {};
          unionVoNames.forEach(name => {
            const cfg = this.availableValueObjects.get(name);
            if (cfg) unionVoConfigs[name] = cfg;
          });
          result.push(this.generateArrayUnionVoDeserialization(fieldName, unionVoNames, unionVoConfigs));
          return;
        }

        if (parsed.isArray) {
          const voName = capitalize(parsed.baseTypes[0]);
          const voConfig = this.availableValueObjects.get(voName);
          result.push(this.generateArrayVoDeserialization(fieldName, voName, voConfig || { fields: {} }));
          return;
        }

        if (parsed.isUnion) {
          const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
          const unionVoConfigs: Record<string, ValueObjectConfig> = {};
          unionVoNames.forEach(name => {
            const cfg = this.availableValueObjects.get(name);
            if (cfg) unionVoConfigs[name] = cfg;
          });
          result.push(this.generateUnionVoDeserialization(fieldName, unionVoNames, unionVoConfigs));
          return;
        }

        const voName = this.getValueObjectName(fieldType);
        const voConfig = this.getValueObjectConfig(fieldType);
        if (voConfig) {
          result.push(this.generateValueObjectDeserialization(fieldName, voName, voConfig));
        } else {
          result.push(`      row.${fieldName} ? new ${voName}(...Object.values(this.ensureParsed(row.${fieldName}))) : undefined`);
        }
        return;
      }
      
      result.push(`      row.${fieldName}`);
    });
    
    return result.join(',\n');
  }

  private generateInsertDataMapping(fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    const result: string[] = [];
    
    const ownerOrParentField = childInfo ? childInfo.parentIdField : 'ownerId';
    result.push(`      ${ownerOrParentField}: entity.${ownerOrParentField}`);
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const fieldType = fieldConfig.type;

      // Handle aggregate reference - extract FK id
      if (this.isAggregateField(fieldConfig)) {
        result.push(`      ${fieldName}Id: entity.${fieldName}?.id`);
        return;
      }
      
      // Handle datetime/date - convert Date to MySQL DATETIME format
      if (fieldType === 'datetime' || fieldType === 'date') {
        result.push(this.generateDatetimeConversion(fieldName, 'toMySQL'));
        return;
      }
      
      // Handle value object - serialize to JSON (simple, array, union, or array-of-union)
      if (this.isValueObjectType(fieldType)) {
        const parsed = parseFieldType(fieldType);

        if (parsed.isArray && parsed.isUnion) {
          const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
          result.push(this.generateArrayUnionVoSerialization(fieldName, unionVoNames));
          return;
        }

        if (parsed.isArray) {
          result.push(this.generateArrayVoSerialization(fieldName));
          return;
        }

        if (parsed.isUnion) {
          const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
          result.push(this.generateUnionVoSerialization(fieldName, unionVoNames));
          return;
        }

        const voConfig = this.getValueObjectConfig(fieldType);
        if (voConfig) {
          result.push(this.generateValueObjectSerialization(fieldName, this.getValueObjectName(fieldType), voConfig));
        } else {
          result.push(`      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`);
        }
        return;
      }
      
      result.push(`      ${fieldName}: entity.${fieldName}`);
    });
    
    return result.join(',\n');
  }

  private generateUpdateDataMapping(fields: [string, AggregateFieldConfig][]): string {
    return fields
      .map(([fieldName, fieldConfig]) => {
        const fieldType = fieldConfig.type;
        if (this.isAggregateField(fieldConfig)) {
          return `      ${fieldName}Id: entity.${fieldName}?.id`;
        }
        if (fieldType === 'datetime' || fieldType === 'date') {
          return this.generateDatetimeConversion(fieldName, 'toMySQL');
        }
        if (this.isValueObjectType(fieldType)) {
          const parsed = parseFieldType(fieldType);

          if (parsed.isArray && parsed.isUnion) {
            const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
            return this.generateArrayUnionVoSerialization(fieldName, unionVoNames);
          }

          if (parsed.isArray) {
            return this.generateArrayVoSerialization(fieldName);
          }

          if (parsed.isUnion) {
            const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(name => this.availableValueObjects.has(name));
            return this.generateUnionVoSerialization(fieldName, unionVoNames);
          }

          const voConfig = this.getValueObjectConfig(fieldType);
          if (voConfig) {
            return this.generateValueObjectSerialization(fieldName, this.getValueObjectName(fieldType), voConfig);
          }
          return `      ${fieldName}: entity.${fieldName} ? JSON.stringify(entity.${fieldName}) : undefined`;
        }
        return `      ${fieldName}: entity.${fieldName}`;
      })
      .join(',\n');
  }

  private generateUpdateFieldsArray(fields: [string, AggregateFieldConfig][]): string {
    return JSON.stringify(fields.map(([name, config]) => this.isAggregateField(config) ? `${name}Id` : name));
  }

  private generateValueObjectImports(fields: [string, AggregateFieldConfig][]): string {
    const imports: string[] = [];

    fields.forEach(([, fieldConfig]) => {
      if (!this.isValueObjectType(fieldConfig.type)) return;

      // Collect all VO names referenced in this field type (handles Foo[], Foo | Bar)
      const referencedVoNames = getReferencedValueObjects(fieldConfig.type, this.availableValueObjects);

      referencedVoNames.forEach(voName => {
        const voConfig = this.availableValueObjects.get(voName);
        const importItems = [voName];

        // Also import enum type alias if present (only for simple single-VO fields)
        if (voConfig && !parseFieldType(fieldConfig.type).isArray && !parseFieldType(fieldConfig.type).isUnion) {
          const enumTypeName = this.getValueObjectFieldTypeName(voName, voConfig);
          if (enumTypeName) importItems.push(enumTypeName);
        }

        imports.push(`import { ${importItems.join(', ')} } from '../../domain/valueObjects/${voName}';`);
      });
    });

    const uniqueImports = [...new Set(imports)];
    if (uniqueImports.length === 0) return '';
    return '\n' + uniqueImports.join('\n');
  }

  private generateAggregateRefImports(modelName: string, fields: [string, AggregateFieldConfig][]): string {
    const imports: string[] = [];

    fields.forEach(([, fieldConfig]) => {
      if (this.isAggregateField(fieldConfig) && fieldConfig.type !== modelName) {
        imports.push(`import { ${fieldConfig.type} } from '../../domain/entities/${fieldConfig.type}';`);
      }
    });

    const uniqueImports = [...new Set(imports)];
    if (uniqueImports.length === 0) return '';
    return '\n' + uniqueImports.join('\n');
  }

  private generateListMethods(modelName: string, fieldNamesStr: string, childInfo?: ChildEntityInfo): string {
    const isRoot = !childInfo;
    const isUuid = this.identifiers === 'uuid';
    const idTs = idTsType(this.identifiers);
    const ownerParam = isRoot ? `, ownerId?: ${idTs}` : '';
    // UUID_TO_BIN(:ownerId, 1) — the ", 1" is a SQL literal inside the query string, not a JS param key
    const ownerFilterExpr = isUuid
      ? `' AND \\\`ownerId\\\` = UUID_TO_BIN(:ownerId, 1)'`
      : `' AND \\\`ownerId\\\` = :ownerId'`;
    const ownerFilter = isRoot
      ? `\n    const ownerFilter = ownerId != null ? ${ownerFilterExpr} : '';`
      : '';
    const ownerFilterRef = isRoot ? '\${ownerFilter}' : '';
    const ownerParamsSetup = isRoot
      ? `\n    if (ownerId != null) params.ownerId = ownerId;`
      : '';

    const getPaginated = `  async getPaginated(page: number = 1, limit: number = 20${ownerParam}): Promise<${modelName}[]> {
    const offset = (page - 1) * limit;${ownerFilter}
    const params: Record<string, any> = { limit: String(limit), offset: String(offset) };${ownerParamsSetup}
    const result = await this.db.query(
      \`SELECT ${fieldNamesStr} FROM \\\`\${this.tableName}\\\` WHERE deletedAt IS NULL${ownerFilterRef} LIMIT :limit OFFSET :offset\`,
      params
    );

    if (result.success && result.data) {
      return result.data.map((row: ${modelName}Row) => this.rowToModel(row));
    }
    return [];
  }`;

    const getAll = `  async getAll(${isRoot ? `ownerId?: ${idTs}` : ''}): Promise<${modelName}[]> {${ownerFilter}
    const params: Record<string, any> = {};${ownerParamsSetup}
    const result = await this.db.query(
      \`SELECT ${fieldNamesStr} FROM \\\`\${this.tableName}\\\` WHERE deletedAt IS NULL${ownerFilterRef}\`,
      params
    );

    if (result.success && result.data) {
      return result.data.map((row: ${modelName}Row) => this.rowToModel(row));
    }
    return [];
  }`;

    const count = `  async count(${isRoot ? `ownerId?: ${idTs}` : ''}): Promise<number> {${ownerFilter}
    const params: Record<string, any> = {};${ownerParamsSetup}
    const result = await this.db.query(
      \`SELECT COUNT(*) as count FROM \\\`\${this.tableName}\\\` WHERE deletedAt IS NULL${ownerFilterRef}\`,
      params
    );

    if (result.success && result.data && result.data.length > 0) {
      return parseInt(result.data[0].count, 10);
    }
    return 0;
  }`;

    return `${getPaginated}\n\n${getAll}\n\n${count}`;
  }

  private generateGetByParentIdMethod(modelName: string, fields: [string, AggregateFieldConfig][], childInfo?: ChildEntityInfo): string {
    if (!childInfo) return '';
    const isUuid = this.identifiers === 'uuid';
    const idTs = idTsType(this.identifiers);
    const parentIdField = childInfo.parentIdField;

    // Build field list for SELECT (reuse the same UUID-aware logic)
    const idFields = new Set(['id', parentIdField]);
    fields.forEach(([name, config]) => {
      if (this.isAggregateField(config)) idFields.add(`${name}Id`);
    });
    const rawFields = ['id', parentIdField, ...fields.map(([name, config]) => this.isAggregateField(config) ? `${name}Id` : name)];
    const bt = '\\`';
    const fieldList = isUuid
      ? rawFields.map(f => idFields.has(f) ? `BIN_TO_UUID(${bt}${f}${bt}, 1) as ${bt}${f}${bt}` : `${bt}${f}${bt}`).join(', ')
      : rawFields.map(f => `${bt}${f}${bt}`).join(', ');

    const whereExpr = isUuid ? `\\\`${parentIdField}\\\` = UUID_TO_BIN(:parentId, 1)` : `\\\`${parentIdField}\\\` = :parentId`;

    return `

  async getByParentId(parentId: ${idTs}): Promise<${modelName}[]> {
    const result = await this.db.query(
      \`SELECT ${fieldList} FROM \\\`\${this.tableName}\\\` WHERE ${whereExpr} AND deletedAt IS NULL\`,
      { parentId }
    );

    if (result.success && result.data) {
      return result.data.map((row: ${modelName}Row) => this.rowToModel(row));
    }
    return [];
  }`;
  }

  private generateGetResourceOwnerMethod(childInfo?: ChildEntityInfo): string {
    const isUuid = this.identifiers === 'uuid';
    const idTs = idTsType(this.identifiers);
    const whereExpr = isUuid ? 'id = UUID_TO_BIN(:id, 1)' : 'id = :id';
    const ownerSelect = isUuid ? 'BIN_TO_UUID(p.ownerId, 1) as ownerId' : 'p.ownerId';
    const ownerSelectSimple = isUuid ? 'BIN_TO_UUID(ownerId, 1) as ownerId' : 'ownerId';

    if (childInfo) {
      const parentTable = childInfo.parentTableName;
      const parentIdField = childInfo.parentIdField;
      const joinExpr = isUuid
        ? `p.id = UUID_TO_BIN(c.\\\`${parentIdField}\\\`, 1)`
        : `p.id = c.\\\`${parentIdField}\\\``;
      const cWhereExpr = isUuid ? 'c.id = UUID_TO_BIN(:id, 1)' : 'c.id = :id';
      return `

  /**
   * Get the owner ID of a resource by its ID (via parent entity).
   * Used for pre-mutation authorization checks.
   */
  async getResourceOwner(id: ${idTs}): Promise<${idTs} | null> {
    const result = await this.db.query(
      \`SELECT ${ownerSelect} FROM \\\`\${this.tableName}\\\` c INNER JOIN \\\`${parentTable}\\\` p ON ${joinExpr} WHERE ${cWhereExpr} AND c.deletedAt IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return result.data[0].ownerId as ${idTs};
    }
    return null;
  }`;
    }
    return `

  /**
   * Get the owner ID of a resource by its ID.
   * Used for pre-mutation authorization checks.
   */
  async getResourceOwner(id: ${idTs}): Promise<${idTs} | null> {
    const result = await this.db.query(
      \`SELECT ${ownerSelectSimple} FROM \\\`\${this.tableName}\\\` WHERE ${whereExpr} AND deletedAt IS NULL\`,
      { id }
    );

    if (result.success && result.data && result.data.length > 0) {
      return result.data[0].ownerId as ${idTs};
    }
    return null;
  }`;
  }

  private generateIdHelpers(): string {
    if (this.identifiers === 'nanoid') {
      return `
  private generateNanoId(size = 21): string {
    const alphabet = "useABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    let id = "";
    const bytes = randomBytes(size);

    for (let i = 0; i < size; i++) {
      // We use a bitwise AND with 63 because 63 is 00111111 in binary.
      // This maps any byte to a value between 0 and 63.
      id += alphabet[bytes[i] & 63];
    }

    return id;
  }
`;
    }
    return '';
  }

  private generateInsertIdVariables(): { preLine: string; dataLine: string; successCond: string; getId: string } {
    switch (this.identifiers) {
      case 'uuid':
        return {
          preLine: '    const newId = randomUUID();',
          dataLine: '      id: newId,\n',
          successCond: '',
          getId: ''
        };
      case 'nanoid':
        return {
          preLine: '    const newId = this.generateNanoId();',
          dataLine: '      id: newId,\n',
          successCond: '',
          getId: ''
        };
      default:
        return {
          preLine: '',
          dataLine: '',
          successCond: ' && result.insertId',
          getId: 'const newId = typeof result.insertId === \'string\' ? parseInt(result.insertId, 10) : result.insertId;'
        };
    }
  }

  private generateWhereIdExpr(): string {
    return this.identifiers === 'uuid' ? 'id = UUID_TO_BIN(:id, 1)' : 'id = :id';
  }

  private generateIdParamExpr(): string {
    // The ", 1" in UUID_TO_BIN(:id, 1) is a literal in the SQL string, NOT a JS params key.
    // The params object always uses just { id }, so this expression is always empty.
    return '';
  }

  private generateRowIdExpr(): string {
    return this.identifiers === 'uuid' ? 'row.id' : 'row.id';
  }

  private generateCryptoImport(): string {
    if (this.identifiers === 'uuid') return `\nimport { randomUUID } from 'crypto';`;
    if (this.identifiers === 'nanoid') return `\nimport { randomBytes } from 'crypto';`;
    return '';
  }

  private generateStore(modelName: string, aggregateConfig: AggregateConfig, childInfo?: ChildEntityInfo): string {
    const tableName = modelName.toLowerCase();
    const fields = Object.entries(aggregateConfig.fields);
    
    // Sort fields for rowToModel to match entity constructor order (required first, optional second)
    const sortedFields = this.sortFieldsForConstructor(fields);

    const fieldNamesStr = this.generateFieldNamesStr(fields, childInfo);
    const idVars = this.generateInsertIdVariables();
    const idTs = idTsType(this.identifiers);

    const variables: Record<string, string> = {
      ENTITY_NAME: modelName,
      TABLE_NAME: tableName,
      ID_TYPE: idTs,
      ROW_FIELDS: this.generateRowFields(fields, childInfo),
      FIELD_NAMES: fieldNamesStr,
      ROW_ID_EXPR: this.generateRowIdExpr(),
      WHERE_ID_EXPR: this.generateWhereIdExpr(),
      ID_PARAM_EXPR: this.generateIdParamExpr(),
      ROW_TO_MODEL_MAPPING: this.generateRowToModelMapping(modelName, sortedFields, childInfo),
      INSERT_ID_PRE_LOGIC: idVars.preLine,
      INSERT_ID_DATA: idVars.dataLine,
      INSERT_DATA_MAPPING: this.generateInsertDataMapping(fields, childInfo),
      INSERT_SUCCESS_COND: idVars.successCond,
      INSERT_GET_ID: idVars.getId,
      UPDATE_DATA_MAPPING: this.generateUpdateDataMapping(fields),
      UPDATE_FIELDS_ARRAY: this.generateUpdateFieldsArray(fields),
      VALUE_OBJECT_IMPORTS: this.generateValueObjectImports(fields),
      AGGREGATE_REF_IMPORTS: this.generateAggregateRefImports(modelName, fields),
      ID_HELPERS: this.generateIdHelpers(),
      LIST_METHODS: this.generateListMethods(modelName, fieldNamesStr, childInfo),
      GET_BY_PARENT_ID_METHOD: this.generateGetByParentIdMethod(modelName, fields, childInfo),
      GET_RESOURCE_OWNER_METHOD: this.generateGetResourceOwnerMethod(childInfo)
    };

    const rowInterface = this.replaceTemplateVars(storeTemplates.rowInterface, variables);
    const storeClass = this.replaceTemplateVars(storeTemplates.storeClass, variables);

    // Build entity import items: entity name + any enum type names
    const entityImportItems = [modelName];
    fields.forEach(([fieldName, fieldConfig]) => {
      if (fieldConfig.type === 'enum' && fieldConfig.values && fieldConfig.values.length > 0) {
        entityImportItems.push(`${modelName}${capitalize(fieldName)}`);
      }
    });

    return this.replaceTemplateVars(storeFileTemplate, {
      ENTITY_NAME: modelName,
      ENTITY_IMPORT_ITEMS: entityImportItems.join(', '),
      ROW_INTERFACE: rowInterface,
      STORE_CLASS: storeClass,
      CRYPTO_IMPORT: this.generateCryptoImport(),
      VALUE_OBJECT_IMPORTS: variables.VALUE_OBJECT_IMPORTS,
      AGGREGATE_REF_IMPORTS: variables.AGGREGATE_REF_IMPORTS
    });
  }

  public generateFromConfig(config: ModuleConfig, identifiers: IdentifierType = 'numeric'): Record<string, string> {
    const result: Record<string, string> = {};
    this.identifiers = identifiers;

    // First, collect all value object names and configs
    this.availableValueObjects.clear();
    if (config.domain.valueObjects) {
      Object.entries(config.domain.valueObjects).forEach(([name, voConfig]) => {
        this.availableValueObjects.set(name, voConfig);
      });
    }

    // Collect all aggregate names for detecting entity references
    this.availableAggregates.clear();
    if (config.domain.aggregates) {
      Object.keys(config.domain.aggregates).forEach(name => {
        this.availableAggregates.add(name);
      });
    }

    // Generate a store for each aggregate
    const childEntityMap = buildChildEntityMap(config);
    if (config.domain.aggregates) {
      Object.entries(config.domain.aggregates).forEach(([modelName, aggregateConfig]) => {
        const childInfo = childEntityMap.get(modelName);
        result[modelName] = this.generateStore(modelName, aggregateConfig, childInfo);
      });
    }

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string, identifiers: IdentifierType = 'numeric'): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain.aggregates structure.');
    }

    return this.generateFromConfig(config, identifiers);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean },
    identifiers: IdentifierType = 'numeric'
  ): Promise<void> {
    const storesByModel = this.generateFromYamlFile(yamlFilePath, identifiers);
    
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
