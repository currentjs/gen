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

  it('custom handlers have (result, input) signature and return result', () => {
    expect(invoiceService).toContain('result: any, input: any');
    expect(invoiceService).toContain('return result;');
  });

  it('generates getResourceOwner(id) for aggregate root', () => {
    expect(invoiceService).toContain('getResourceOwner(id: number)');
    expect(invoiceService).toContain('Promise<number | null>');
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
});
