import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { TemplateGenerator } from '../../src/generators/templateGenerator.js';

const templateGen = new TemplateGenerator();

describe('TemplateGenerator', () => {
  describe('Invoice templates (Bootstrap, default)', () => {
    const config = loadFixture('invoice.yaml');
    const result = templateGen.generateFromConfig(config, 'bootstrap');

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

  describe('Product templates (Bootstrap, default)', () => {
    const config = loadFixture('product.yaml');
    const result = templateGen.generateFromConfig(config, 'bootstrap');

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
    const result = templateGen.generateFromConfig(invoiceConfig, 'bootstrap');
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

  describe('Bootstrap styling — explicit class assertions', () => {
    const config = loadFixture('invoice.yaml');
    const result = templateGen.generateFromConfig(config, 'bootstrap');

    it('list template uses Bootstrap table classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toContain('table table-striped');
      expect(code).toContain('btn btn-primary');
      expect(code).toContain('btn btn-sm btn-info');
      expect(code).toContain('btn btn-sm btn-warning');
      expect(code).toContain('container mt-4');
    });

    it('list template does not contain Tailwind utility classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toNotContain('bg-blue-600');
      expect(code).toNotContain('max-w-7xl');
      expect(code).toNotContain('w-full border-collapse');
    });

    it('create form uses Bootstrap form classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceCreate');
      expect(code).toContain('form-control');
      expect(code).toContain('form-label');
      expect(code).toContain('d-flex gap-2');
    });

    it('detail template uses Bootstrap card and grid classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceDetail');
      expect(code).toContain('card');
      expect(code).toContain('card-body');
      expect(code).toContain('row mb-2');
      expect(code).toContain('col-4');
      expect(code).toContain('col-8');
    });
  });

  describe('Tailwind styling', () => {
    const config = loadFixture('invoice.yaml');
    const result = templateGen.generateFromConfig(config, 'tailwind');

    it('list template uses Tailwind classes for container and table', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toContain('max-w-7xl');
      expect(code).toContain('w-full border-collapse');
      expect(code).toContain('bg-blue-600');
      expect(code).toContain('bg-cyan-500');
      expect(code).toContain('bg-yellow-500');
    });

    it('list template does not contain Bootstrap table or button classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toNotContain('table table-striped');
      expect(code).toNotContain('btn btn-primary');
      expect(code).toNotContain('btn btn-sm btn-info');
      expect(code).toNotContain('container mt-4');
    });

    it('list template still has x-for and x-row directives', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toContain('x-for');
      expect(code).toContain('x-row');
    });

    it('detail template uses Tailwind card classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceDetail');
      expect(code).toContain('border border-gray-200 rounded-lg shadow-sm');
      expect(code).toContain('p-6');
      expect(code).toContain('grid grid-cols-12');
      expect(code).toContain('col-span-4');
      expect(code).toContain('col-span-8');
    });

    it('detail template does not contain Bootstrap card or grid classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceDetail');
      expect(code).toNotContain('card-body');
      expect(code).toNotContain('row mb-2');
      expect(code).toNotContain('col-4');
    });

    it('create form uses Tailwind input classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceCreate');
      expect(code).toContain('w-full border border-gray-300 rounded');
      expect(code).toContain('block text-sm font-medium text-gray-700 mb-1');
      expect(code).toContain('flex gap-2');
    });

    it('create form does not contain Bootstrap form classes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceCreate');
      expect(code).toNotContain('form-control');
      expect(code).toNotContain('form-label');
      expect(code).toNotContain('d-flex gap-2');
    });

    it('create form still has data-strategy and data-redirect attributes', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceCreate');
      expect(code).toContain('<form');
      expect(code).toContain('data-strategy');
      expect(code).toContain('data-redirect');
    });

    it('edit form uses Tailwind classes and has data-strategy', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceEdit');
      expect(code).toContain('<form');
      expect(code).toContain('data-strategy');
      expect(code).toContain('w-full border border-gray-300 rounded');
    });

    it('template still has @template name directive', () => {
      const code = getCode(result as Record<string, unknown>, 'invoiceList');
      expect(code).toContain('@template');
      expect(code).toContain('invoiceList');
    });
  });

  describe('Tailwind styling — Product (boolean fields and form strategies)', () => {
    const config = loadFixture('product.yaml');
    const result = templateGen.generateFromConfig(config, 'tailwind');

    it('list template uses Tailwind classes', () => {
      const code = getCode(result as Record<string, unknown>, 'productList');
      expect(code).toContain('x-for');
      expect(code).toContain('bg-blue-600');
      expect(code).toNotContain('btn btn-primary');
    });

    it('create form has data-strategy with toast', () => {
      const code = getCode(result as Record<string, unknown>, 'productCreate');
      expect(code).toContain('data-strategy');
      expect(code).toContain('toast');
    });

    it('boolean field renders as checkbox with Tailwind classes', () => {
      const code = getCode(result as Record<string, unknown>, 'productCreate');
      expect(code).toContain('type="checkbox"');
      expect(code).toContain('isActive');
      expect(code).toContain('h-4 w-4');
      expect(code).toNotContain('form-check-input');
    });
  });

  describe('Tailwind styling — AI module (array and union VOs)', () => {
    const aiTemplateGen = new TemplateGenerator();
    const config = loadFixture('ai-module.yaml');
    const result = aiTemplateGen.generateFromConfig(config, 'tailwind');

    it('multi-field array VO uses Tailwind bordered group', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('actions');
      expect(code).toContain('border border-gray-200 rounded p-2');
      expect(code).toContain('actions[0].model');
      expect(code).toNotContain('border rounded p-2');
    });

    it('single-enum array VO renders as checkboxes with Tailwind classes', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('type="checkbox"');
      expect(code).toContain('tags[]');
      expect(code).toContain('inline-flex items-center gap-1');
      expect(code).toNotContain('form-check form-check-inline');
    });

    it('union VO field still has type selector', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('primaryAction');
      expect(code).toContain('LlmAction');
      expect(code).toContain('ApiAction');
    });

    it('data-field-types json for array VO fields still correct', () => {
      const code = getCode(result as Record<string, unknown>, 'promptCreate');
      expect(code).toContain('"actions":"json"');
      expect(code).toContain('"tags":"json"');
    });
  });
});
