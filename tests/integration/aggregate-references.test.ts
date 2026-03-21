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
  library: path.join(GEN_ROOT, 'library.yaml'),
};

describe('Integration: aggregate references (Review -> Book -> Author) compile correctly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currentjs-aggref-'));
  const originalCwd = process.cwd();

  after(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('generates entities with chained aggregate references and compiles successfully', async () => {
    handleInit(tempDir);

    const libraryModuleDir = path.join(tempDir, 'src', 'modules', 'Library');
    fs.mkdirSync(libraryModuleDir, { recursive: true });
    fs.copyFileSync(FIXTURES.library, path.join(libraryModuleDir, 'library.yaml'));

    const appYamlPath = path.join(tempDir, 'app.yaml');
    const appYaml = fs.readFileSync(appYamlPath, 'utf8');
    const appConfig = appYaml.replace(
      'modules: {}',
      `modules:
  Library:
    path: src/modules/Library/library.yaml`
    );
    fs.writeFileSync(appYamlPath, appConfig, 'utf8');

    process.chdir(tempDir);

    await handleGenerateAll('app.yaml', undefined, undefined, { force: true });

    const src = path.join(tempDir, 'src');

    // Domain entities
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Library', 'domain', 'entities', 'Author.ts')), 'Author entity');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Library', 'domain', 'entities', 'Book.ts')), 'Book entity');
    assert.ok(fs.existsSync(path.join(src, 'modules', 'Library', 'domain', 'entities', 'Review.ts')), 'Review entity');

    // Book entity imports Author
    const bookEntity = fs.readFileSync(path.join(src, 'modules', 'Library', 'domain', 'entities', 'Book.ts'), 'utf8');
    assert.ok(bookEntity.includes("import { Author }"), 'Book entity imports Author');
    assert.ok(bookEntity.includes('author?: Author'), 'Book entity has optional author field typed as Author');

    // Review entity imports Book
    const reviewEntity = fs.readFileSync(path.join(src, 'modules', 'Library', 'domain', 'entities', 'Review.ts'), 'utf8');
    assert.ok(reviewEntity.includes("import { Book }"), 'Review entity imports Book');
    assert.ok(reviewEntity.includes('book?: Book'), 'Review entity has optional book field typed as Book');

    // Stores use FK columns
    const bookStore = fs.readFileSync(path.join(src, 'modules', 'Library', 'infrastructure', 'stores', 'BookStore.ts'), 'utf8');
    assert.ok(bookStore.includes('author_id'), 'BookStore uses author_id FK column');
    assert.ok(bookStore.includes("import { Author }"), 'BookStore imports Author for stub mapping');

    const reviewStore = fs.readFileSync(path.join(src, 'modules', 'Library', 'infrastructure', 'stores', 'ReviewStore.ts'), 'utf8');
    assert.ok(reviewStore.includes('book_id'), 'ReviewStore uses book_id FK column');
    assert.ok(reviewStore.includes("import { Book }"), 'ReviewStore imports Book for stub mapping');

    // Book store handles enum genre field
    assert.ok(bookStore.includes('BookGenre'), 'BookStore imports/uses BookGenre enum type');

    // Review controller uses void output for delete (no .from() call, no Output import)
    const reviewApiCtrl = fs.readFileSync(
      path.join(src, 'modules', 'Library', 'infrastructure', 'controllers', 'ReviewApiController.ts'), 'utf8'
    );
    assert.ok(!reviewApiCtrl.includes('ReviewDeleteOutput.from'), 'ReviewApiController does not call .from() on void delete output');
    assert.ok(!reviewApiCtrl.includes('ReviewDeleteOutput'), 'ReviewApiController does not import ReviewDeleteOutput');

    // Compilation succeeds (throws if build fails)
    execSync('npm run build', { cwd: tempDir, stdio: 'pipe' });
  });
});
