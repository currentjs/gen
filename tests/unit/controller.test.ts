import { describe, it } from '../lib.js';
import { expect } from '../lib.js';
import { loadFixture, getCode } from '../helpers.js';
import { ControllerGenerator } from '../../src/generators/controllerGenerator.js';

const controllerGen = new ControllerGenerator();

describe('ControllerGenerator - API auth scenarios', () => {
  describe('Product (auth: all for list/get, admin for mutations)', () => {
    const config = loadFixture('product.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'ProductApi');

    it('has Get, Post, Put, Delete decorators', () => {
      expect(apiCode).toContain('@Get');
      expect(apiCode).toContain('@Post');
      expect(apiCode).toContain('@Put');
      expect(apiCode).toContain('@Delete');
    });

    it('admin-only mutations check user role', () => {
      expect(apiCode).toContain("'admin'");
    });
  });

  describe('Invoice (auth: authenticated for get/create)', () => {
    const config = loadFixture('invoice.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'InvoiceApi');

    it('get and create require context.request.user when auth is authenticated', () => {
      expect(apiCode).toContain('context.request.user');
      expect(apiCode).toContain('Authentication required');
    });
  });

  describe('Invoice (auth: owner for publish)', () => {
    const config = loadFixture('invoice.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'InvoiceApi');

    it('publish endpoint has pre-mutation owner check via getResourceOwner', () => {
      expect(apiCode).toContain('getResourceOwner');
      expect(apiCode).toContain('isOwner');
      expect(apiCode).toContain('Access denied');
    });
  });

  describe('Product (auth: admin for create/update/delete)', () => {
    const config = loadFixture('product.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'ProductApi');

    it('admin-only endpoints check role', () => {
      expect(apiCode).toContain("'admin'");
      expect(apiCode).toContain('context.request.user');
    });
  });

  describe('Invoice (auth: [owner, admin] for update)', () => {
    const config = loadFixture('invoice.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'InvoiceApi');

    it('update has combined isOwner || hasPrivilegedRole check', () => {
      expect(apiCode).toContain('hasPrivilegedRole');
      expect(apiCode).toContain('isOwner');
      expect(apiCode).toContain("role === 'admin'");
    });
  });
});

describe('ControllerGenerator - structure', () => {
  const invoiceConfig = loadFixture('invoice.yaml');
  const invoiceResult = controllerGen.generateFromConfig(invoiceConfig);
  const invoiceApi = getCode(invoiceResult as Record<string, unknown>, 'InvoiceApi');
  const invoiceWeb = getCode(invoiceResult as Record<string, unknown>, 'InvoiceWeb');

  it('API controller has HTTP decorators and UseCase in constructor', () => {
    expect(invoiceApi).toContain('@Controller');
    expect(invoiceApi).toContain('invoiceUseCase: InvoiceUseCase');
    expect(invoiceApi).toContain('IContext');
  });

  it('Web controller has @Render with view names', () => {
    expect(invoiceWeb).toContain('@Render');
    expect(invoiceWeb).toContain('invoiceList');
    expect(invoiceWeb).toContain('invoiceDetail');
    expect(invoiceWeb).toContain('invoiceCreate');
    expect(invoiceWeb).toContain('invoiceEdit');
  });

  it('Web controller has POST handlers and view rendering', () => {
    expect(invoiceWeb).toContain('Post');
    expect(invoiceWeb).toContain('Render');
  });
});

describe('ControllerGenerator - web layout rendering', () => {
  it('supports module layout: none by generating @Render(view) without second parameter', () => {
    const config = loadFixture('web-layout-none.yaml');
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'IdeaWeb');

    expect(webCode).toContain('@Render("main")');
    expect(webCode).toNotContain('@Render("main",');
  });

  it('supports module layout: empty string by generating @Render(view) without second parameter', () => {
    const config = loadFixture('web-layout-none.yaml');
    config.web!.Idea.layout = '';
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'IdeaWeb');

    expect(webCode).toContain('@Render("main")');
    expect(webCode).toNotContain('@Render("main",');
  });

  it('supports per-page layout override while preserving module layout fallback', () => {
    const config = loadFixture('web-layout-page-override.yaml');
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'IdeaWeb');

    expect(webCode).toContain('@Render("main", "main_view")');
    expect(webCode).toContain('@Render("dashboard", "custom_layout")');
  });

  it('supports per-page layout: none and omits layout only for that page', () => {
    const config = loadFixture('web-layout-page-override.yaml');
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'IdeaWeb');

    expect(webCode).toContain('@Render("plain")');
    expect(webCode).toNotContain('@Render("plain",');
  });
});
