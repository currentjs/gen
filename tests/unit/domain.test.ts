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

  describe('AI module fixture (array and union value objects)', () => {
    const aiGen = new DomainLayerGenerator();
    const config = loadFixture('ai-module.yaml');
    const result = aiGen.generateFromConfig(config);

    it('generates Prompt entity with array VO field typed as LlmAction[]', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain('actions?: LlmAction[]');
    });

    it('generates Prompt entity with union VO field typed as LlmAction | ApiAction', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain('primaryAction?: LlmAction | ApiAction');
    });

    it('generates Prompt entity with single VO field typed as PromptConfig', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain('config?: PromptConfig');
    });

    it('Prompt entity imports LlmAction value object', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain("from '../valueObjects/LlmAction'");
    });

    it('Prompt entity imports ApiAction value object', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain("from '../valueObjects/ApiAction'");
    });

    it('Prompt entity imports PromptConfig value object', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain("from '../valueObjects/PromptConfig'");
    });

    it('generates LlmAction value object with correct fields', () => {
      const code = getCode(result as Record<string, unknown>, 'LlmAction');
      expect(code).toContain('model: string');
      expect(code).toContain('temperature: number');
    });

    it('generates ApiAction value object with enum method field', () => {
      const code = getCode(result as Record<string, unknown>, 'ApiAction');
      expect(code).toContain('url: string');
      expect(code).toMatch(/GET.*POST.*PUT.*DELETE|ApiActionMethod/);
    });

    it('generates Prompt entity with array-of-union VO field typed as (LlmAction | ApiAction)[]', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain('steps?: (LlmAction | ApiAction)[]');
    });

    it('Prompt entity imports both LlmAction and ApiAction for the array-of-union field', () => {
      const code = getCode(result as Record<string, unknown>, 'Prompt');
      expect(code).toContain("from '../valueObjects/LlmAction'");
      expect(code).toContain("from '../valueObjects/ApiAction'");
    });
  });
});

describe('DomainLayerGenerator — identifier types', () => {
  describe('uuid identifiers', () => {
    const gen = new DomainLayerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'uuid');
    const code = getCode(result as Record<string, unknown>, 'Product');

    it('entity has id: string instead of id: number', () => {
      expect(code).toContain('public id: string');
      expect(code).toNotContain('public id: number');
    });

    it('entity has ownerId: string instead of ownerId: number', () => {
      expect(code).toContain('public ownerId: string');
      expect(code).toNotContain('public ownerId: number');
    });
  });

  describe('nanoid identifiers', () => {
    const gen = new DomainLayerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'nanoid');
    const code = getCode(result as Record<string, unknown>, 'Product');

    it('entity has id: string for nanoid', () => {
      expect(code).toContain('public id: string');
      expect(code).toNotContain('public id: number');
    });

    it('entity has ownerId: string for nanoid', () => {
      expect(code).toContain('public ownerId: string');
      expect(code).toNotContain('public ownerId: number');
    });
  });

  describe('numeric identifiers (default)', () => {
    const gen = new DomainLayerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'numeric');
    const code = getCode(result as Record<string, unknown>, 'Product');

    it('entity retains id: number for numeric', () => {
      expect(code).toContain('public id: number');
    });

    it('entity retains ownerId: number for numeric', () => {
      expect(code).toContain('public ownerId: number');
    });
  });
});
