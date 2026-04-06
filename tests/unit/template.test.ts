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

  describe('AI module templates (array and union value objects)', () => {
    const aiTemplateGen = new TemplateGenerator();
    const config = loadFixture('ai-module.yaml');
    const result = aiTemplateGen.generateFromConfig(config);

    it('create form renders multi-field array VO (LlmAction[]) as a group with sub-inputs', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('actions');
      // Multi-field VO array uses a bordered group
      expect(code).toContain('border rounded p-2');
      expect(code).toContain('actions[0].model');
    });

    it('create form renders single-enum array VO (Tag[]) as checkboxes', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('type="checkbox"');
      expect(code).toContain('tags[]');
    });

    it('create form renders union VO field with type selector', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('primaryAction');
      expect(code).toContain('LlmAction');
      expect(code).toContain('ApiAction');
    });

    it('create form has data-field-types with json for array VO fields', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('"actions":"json"');
      expect(code).toContain('"tags":"json"');
    });

    it('create form has data-field-types with json for union VO field', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('"primaryAction":"json"');
    });

    it('edit form renders single-enum array VO (Tag[]) as checkboxes', () => {
      const code = getCode(result as Record<string, unknown>, 'promptEdit');
      expect(code).toContain('type="checkbox"');
      expect(code).toContain('tags[]');
    });

    it('edit form renders multi-field array VO (LlmAction[]) as a group', () => {
      const code = getCode(result as Record<string, unknown>, 'promptEdit');
      expect(code).toContain('border rounded p-2');
      expect(code).toContain('actions[0].model');
    });

    it('list template has x-for and renders prompt items', () => {
      const code = getCode(result as Record<string, unknown>, 'promptList');
      expect(code).toContain('x-for');
      expect(code).toContain('title');
    });

    it('create form renders array-of-union VO field as a repeatable group with type selector', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('steps');
      expect(code).toContain('steps[0]._type');
      expect(code).toContain('LlmAction');
      expect(code).toContain('ApiAction');
    });

    it('create form array-of-union field uses bordered group container', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('steps-container');
    });

    it('create form has data-field-types with json for array-of-union VO field', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('"steps":"json"');
    });

    it('edit form renders array-of-union VO field with type selector', () => {
      const code = getCode(result as Record<string, unknown>, 'promptEdit');
      expect(code).toContain('steps[0]._type');
    });
  });
});
