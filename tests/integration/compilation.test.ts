import assert from 'node:assert';
import { describe, it, after } from '../lib.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'node:child_process';
import { handleInit } from '../../src/commands/init.js';
import { handleGenerateAll } from '../../src/commands/generateAll.js';

const GEN_ROOT = path.join(process.cwd(), 'tests', 'fixtures');
const FIXTURES = {
  invoice: path.join(GEN_ROOT, 'invoice.yaml'),
  product: path.join(GEN_ROOT, 'product.yaml'),
};

describe('Integration: full app generation and compilation', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currentjs-test-'));
  const originalCwd = process.cwd();

  after(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('scaffolds app, generates modules, and compiles successfully', async () => {
    // 1. Init app (runs npm install in tempDir)
    handleInit(tempDir);

    // 2. Create module directories and copy fixtures
    const invoiceModuleDir = path.join(tempDir, 'src', 'modules', 'Invoice');
    const productModuleDir = path.join(tempDir, 'src', 'modules', 'Product');
    fs.mkdirSync(invoiceModuleDir, { recursive: true });
    fs.mkdirSync(productModuleDir, { recursive: true });
    fs.copyFileSync(FIXTURES.invoice, path.join(invoiceModuleDir, 'invoice.yaml'));
    fs.copyFileSync(FIXTURES.product, path.join(productModuleDir, 'product.yaml'));

    // 3. Update app.yaml to list both modules (new format: object with path per module)
    const appYamlPath = path.join(tempDir, 'app.yaml');
    const appYaml = fs.readFileSync(appYamlPath, 'utf8');
    const appConfig = appYaml.replace(
      'modules: {}',
      `modules:
  Invoice:
    path: src/modules/Invoice/invoice.yaml
  Product:
    path: src/modules/Product/product.yaml`
    );
    fs.writeFileSync(appYamlPath, appConfig, 'utf8');

    // 4. chdir into temp app so generateAll and registry use it
    process.chdir(tempDir);

    // 5. Generate all code (runs npm run build at the end)
    await handleGenerateAll('app.yaml', undefined, undefined, { force: true });

    // 6. Assert expected generated files exist
    const src = path.join(tempDir, 'src');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Invoice', 'domain', 'entities', 'Invoice.ts')), 'Invoice entity');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Invoice', 'domain', 'entities', 'InvoiceItem.ts')), 'InvoiceItem entity');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Invoice', 'domain', 'valueObjects', 'Money.ts')), 'Money value object');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Invoice', 'infrastructure', 'stores', 'InvoiceStore.ts')), 'InvoiceStore');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Invoice', 'infrastructure', 'controllers', 'InvoiceApiController.ts')), 'InvoiceApiController');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Product', 'domain', 'entities', 'Product.ts')), 'Product entity');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Product', 'infrastructure', 'stores', 'ProductStore.ts')), 'ProductStore');

    // 7. Verify build succeeds (throws if build fails)
    execSync('npm run build', { cwd: tempDir, stdio: 'pipe' });
  });

  it('init writes all 4 layout template files', () => {
    const templatesDir = path.join(tempDir, 'src', 'common', 'ui', 'templates');
    assert.ok(fs.existsSync(path.join(templatesDir, 'main_view_bootstrap.html')), 'main_view_bootstrap.html exists');
    assert.ok(fs.existsSync(path.join(templatesDir, 'main_view_tailwind.html')), 'main_view_tailwind.html exists');
    assert.ok(fs.existsSync(path.join(templatesDir, 'error_bootstrap.html')), 'error_bootstrap.html exists');
    assert.ok(fs.existsSync(path.join(templatesDir, 'error_tailwind.html')), 'error_tailwind.html exists');
  });

  it('default bootstrap styling: bootstrap template has canonical name, tailwind has suffixed name', () => {
    const templatesDir = path.join(tempDir, 'src', 'common', 'ui', 'templates');
    const bsMain = fs.readFileSync(path.join(templatesDir, 'main_view_bootstrap.html'), 'utf8');
    const twMain = fs.readFileSync(path.join(templatesDir, 'main_view_tailwind.html'), 'utf8');
    const bsError = fs.readFileSync(path.join(templatesDir, 'error_bootstrap.html'), 'utf8');
    const twError = fs.readFileSync(path.join(templatesDir, 'error_tailwind.html'), 'utf8');

    assert.ok(bsMain.includes('@template name="main_view"'), 'bootstrap main_view has canonical name');
    assert.ok(twMain.includes('@template name="main_view_tailwind"'), 'tailwind main_view has suffixed name');
    assert.ok(bsError.includes('@template name="error"'), 'bootstrap error has canonical name');
    assert.ok(twError.includes('@template name="error_tailwind"'), 'tailwind error has suffixed name');
  });

  it('generates Tailwind templates when config.styling is tailwind', async () => {
    const twDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currentjs-tailwind-test-'));
    const savedCwd = process.cwd();

    try {
      // 1. Init app
      handleInit(twDir);

      // 2. Set styling: tailwind in app.yaml
      const appYamlPath = path.join(twDir, 'app.yaml');
      const appYaml = fs.readFileSync(appYamlPath, 'utf8');
      const updatedYaml = appYaml
        .replace('styling: bootstrap', 'styling: tailwind')
        .replace(
          'modules: {}',
          `modules:
  Invoice:
    path: src/modules/Invoice/invoice.yaml`
        );
      fs.writeFileSync(appYamlPath, updatedYaml, 'utf8');

      // 3. Create Invoice module and copy fixture
      const invoiceModuleDir = path.join(twDir, 'src', 'modules', 'Invoice');
      fs.mkdirSync(invoiceModuleDir, { recursive: true });
      fs.copyFileSync(FIXTURES.invoice, path.join(invoiceModuleDir, 'invoice.yaml'));

      // 4. chdir and generate
      process.chdir(twDir);
      await handleGenerateAll('app.yaml', undefined, undefined, { force: true });

      // 5. Assert generated module HTML views use Tailwind classes, not Bootstrap
      const listView = fs.readFileSync(
        path.join(twDir, 'src', 'modules', 'Invoice', 'views', 'invoiceList.html'),
        'utf8'
      );
      assert.ok(listView.includes('max-w-7xl'), 'list view should contain Tailwind container class');
      assert.ok(listView.includes('bg-blue-600'), 'list view should contain Tailwind button class');
      assert.ok(!listView.includes('btn btn-primary'), 'list view should NOT contain Bootstrap button class');
      assert.ok(!listView.includes('container mt-4'), 'list view should NOT contain Bootstrap container class');

      const createView = fs.readFileSync(
        path.join(twDir, 'src', 'modules', 'Invoice', 'views', 'invoiceCreate.html'),
        'utf8'
      );
      assert.ok(createView.includes('w-full border border-gray-300'), 'create form should contain Tailwind input class');
      assert.ok(!createView.includes('form-control'), 'create form should NOT contain Bootstrap form-control class');

      // 6. Assert layout template names were swapped correctly
      const templatesDir = path.join(twDir, 'src', 'common', 'ui', 'templates');
      const twMain = fs.readFileSync(path.join(templatesDir, 'main_view_tailwind.html'), 'utf8');
      const bsMain = fs.readFileSync(path.join(templatesDir, 'main_view_bootstrap.html'), 'utf8');
      const twError = fs.readFileSync(path.join(templatesDir, 'error_tailwind.html'), 'utf8');
      const bsError = fs.readFileSync(path.join(templatesDir, 'error_bootstrap.html'), 'utf8');

      assert.ok(twMain.includes('@template name="main_view"'), 'tailwind main_view should now have canonical name');
      assert.ok(bsMain.includes('@template name="main_view_bootstrap"'), 'bootstrap main_view should now have suffixed name');
      assert.ok(twError.includes('@template name="error"'), 'tailwind error should now have canonical name');
      assert.ok(bsError.includes('@template name="error_bootstrap"'), 'bootstrap error should now have suffixed name');
    } finally {
      process.chdir(savedCwd);
      try {
        fs.rmSync(twDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
});
