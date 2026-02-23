import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { DomainLayerGenerator } from '../../src/generators/domainLayerGenerator.js';

const domainGen = new DomainLayerGenerator();

describe('DomainLayerGenerator', () => {
  describe('Invoice fixture', () => {
    const config = loadFixture('invoice.yaml');
    const result = domainGen.generateFromConfig(config);

    it('generates Invoice entity with typed fields', () => {
      const code = getCode(result as Record<string, unknown>, 'Invoice');
      expect(code).toContain('number: string');
      expect(code).toContain('date: Date');
      expect(code).toContain('amount: Money');
      expect(code).toContain('isPublished: boolean');
      expect(code).toContain('metadata: any');
      expect(code).toContain('customerId: number');
    });

    it('generates InvoiceItem child entity with productId, quantity, price', () => {
      const code = getCode(result as Record<string, unknown>, 'InvoiceItem');
      expect(code).toContain('productId: number');
      expect(code).toContain('quantity: number');
      expect(code).toContain('price: Money');
    });

    it('generates Money value object with amount and currency', () => {
      const code = getCode(result as Record<string, unknown>, 'Money');
      expect(code).toContain('amount: number');
      expect(code).toMatch(/currency.*USD.*EUR.*PLN|MoneyCurrency/);
    });

    it('Invoice entity imports Money value object', () => {
      const code = getCode(result as Record<string, unknown>, 'Invoice');
      expect(code).toContain("from '../valueObjects/Money'");
    });

    it('optional fields have ? in constructor', () => {
      const code = getCode(result as Record<string, unknown>, 'Invoice');
      expect(code).toContain('dueDate?');
      expect(code).toContain('metadata?');
      expect(code).toContain('notes?');
    });
  });

  describe('Product fixture', () => {
    const config = loadFixture('product.yaml');
    const result = domainGen.generateFromConfig(config);

    it('generates Product entity with isActive, stock, tags', () => {
      const code = getCode(result as Record<string, unknown>, 'Product');
      expect(code).toContain('isActive: boolean');
      expect(code).toContain('stock: number');
      expect(code).toContain('tags: any');
    });

    it('Product entity imports Money value object', () => {
      const code = getCode(result as Record<string, unknown>, 'Product');
      expect(code).toContain("from '../valueObjects/Money'");
    });

    it('optional fields category and tags have ?', () => {
      const code = getCode(result as Record<string, unknown>, 'Product');
      expect(code).toContain('category?');
      expect(code).toContain('tags?');
    });
  });
});
