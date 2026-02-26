import assert from 'node:assert';
export { describe, it, before, after } from 'node:test';

export function expect(actual: string) {
  return {
    toContain(expected: string, msg?: string) {
      assert.ok(
        actual.includes(expected),
        msg ||
          `Expected code to contain:\n  "${expected}"\n\nGot (first 300 chars):\n  "${actual.substring(0, 300)}..."`
      );
    },
    toNotContain(expected: string, msg?: string) {
      assert.ok(
        !actual.includes(expected),
        msg || `Expected code NOT to contain: "${expected}"`
      );
    },
    toMatch(pattern: RegExp, msg?: string) {
      assert.match(
        actual,
        pattern,
        msg || `Expected code to match: ${pattern}`
      );
    },
    toBeDefined(msg?: string) {
      assert.ok(
        actual !== undefined && actual !== null,
        msg || 'Expected value to be defined'
      );
    },
  };
}
