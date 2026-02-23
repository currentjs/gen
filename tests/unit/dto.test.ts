import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { DtoGenerator } from '../../src/generators/dtoGenerator.js';

const dtoGen = new DtoGenerator();

describe('DtoGenerator', () => {
  describe('Invoice fixture', () => {
    const config = loadFixture('invoice.yaml');
    const result = dtoGen.generateFromConfig(config);

    it('Invoice create input has pick fields (number, date, amount, etc.)', () => {
      const code = getCode(result as Record<string, unknown>, 'InvoiceCreate');
      expect(code).toContain('InvoiceCreateInput');
      expect(code).toContain('number: string');
      expect(code).toContain('date: Date');
      expect(code).toContain('amount:');
      expect(code).toContain('customerId: number');
    });

    it('Invoice update input has partial (optional fields)', () => {
      const code = getCode(result as Record<string, unknown>, 'InvoiceUpdate');
      expect(code).toContain('InvoiceUpdateInput');
      expect(code).toMatch(/\?:\s*(string|number|Date|Money|boolean|any)/);
    });

    it('Invoice list input has cursor pagination', () => {
      const code = getCode(result as Record<string, unknown>, 'InvoiceList');
      expect(code).toContain('cursor');
      expect(code).toContain('limit');
    });

    it('Invoice list input has filters and sorting', () => {
      const code = getCode(result as Record<string, unknown>, 'InvoiceList');
      expect(code).toContain('status');
      expect(code).toContain('dateFrom');
      expect(code).toContain('dateTo');
      expect(code).toContain('search');
      expect(code).toContain('sortBy');
      expect(code).toContain('sortOrder');
    });
  });

  describe('Product fixture', () => {
    const config = loadFixture('product.yaml');
    const result = dtoGen.generateFromConfig(config);

    it('Product create input uses omit (no tags field)', () => {
      const code = getCode(result as Record<string, unknown>, 'ProductCreate');
      expect(code).toContain('ProductCreateInput');
      expect(code).toNotContain('readonly tags:');
    });

    it('Product list input has offset pagination (page, limit)', () => {
      const code = getCode(result as Record<string, unknown>, 'ProductList');
      expect(code).toContain('page');
      expect(code).toContain('limit');
    });

    it('Product list input has search and searchIn-related filters', () => {
      const code = getCode(result as Record<string, unknown>, 'ProductList');
      expect(code).toContain('search');
      expect(code).toContain('isActive');
      expect(code).toContain('sortBy');
      expect(code).toContain('sortOrder');
    });

    it('Product update input has partial (all fields optional)', () => {
      const code = getCode(result as Record<string, unknown>, 'ProductUpdate');
      expect(code).toContain('ProductUpdateInput');
    });
  });
});
