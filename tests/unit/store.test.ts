import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { StoreGenerator } from '../../src/generators/storeGenerator.js';

const storeGen = new StoreGenerator();

describe('StoreGenerator', () => {
  describe('Invoice store (value objects, datetime, json, getResourceOwner)', () => {
    const config = loadFixture('invoice.yaml');
    const result = storeGen.generateFromConfig(config);
    const invoiceStore = getCode(result as Record<string, unknown>, 'Invoice');

    it('rowToModel converts datetime with new Date(row.x)', () => {
      expect(invoiceStore).toContain('new Date(row.');
      expect(invoiceStore).toContain('row.date');
    });

    it('value object Money is deserialized in rowToModel', () => {
      expect(invoiceStore).toContain('Money');
      expect(invoiceStore).toContain('JSON.parse');
    });

    it('json fields use JSON.parse / JSON.stringify', () => {
      expect(invoiceStore).toContain('JSON.parse');
      expect(invoiceStore).toContain('metadata');
    });

    it('getResourceOwner(id) fetches owner for aggregate root', () => {
      expect(invoiceStore).toContain('getResourceOwner(id: number)');
      expect(invoiceStore).toContain('ownerId');
      expect(invoiceStore).toContain('Promise<number | null>');
    });

    it('Row interface includes created_at, updated_at, deleted_at', () => {
      expect(invoiceStore).toContain('InvoiceRow');
      expect(invoiceStore).toContain('deleted_at');
      expect(invoiceStore).toContain('created_at');
    });

    it('softDelete uses deleted_at', () => {
      expect(invoiceStore).toContain('softDelete');
      expect(invoiceStore).toContain('deleted_at');
    });

    it('generates getPaginated with optional ownerId for root entity', () => {
      expect(invoiceStore).toContain('async getPaginated(page: number = 1, limit: number = 20, ownerId?: number)');
      expect(invoiceStore).toContain('LIMIT :limit OFFSET :offset');
    });

    it('generates getAll with optional ownerId for root entity (no pagination)', () => {
      expect(invoiceStore).toContain('async getAll(ownerId?: number): Promise<Invoice[]>');
      expect(invoiceStore).toNotContain('getAll(page:');
    });

    it('generates count with optional ownerId for root entity', () => {
      expect(invoiceStore).toContain('async count(ownerId?: number): Promise<number>');
    });

    it('getPaginated and getAll filter by ownerId when provided', () => {
      expect(invoiceStore).toContain("ownerId != null ? ' AND");
      expect(invoiceStore).toContain('params.ownerId = ownerId');
    });
  });

  describe('Product store (json field tags)', () => {
    const config = loadFixture('product.yaml');
    const result = storeGen.generateFromConfig(config);
    const productStore = getCode(result as Record<string, unknown>, 'Product');

    it('has rowToModel and Row interface', () => {
      expect(productStore).toContain('ProductRow');
      expect(productStore).toContain('rowToModel');
    });

    it('getResourceOwner present for aggregate root', () => {
      expect(productStore).toContain('getResourceOwner');
    });

    it('generates getPaginated and getAll with ownerId? for root entity', () => {
      expect(productStore).toContain('async getPaginated(page: number = 1, limit: number = 20, ownerId?: number)');
      expect(productStore).toContain('async getAll(ownerId?: number): Promise<Product[]>');
      expect(productStore).toContain('async count(ownerId?: number): Promise<number>');
    });
  });

  describe('AI module store (array and union value objects)', () => {
    const aiStoreGen = new StoreGenerator();
    const config = loadFixture('ai-module.yaml');
    const result = aiStoreGen.generateFromConfig(config);
    const promptStore = getCode(result as Record<string, unknown>, 'Prompt');

    it('Row interface has string type for array VO field', () => {
      expect(promptStore).toContain('PromptRow');
      expect(promptStore).toMatch(/actions\??: string/);
    });

    it('Row interface has string type for union VO field', () => {
      expect(promptStore).toMatch(/primaryAction\??: string/);
    });

    it('array VO field is deserialized with JSON.parse and .map()', () => {
      expect(promptStore).toContain('JSON.parse(row.actions)');
      expect(promptStore).toContain('.map(');
      expect(promptStore).toContain('new LlmAction(');
    });

    it('array VO field is serialized with JSON.stringify in insert', () => {
      expect(promptStore).toContain('JSON.stringify(entity.actions)');
    });

    it('union VO field is deserialized using _type discriminator', () => {
      expect(promptStore).toContain('JSON.parse(row.primaryAction)');
      expect(promptStore).toContain("parsed._type === 'LlmAction'");
      expect(promptStore).toContain("parsed._type === 'ApiAction'");
    });

    it('union VO field serialization includes _type discriminator', () => {
      expect(promptStore).toContain('_type');
      expect(promptStore).toContain('instanceof LlmAction');
    });

    it('imports LlmAction and ApiAction value objects', () => {
      expect(promptStore).toContain("from '../../domain/valueObjects/LlmAction'");
      expect(promptStore).toContain("from '../../domain/valueObjects/ApiAction'");
    });

    it('Row interface has string type for array-of-union VO field', () => {
      expect(promptStore).toMatch(/steps\??: string/);
    });

    it('array-of-union VO field is serialized with _type discriminator and JSON.stringify over mapped array', () => {
      expect(promptStore).toContain('JSON.stringify(entity.steps.map(');
      expect(promptStore).toContain('_type');
      expect(promptStore).toContain('instanceof LlmAction');
      expect(promptStore).toContain('instanceof ApiAction');
    });

    it('array-of-union VO field is deserialized with JSON.parse, .map(), and _type switch', () => {
      expect(promptStore).toContain('JSON.parse(row.steps)');
      expect(promptStore).toContain('.map((item: any)');
      expect(promptStore).toContain("item._type === 'LlmAction'");
      expect(promptStore).toContain("item._type === 'ApiAction'");
    });
  });

});
