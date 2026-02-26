import assert from 'node:assert';
import { describe, it, after } from '../lib.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'node:child_process';
import { handleCreateApp } from '../../src/commands/createApp.js';
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
    // 1. Create app (runs npm install in tempDir)
    handleCreateApp(tempDir);

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
});
