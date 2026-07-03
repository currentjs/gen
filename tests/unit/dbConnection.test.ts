import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from '../lib.js';
import { parseEnvFile } from '../../src/utils/dbConnection.js';

// Helper – write a temp .env file and return its path
function writeTempEnv(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currentjs-test-'));
  const filePath = path.join(tmpDir, '.env');
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('parseEnvFile', () => {
  it('returns empty object when file does not exist', () => {
    const result = parseEnvFile('/nonexistent/path/.env');
    assert.deepStrictEqual(result, {});
  });

  it('parses simple key=value pairs', () => {
    const p = writeTempEnv('FOO=bar\nBAZ=qux\n');
    const result = parseEnvFile(p);
    assert.strictEqual(result.FOO, 'bar');
    assert.strictEqual(result.BAZ, 'qux');
  });

  it('skips blank lines', () => {
    const p = writeTempEnv('\nFOO=bar\n\nBAZ=qux\n\n');
    const result = parseEnvFile(p);
    assert.deepStrictEqual(Object.keys(result).sort(), ['BAZ', 'FOO']);
  });

  it('skips comment lines starting with #', () => {
    const p = writeTempEnv('# this is a comment\nFOO=bar\n# another comment\n');
    const result = parseEnvFile(p);
    assert.deepStrictEqual(Object.keys(result), ['FOO']);
    assert.strictEqual(result.FOO, 'bar');
  });

  it('strips surrounding double quotes', () => {
    const p = writeTempEnv('FOO="hello world"\n');
    const result = parseEnvFile(p);
    assert.strictEqual(result.FOO, 'hello world');
  });

  it('strips surrounding single quotes', () => {
    const p = writeTempEnv("FOO='hello world'\n");
    const result = parseEnvFile(p);
    assert.strictEqual(result.FOO, 'hello world');
  });

  it('preserves JSON values without outer quotes', () => {
    const p = writeTempEnv('MYSQL={"host":"localhost","port":3306}\n');
    const result = parseEnvFile(p);
    assert.strictEqual(result.MYSQL, '{"host":"localhost","port":3306}');
    // Ensure it round-trips to a valid object
    const parsed = JSON.parse(result.MYSQL);
    assert.strictEqual(parsed.host, 'localhost');
    assert.strictEqual(parsed.port, 3306);
  });

  it('preserves JSON values wrapped in single quotes', () => {
    const p = writeTempEnv("MYSQL='{\"host\":\"localhost\",\"port\":3306}'\n");
    const result = parseEnvFile(p);
    const parsed = JSON.parse(result.MYSQL);
    assert.strictEqual(parsed.host, 'localhost');
  });

  it('handles values that contain = signs (only first = is the separator)', () => {
    const p = writeTempEnv('URL=http://example.com?a=1&b=2\n');
    const result = parseEnvFile(p);
    assert.strictEqual(result.URL, 'http://example.com?a=1&b=2');
  });

  it('trims whitespace around key and value', () => {
    const p = writeTempEnv('  FOO  =  bar  \n');
    const result = parseEnvFile(p);
    assert.strictEqual(result.FOO, 'bar');
  });

  it('ignores lines without an = sign', () => {
    const p = writeTempEnv('NOEQUALSSIGN\nFOO=bar\n');
    const result = parseEnvFile(p);
    assert.deepStrictEqual(Object.keys(result), ['FOO']);
  });
});
