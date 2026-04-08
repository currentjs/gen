import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { ServiceGenerator } from '../../src/generators/serviceGenerator.js';
import { UseCaseGenerator } from '../../src/generators/useCaseGenerator.js';

const serviceGen = new ServiceGenerator();
const useCaseGen = new UseCaseGenerator();

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

describe('UseCaseGenerator', () => {
  const config = loadFixture('invoice.yaml');
  const result = useCaseGen.generateFromConfig(config);
  const invoiceUseCase = getCode(result as Record<string, unknown>, 'Invoice');

  it('create chains handlers: validateInput -> create -> notifyAccounting', () => {
    expect(invoiceUseCase).toContain('validateInput');
    expect(invoiceUseCase).toContain('invoiceService.create(input)');
    expect(invoiceUseCase).toContain('notifyAccounting');
    expect(invoiceUseCase).toContain('result0');
    expect(invoiceUseCase).toContain('result1');
    expect(invoiceUseCase).toContain('return result;');
  });

  it('getResourceOwner delegated to service', () => {
    expect(invoiceUseCase).toContain('getResourceOwner(id: number)');
    expect(invoiceUseCase).toContain('invoiceService.getResourceOwner(id)');
  });

  it('list always has ownerId? as second param and passes it to service', () => {
    expect(invoiceUseCase).toContain('async list(input: InvoiceListInput, ownerId?: number)');
    expect(invoiceUseCase).toContain('invoiceService.list(input.page || 1, input.limit || 20, ownerId)');
  });

  it('non-paginated list passes ownerId only to service', () => {
    const config = loadFixture('invoice.yaml');
    delete (config.useCases.Invoice.list.input as any).pagination;
    const result = useCaseGen.generateFromConfig(config);
    const code = getCode(result as Record<string, unknown>, 'Invoice');
    expect(code).toContain('async list(input: InvoiceListInput, ownerId?: number)');
    expect(code).toContain('invoiceService.list(ownerId)');
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
