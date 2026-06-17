import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { ServiceGenerator } from '../../src/generators/serviceGenerator.js';

const serviceGen = new ServiceGenerator();

describe('ServiceGenerator', () => {
  const config = loadFixture('invoice.yaml');
  const result = serviceGen.generateFromConfig(config);
  const invoiceService = getCode(result as Record<string, unknown>, 'Invoice');

  it('generates default handlers: list, get, create, update, delete', () => {
    expect(invoiceService).toContain('async list(');
    expect(invoiceService).toContain('async get(');
    expect(invoiceService).toContain('async create(');
    expect(invoiceService).toContain('async update(');
    expect(invoiceService).toContain('async delete(');
  });

  it('generates custom handler stubs: validateInput, notifyAccounting, loadItems, recalculateTotal, checkCanDelete, validateForPublish, updatePublishStatus', () => {
    expect(invoiceService).toContain('async validateInput(');
    expect(invoiceService).toContain('async notifyAccounting(');
    expect(invoiceService).toContain('async loadItems(');
    expect(invoiceService).toContain('async recalculateTotal(');
    expect(invoiceService).toContain('async checkCanDelete(');
    expect(invoiceService).toContain('async validateForPublish(');
    expect(invoiceService).toContain('async updatePublishStatus(');
  });

  it('custom handlers have typed (result, input) signature and return result', () => {
    expect(invoiceService).toContain('result: Invoice, input: InvoiceGetInput');
    expect(invoiceService).toContain('result: null, input: InvoiceCreateInput');
    expect(invoiceService).toContain('result: Invoice, input: InvoiceUpdateInput');
    expect(invoiceService).toContain('result: null, input: InvoiceDeleteInput');
    expect(invoiceService).toContain('result: Invoice, input: InvoicePublishInput');
    expect(invoiceService).toNotContain('input: any');
    expect(invoiceService).toContain('return result;');
  });

  it('imports DTO types used in method signatures', () => {
    expect(invoiceService).toContain("import { InvoiceCreateInput } from '../dto/InvoiceCreate'");
    expect(invoiceService).toContain("import { InvoiceUpdateInput } from '../dto/InvoiceUpdate'");
    expect(invoiceService).toContain("import { InvoiceGetInput } from '../dto/InvoiceGet'");
    expect(invoiceService).toContain("import { InvoiceDeleteInput } from '../dto/InvoiceDelete'");
    expect(invoiceService).toContain("import { InvoicePublishInput } from '../dto/InvoicePublish'");
  });

  it('create and update handlers use typed input', () => {
    expect(invoiceService).toContain('create(input: InvoiceCreateInput)');
    expect(invoiceService).toContain('update(id: number, input: InvoiceUpdateInput)');
  });

  it('generates getResourceOwner(id) for aggregate root', () => {
    expect(invoiceService).toContain('getResourceOwner(id: number)');
    expect(invoiceService).toContain('Promise<number | null>');
  });

  it('list handler always has ownerId? and calls getPaginated/count with it', () => {
    expect(invoiceService).toContain('async list(page: number = 1, limit: number = 20, ownerId?: number)');
    expect(invoiceService).toContain('.getPaginated(page, limit, ownerId)');
    expect(invoiceService).toContain('.count(ownerId)');
  });
});

describe('ServiceGenerator - non-paginated list', () => {
  it('non-paginated list has ownerId? and calls getAll(ownerId)', () => {
    const config = loadFixture('invoice.yaml');
    delete (config.useCases.Invoice.list.input as any).pagination;
    const result = serviceGen.generateFromConfig(config);
    const code = getCode(result as Record<string, unknown>, 'Invoice');
    expect(code).toContain('async list(ownerId?: number)');
    expect(code).toContain('.getAll(ownerId)');
    expect(code).toNotContain('.getPaginated');
  });
});

describe('Product service (default handlers only)', () => {
  const config = loadFixture('product.yaml');
  const result = serviceGen.generateFromConfig(config);
  const productService = getCode(result as Record<string, unknown>, 'Product');

  it('has only default handlers, no custom stubs', () => {
    expect(productService).toContain('async list(');
    expect(productService).toContain('async get(');
    expect(productService).toContain('async create(');
    expect(productService).toContain('async update(');
    expect(productService).toContain('async delete(');
    expect(productService).toNotContain('async validateInput(');
    expect(productService).toNotContain('async notifyAccounting(');
  });

  it('has getResourceOwner for aggregate root', () => {
    expect(productService).toContain('getResourceOwner(id: number)');
  });

  it('list always has ownerId? and calls getPaginated/count with it', () => {
    expect(productService).toContain('.getPaginated(page, limit, ownerId)');
    expect(productService).toContain('.count(ownerId)');
  });
});

describe('ServiceGenerator - AI module (array and union value objects)', () => {
  const aiServiceGen = new ServiceGenerator();
  const config = loadFixture('ai-module.yaml');
  const result = aiServiceGen.generateFromConfig(config);
  const promptService = getCode(result as Record<string, unknown>, 'Prompt');

  it('create handler passes array VO field directly from input (no wrapping)', () => {
    expect(promptService).toContain('input.actions');
    expect(promptService).toNotContain('{ id: input.actions }');
  });

  it('create handler passes union VO field directly from input (no wrapping)', () => {
    expect(promptService).toContain('input.primaryAction');
    expect(promptService).toNotContain('{ id: input.primaryAction }');
  });

  it('update handler sets array VO field via setter', () => {
    expect(promptService).toContain('setActions(');
    expect(promptService).toContain('input.actions');
  });

  it('update handler sets union VO field via setter', () => {
    expect(promptService).toContain('setPrimaryAction(');
    expect(promptService).toContain('input.primaryAction');
  });

  it('has standard CRUD handlers', () => {
    expect(promptService).toContain('async list(');
    expect(promptService).toContain('async create(');
    expect(promptService).toContain('async update(');
    expect(promptService).toContain('async delete(');
  });
});

describe('ServiceGenerator — identifier types', () => {

  describe('uuid identifiers', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'uuid');
    const code = result['Product'];

    it('get method accepts string id', () => {
      expect(code).toContain('async get(id: string)');
    });

    it('update method accepts string id', () => {
      expect(code).toContain('async update(id: string,');
    });

    it('delete method accepts string id', () => {
      expect(code).toContain('async delete(id: string)');
    });

    it('getResourceOwner accepts and returns string', () => {
      expect(code).toContain('async getResourceOwner(id: string): Promise<string | null>');
    });

    it('create uses empty string placeholder', () => {
      expect(code).toContain("new Product('',");
      expect(code).toNotContain('new Product(0,');
    });
  });

  describe('nanoid identifiers', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'nanoid');
    const code = result['Product'];

    it('get method accepts string id', () => {
      expect(code).toContain('async get(id: string)');
    });

    it('getResourceOwner accepts and returns string', () => {
      expect(code).toContain('async getResourceOwner(id: string): Promise<string | null>');
    });

    it('create uses empty string placeholder', () => {
      expect(code).toContain("new Product('',");
    });
  });

  describe('numeric identifiers (default)', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'numeric');
    const code = result['Product'];

    it('get method accepts number id', () => {
      expect(code).toContain('async get(id: number)');
    });

    it('getResourceOwner accepts and returns number', () => {
      expect(code).toContain('async getResourceOwner(id: number): Promise<number | null>');
    });

    it('create uses 0 placeholder', () => {
      expect(code).toContain('new Product(0,');
    });
  });
});

describe('ServiceGenerator — pseudo-models (cross-module dependencies)', () => {
  it('skips service generation for models that are dependency keys with no local aggregate', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('dashboard-consumer.yaml');
    const result = gen.generateFromConfig(config);
    // Dashboard has a local aggregate → service generated
    expect(Object.keys(result).join(',')).toContain('Dashboard');
    // Quiz is a pseudo-model (dependency, no aggregate) → no service
    expect(Object.keys(result).join(',')).toNotContain('Quiz');
  });

  it('generates normal service for the real local model alongside pseudo-models', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('dashboard-consumer.yaml');
    const result = gen.generateFromConfig(config);
    const dashboardService = result['Dashboard'] ?? '';
    expect(dashboardService).toContain('class DashboardService');
    expect(dashboardService).toContain('async get(');
  });
});

describe('ServiceGenerator — imported query handlers excluded from service', () => {
  it('does not generate a service method for handlers that are imported queries', () => {
    const gen = new ServiceGenerator();
    const config = loadFixture('dashboard-consumer.yaml');
    // Add a mixed handler chain to Dashboard: default:get + imported query
    config.useCases!.Dashboard!.get.handlers = ['default:get', 'getQuizStats'] as any;
    const result = gen.generateFromConfig(config);
    const dashboardService = result['Dashboard'] ?? '';
    // getQuizStats is an imported query — should NOT appear as a service method stub
    expect(dashboardService).toNotContain('async getQuizStats(');
    // default:get should still produce the get method
    expect(dashboardService).toContain('async get(');
  });
});
