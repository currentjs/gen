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
      expect(apiCode).toContain('UnauthorizedError');
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
      expect(apiCode).toContain('ForbiddenError');
      expect(apiCode).toContain('NotFoundError');
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

describe('ControllerGenerator - handler chain inlining (previously UseCase layer)', () => {
  const config = loadFixture('invoice.yaml');
  const result = controllerGen.generateFromConfig(config);
  const invoiceApi = getCode(result as Record<string, unknown>, 'InvoiceApi');

  it('create action inlines handler chain: validateInput -> create -> notifyAccounting', () => {
    expect(invoiceApi).toContain('invoiceService.validateInput(null, input)');
    expect(invoiceApi).toContain('invoiceService.create(input)');
    expect(invoiceApi).toContain('invoiceService.notifyAccounting(');
    expect(invoiceApi).toContain('result0');
    expect(invoiceApi).toContain('result1');
  });

  it('controller imports InvoiceService not InvoiceUseCase', () => {
    expect(invoiceApi).toContain("import { InvoiceService }");
    expect(invoiceApi).toNotContain("import { InvoiceUseCase }");
  });

  it('list action calls invoiceService.list directly', () => {
    expect(invoiceApi).toContain('invoiceService.list(');
  });

  it('non-paginated list calls service.list without pagination args', () => {
    const cfg = loadFixture('invoice.yaml');
    delete (cfg.useCases.Invoice.list.input as any).pagination;
    const res = controllerGen.generateFromConfig(cfg);
    const code = getCode(res as Record<string, unknown>, 'InvoiceApi');
    expect(code).toNotContain('input.page || 1');
    expect(code).toContain('invoiceService.list(');
  });
});

describe('ControllerGenerator - structure', () => {
  const invoiceConfig = loadFixture('invoice.yaml');
  const invoiceResult = controllerGen.generateFromConfig(invoiceConfig);
  const invoiceApi = getCode(invoiceResult as Record<string, unknown>, 'InvoiceApi');
  const invoiceWeb = getCode(invoiceResult as Record<string, unknown>, 'InvoiceWeb');

  it('API controller has HTTP decorators and Service in constructor', () => {
    expect(invoiceApi).toContain('@Controller');
    expect(invoiceApi).toContain('invoiceService: InvoiceService');
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

describe('ControllerGenerator - list with owner auth passes ownerId', () => {
  it('API list endpoint passes user id as second arg to service when auth includes owner', () => {
    const config = loadFixture('invoice.yaml');
    config.api!.Invoice.endpoints[0].auth = 'owner';
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'InvoiceApi');
    expect(apiCode).toContain('invoiceService.list(input.page || 1, input.limit || 20, context.request.user?.id as number)');
    expect(apiCode).toContain('InvoiceListInput.parse(context.request.parameters)');
  });

  it('API list endpoint calls service.list without ownerId when auth is all', () => {
    const config = loadFixture('invoice.yaml');
    const result = controllerGen.generateFromConfig(config);
    const apiCode = getCode(result as Record<string, unknown>, 'InvoiceApi');
    expect(apiCode).toContain('invoiceService.list(input.page || 1, input.limit || 20)');
    expect(apiCode).toNotContain('invoiceService.list(input.page || 1, input.limit || 20, context.request.user');
  });

  it('Web list page passes user id as second arg to service when auth includes owner', () => {
    const config = loadFixture('invoice.yaml');
    config.web!.Invoice.pages[0].auth = 'owner';
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'InvoiceWeb');
    expect(webCode).toContain('invoiceService.list(input.page || 1, input.limit || 20, context.request.user?.id as number)');
    expect(webCode).toContain('InvoiceListInput.parse(context.request.parameters)');
  });

  it('Web list page calls service.list without ownerId when auth is all', () => {
    const config = loadFixture('invoice.yaml');
    const result = controllerGen.generateFromConfig(config);
    const webCode = getCode(result as Record<string, unknown>, 'InvoiceWeb');
    expect(webCode).toContain('invoiceService.list(input.page || 1, input.limit || 20)');
    expect(webCode).toNotContain('invoiceService.list(input.page || 1, input.limit || 20, context.request.user');
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

describe('ControllerGenerator — identifier types', () => {
  describe('uuid identifiers', () => {
    const gen = new ControllerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'uuid');
    const apiCode = getCode(result as Record<string, unknown>, 'ProductApi');
    const webCode = getCode(result as Record<string, unknown>, 'ProductWeb');

    it('API create action casts user id as string', () => {
      expect(apiCode).toContain('context.request.user?.id as string');
      expect(apiCode).toNotContain('context.request.user?.id as number');
    });

    it('Web create action casts user id as string', () => {
      expect(webCode).toContain('context.request.user?.id as string');
      expect(webCode).toNotContain('context.request.user?.id as number');
    });
  });

  describe('nanoid identifiers', () => {
    const gen = new ControllerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'nanoid');
    const apiCode = getCode(result as Record<string, unknown>, 'ProductApi');

    it('API create action casts user id as string', () => {
      expect(apiCode).toContain('context.request.user?.id as string');
      expect(apiCode).toNotContain('context.request.user?.id as number');
    });
  });

  describe('numeric identifiers (default)', () => {
    const gen = new ControllerGenerator();
    const config = loadFixture('product.yaml');
    const result = gen.generateFromConfig(config, 'numeric');
    const apiCode = getCode(result as Record<string, unknown>, 'ProductApi');

    it('API create action casts user id as number', () => {
      expect(apiCode).toContain('context.request.user?.id as number');
      expect(apiCode).toNotContain('context.request.user?.id as string');
    });
  });
});
