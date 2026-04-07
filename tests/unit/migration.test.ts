import assert from 'node:assert';
import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import {
  getTableName,
  generateCreateTableSQL,
  compareSchemas,
  buildChildToParentMap,
  mapYamlTypeToSql,
} from '../../src/utils/migrationUtils.js';
import { AggregateConfig } from '../../src/types/configTypes.js';

describe('migrationUtils', () => {

  describe('getTableName', () => {
    it('returns singular lowercase (no trailing s)', () => {
      assert.strictEqual(getTableName('Post'), 'post');
      assert.strictEqual(getTableName('Category'), 'category');
      assert.strictEqual(getTableName('InvoiceItem'), 'invoiceitem');
    });

    it('matches store generator table name convention (modelName.toLowerCase())', () => {
      const name = 'Product';
      assert.strictEqual(getTableName(name), name.toLowerCase());
    });
  });

  describe('mapYamlTypeToSql', () => {
    const noAggregates = new Set<string>();
    const withVOs = new Set<string>(['Money', 'Address']);

    it('maps string to VARCHAR(255)', () => {
      assert.strictEqual(mapYamlTypeToSql('string', noAggregates), 'VARCHAR(255)');
    });

    it('maps number to INT', () => {
      assert.strictEqual(mapYamlTypeToSql('number', noAggregates), 'INT');
    });

    it('maps boolean to TINYINT(1)', () => {
      assert.strictEqual(mapYamlTypeToSql('boolean', noAggregates), 'TINYINT(1)');
    });

    it('maps datetime to DATETIME', () => {
      assert.strictEqual(mapYamlTypeToSql('datetime', noAggregates), 'DATETIME');
    });

    it('maps json to JSON', () => {
      assert.strictEqual(mapYamlTypeToSql('json', noAggregates), 'JSON');
    });

    it('maps array to JSON', () => {
      assert.strictEqual(mapYamlTypeToSql('array', noAggregates), 'JSON');
    });

    it('maps object to JSON', () => {
      assert.strictEqual(mapYamlTypeToSql('object', noAggregates), 'JSON');
    });

    it('maps known value object types to JSON', () => {
      assert.strictEqual(mapYamlTypeToSql('Money', noAggregates, withVOs), 'JSON');
      assert.strictEqual(mapYamlTypeToSql('Address', noAggregates, withVOs), 'JSON');
    });

    it('maps aggregate reference to INT', () => {
      const aggregates = new Set(['Author', 'Book']);
      assert.strictEqual(mapYamlTypeToSql('Author', aggregates), 'INT');
      assert.strictEqual(mapYamlTypeToSql('Book', aggregates), 'INT');
    });

    it('maps compound array/union VO types to JSON', () => {
      assert.strictEqual(mapYamlTypeToSql('Money[]', noAggregates, withVOs), 'JSON');
      assert.strictEqual(mapYamlTypeToSql('Money | Address', noAggregates, withVOs), 'JSON');
    });
  });

  describe('generateCreateTableSQL — root aggregate', () => {
    const rootAggregate: AggregateConfig = {
      root: true,
      fields: {
        title: { type: 'string', required: true },
        content: { type: 'string', required: false },
        status: { type: 'string', required: true },
      },
    };
    const available = new Set(['Post']);
    const sql = generateCreateTableSQL('Post', rootAggregate, available);

    it('table name is singular lowercase (no trailing s)', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS `post`');
      expect(sql).toNotContain('CREATE TABLE IF NOT EXISTS `posts`');
    });

    it('includes ownerId column for root aggregate', () => {
      expect(sql).toContain('ownerId INT NOT NULL');
    });

    it('includes camelCase createdAt column', () => {
      expect(sql).toContain('createdAt DATETIME');
    });

    it('includes camelCase updatedAt column', () => {
      expect(sql).toContain('updatedAt DATETIME');
    });

    it('includes camelCase deletedAt column', () => {
      expect(sql).toContain('deletedAt DATETIME NULL DEFAULT NULL');
    });

    it('does NOT use snake_case audit column names', () => {
      expect(sql).toNotContain('created_at');
      expect(sql).toNotContain('updated_at');
      expect(sql).toNotContain('deleted_at');
    });

    it('includes indexes for audit columns using camelCase names', () => {
      expect(sql).toContain('idx_post_deletedAt');
      expect(sql).toContain('idx_post_createdAt');
    });
  });

  describe('generateCreateTableSQL — child entity', () => {
    const childAggregate: AggregateConfig = {
      fields: {
        productId: { type: 'id', required: true },
        quantity: { type: 'integer', required: true },
        description: { type: 'string', required: false },
      },
    };
    const available = new Set(['Invoice', 'InvoiceItem']);
    const sql = generateCreateTableSQL('InvoiceItem', childAggregate, available, undefined, 'invoiceId');

    it('table name is singular lowercase', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS `invoiceitem`');
    });

    it('includes parent ID column (invoiceId) instead of ownerId', () => {
      expect(sql).toContain('invoiceId INT NOT NULL');
      expect(sql).toNotContain('ownerId');
    });

    it('includes an index on the parent ID column', () => {
      expect(sql).toContain('idx_invoiceitem_invoiceId');
    });
  });

  describe('generateCreateTableSQL — aggregate FK references', () => {
    const bookAggregate: AggregateConfig = {
      root: true,
      fields: {
        title: { type: 'string', required: true },
        author: { type: 'Author', required: false },
      },
    };
    const available = new Set(['Author', 'Book']);
    const sql = generateCreateTableSQL('Book', bookAggregate, available);

    it('FK column uses camelCase Id suffix (authorId, not author_id)', () => {
      expect(sql).toContain('authorId INT');
      expect(sql).toNotContain('author_id');
    });

    it('FK REFERENCES the singular lowercase table name', () => {
      expect(sql).toContain('REFERENCES author(id)');
      expect(sql).toNotContain('REFERENCES authors(id)');
    });
  });

  describe('generateCreateTableSQL — value object fields with availableValueObjects', () => {
    const aggregate: AggregateConfig = {
      root: true,
      fields: {
        amount: { type: 'Money', required: true },
        tags: { type: 'json', required: false },
        metadata: { type: 'object', required: false },
      },
    };
    const available = new Set(['Invoice']);
    const valueObjects = new Set(['Money']);
    const sql = generateCreateTableSQL('Invoice', aggregate, available, valueObjects);

    it('value object field maps to JSON column (not VARCHAR)', () => {
      expect(sql).toContain('amount JSON NOT NULL');
      expect(sql).toNotContain('amount VARCHAR');
    });

    it('plain json field maps to JSON column', () => {
      expect(sql).toContain('tags JSON NULL DEFAULT NULL');
    });
  });

  describe('buildChildToParentMap', () => {
    const aggregates: Record<string, AggregateConfig> = {
      Invoice: {
        root: true,
        fields: {},
        entities: ['InvoiceItem'],
      },
      InvoiceItem: {
        fields: { quantity: { type: 'integer', required: true } },
      },
    };

    it('maps child entity names to parent entity names', () => {
      const map = buildChildToParentMap(aggregates);
      assert.strictEqual(map.get('InvoiceItem'), 'Invoice');
    });

    it('returns empty map when no entities lists exist', () => {
      const map = buildChildToParentMap({ Post: { root: true, fields: {} } });
      assert.strictEqual(map.size, 0);
    });
  });

  describe('compareSchemas — initial migration', () => {
    const aggregates: Record<string, AggregateConfig> = {
      Post: {
        root: true,
        fields: {
          title: { type: 'string', required: true },
          body: { type: 'string', required: false },
        },
      },
    };

    const statements = compareSchemas(null, aggregates);
    const joined = statements.join('\n');

    it('generates CREATE TABLE for initial migration', () => {
      expect(joined).toContain('CREATE TABLE IF NOT EXISTS `post`');
    });

    it('includes ownerId for root aggregate', () => {
      expect(joined).toContain('ownerId INT NOT NULL');
    });

    it('uses camelCase createdAt in SQL', () => {
      expect(joined).toContain('createdAt DATETIME');
    });

    it('uses camelCase deletedAt in SQL', () => {
      expect(joined).toContain('deletedAt DATETIME NULL DEFAULT NULL');
    });
  });

  describe('compareSchemas — schema diff (add column, new table)', () => {
    const oldAggregates: Record<string, AggregateConfig> = {
      Post: {
        root: true,
        fields: { title: { type: 'string', required: true } },
      },
    };
    const newAggregates: Record<string, AggregateConfig> = {
      Post: {
        root: true,
        fields: {
          title: { type: 'string', required: true },
          subtitle: { type: 'string', required: false },
        },
      },
      Comment: {
        root: true,
        fields: { text: { type: 'string', required: true } },
      },
    };

    const oldState = {
      aggregates: oldAggregates,
      version: '2024-01-01',
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    const statements = compareSchemas(oldState, newAggregates);
    const joined = statements.join('\n');

    it('generates ADD COLUMN for the new field', () => {
      expect(joined).toContain('ADD COLUMN');
      expect(joined).toContain('subtitle');
    });

    it('generates CREATE TABLE for the new aggregate', () => {
      expect(joined).toContain('CREATE TABLE IF NOT EXISTS `comment`');
    });

    it('does not regenerate the existing unchanged table', () => {
      const matches = joined.match(/CREATE TABLE/g) || [];
      assert.strictEqual(matches.length, 1);
    });
  });

  describe('compareSchemas — child entity parent ID column', () => {
    const aggregates: Record<string, AggregateConfig> = {
      Invoice: {
        root: true,
        fields: {},
        entities: ['InvoiceItem'],
      },
      InvoiceItem: {
        fields: { quantity: { type: 'integer', required: true } },
      },
    };

    const statements = compareSchemas(null, aggregates);
    const joined = statements.join('\n');

    it('child entity table uses invoiceId column (derived from parent name)', () => {
      expect(joined).toContain('invoiceId INT NOT NULL');
    });

    it('child entity table does not get an ownerId column', () => {
      const start = joined.indexOf('CREATE TABLE IF NOT EXISTS `invoiceitem`');
      assert.ok(start >= 0, 'invoiceitem table not found');
      const segment = joined.substring(start, start + 800);
      expect(segment).toNotContain('ownerId');
    });
  });

  describe('compareSchemas — value objects passed through to SQL types', () => {
    const aggregates: Record<string, AggregateConfig> = {
      Order: {
        root: true,
        fields: {
          total: { type: 'Money', required: true },
        },
      },
    };
    const valueObjects = new Set(['Money']);
    const statements = compareSchemas(null, aggregates, valueObjects);
    const joined = statements.join('\n');

    it('value object field produces JSON column (not VARCHAR)', () => {
      expect(joined).toContain('total JSON NOT NULL');
      expect(joined).toNotContain('total VARCHAR');
    });
  });

});
