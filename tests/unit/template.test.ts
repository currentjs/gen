import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { TemplateGenerator } from '../../src/generators/templateGenerator.js';

const templateGen = new TemplateGenerator();

describe('TemplateGenerator', () => {
  describe('Invoice templates', () => {
    const config = loadFixture('invoice.yaml');
    const result = templateGen.generateFromConfig(config);

    it('list template has x-for loop directive', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toContain('x-for');
      expect(code).toContain('x-row');
    });

    it('detail template shows entity fields with mustache', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceDetail');
      expect(code).toContain('{{');
      expect(code).toContain('number');
    });

    it('create form has data-strategy and data-redirect for onSuccess', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceCreate');
      expect(code).toContain('<form');
      expect(code).toContain('data-strategy');
      expect(code).toContain('data-redirect');
      expect(code).toContain('/invoice/');
    });

    it('edit form has data-strategy', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceEdit');
      expect(code).toContain('<form');
      expect(code).toContain('data-strategy');
    });
  });

  describe('Product templates', () => {
    const config = loadFixture('product.yaml');
    const result = templateGen.generateFromConfig(config);

    it('list template has x-for', () => {
      const code = getCode(result as Record<string, unknown>, 'productList');
      expect(code).toContain('x-for');
    });

    it('create form has data-strategy with redirect and toast', () => {
      const code = getCode(result as Record<string, unknown>, 'productCreate');
      expect(code).toContain('data-strategy');
      expect(code).toContain('toast');
    });

    it('edit form has data-strategy with toast', () => {
      const code = getCode(result as Record<string, unknown>, 'productEdit');
      expect(code).toContain('data-strategy');
      expect(code).toContain('toast');
    });

    it('boolean field renders as checkbox', () => {
      const code = getCode(result as Record<string, unknown>, 'productCreate');
      expect(code).toContain('checkbox');
      expect(code).toContain('isActive');
    });
  });

  describe('Template directive', () => {
    const invoiceConfig = loadFixture('invoice.yaml');
    const result = templateGen.generateFromConfig(invoiceConfig);
    const listCode = getCode(result as Record<string, unknown>, 'invoiceList');

    it('template has @template name directive', () => {
      expect(listCode).toContain('@template');
      expect(listCode).toContain('invoiceList');
    });
  });
});
