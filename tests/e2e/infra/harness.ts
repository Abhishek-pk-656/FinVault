/**
 * FinVault E2E Test Harness
 * 
 * Provides unified test syntax compatible with both Vitest and Node.js built-in test runner.
 * Supplies robust BDD matchers (expect) and lifecycle hooks.
 */

import * as nodeTest from 'node:test';
import * as assert from 'node:assert/strict';

export const describe = nodeTest.describe;
export const it = nodeTest.it;
export const test = nodeTest.test;
export const beforeEach = nodeTest.beforeEach;
export const afterEach = nodeTest.afterEach;
export const before = nodeTest.before;
export const after = nodeTest.after;

export interface Expectation<T> {
  toBe(expected: T): void;
  toEqual(expected: any): void;
  toStrictEqual(expected: any): void;
  toBeNull(): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(val: number | bigint): void;
  toBeGreaterThanOrEqual(val: number | bigint): void;
  toBeLessThan(val: number | bigint): void;
  toBeLessThanOrEqual(val: number | bigint): void;
  toHaveLength(length: number): void;
  toContain(item: any): void;
  toMatch(pattern: RegExp | string): void;
  toThrow(expectedError?: string | RegExp | Error): void;
  not: Expectation<T>;
  rejects: {
    toThrow(expectedError?: string | RegExp | Error): Promise<void>;
  };
}

export function expect<T = any>(actual: T): Expectation<T> {
  const buildExpectation = (isNot: boolean): Expectation<T> => ({
    toBe(expected: T) {
      if (isNot) {
        assert.notStrictEqual(actual, expected);
      } else {
        assert.strictEqual(actual, expected);
      }
    },
    toEqual(expected: any) {
      if (isNot) {
        assert.notDeepStrictEqual(actual, expected);
      } else {
        assert.deepStrictEqual(actual, expected);
      }
    },
    toStrictEqual(expected: any) {
      if (isNot) {
        assert.notDeepStrictEqual(actual, expected);
      } else {
        assert.deepStrictEqual(actual, expected);
      }
    },
    toBeNull() {
      if (isNot) {
        assert.notStrictEqual(actual, null);
      } else {
        assert.strictEqual(actual, null);
      }
    },
    toBeDefined() {
      if (isNot) {
        assert.strictEqual(actual, undefined);
      } else {
        assert.notStrictEqual(actual, undefined);
      }
    },
    toBeUndefined() {
      if (isNot) {
        assert.notStrictEqual(actual, undefined);
      } else {
        assert.strictEqual(actual, undefined);
      }
    },
    toBeTruthy() {
      const bool = Boolean(actual);
      if (isNot) {
        assert.strictEqual(bool, false);
      } else {
        assert.strictEqual(bool, true);
      }
    },
    toBeFalsy() {
      const bool = Boolean(actual);
      if (isNot) {
        assert.strictEqual(bool, true);
      } else {
        assert.strictEqual(bool, false);
      }
    },
    toBeGreaterThan(val: number | bigint) {
      if (isNot) {
        assert.ok((actual as any) <= val, `Expected ${(actual as any)} not to be > ${val}`);
      } else {
        assert.ok((actual as any) > val, `Expected ${(actual as any)} to be > ${val}`);
      }
    },
    toBeGreaterThanOrEqual(val: number | bigint) {
      if (isNot) {
        assert.ok((actual as any) < val, `Expected ${(actual as any)} not to be >= ${val}`);
      } else {
        assert.ok((actual as any) >= val, `Expected ${(actual as any)} to be >= ${val}`);
      }
    },
    toBeLessThan(val: number | bigint) {
      if (isNot) {
        assert.ok((actual as any) >= val, `Expected ${(actual as any)} not to be < ${val}`);
      } else {
        assert.ok((actual as any) < val, `Expected ${(actual as any)} to be < ${val}`);
      }
    },
    toBeLessThanOrEqual(val: number | bigint) {
      if (isNot) {
        assert.ok((actual as any) > val, `Expected ${(actual as any)} not to be <= ${val}`);
      } else {
        assert.ok((actual as any) <= val, `Expected ${(actual as any)} to be <= ${val}`);
      }
    },
    toHaveLength(length: number) {
      const len = (actual as any)?.length;
      if (isNot) {
        assert.notStrictEqual(len, length);
      } else {
        assert.strictEqual(len, length);
      }
    },
    toContain(item: any) {
      if (Array.isArray(actual)) {
        const found = (actual as any[]).includes(item);
        if (isNot) {
          assert.strictEqual(found, false, `Expected array not to contain ${item}`);
        } else {
          assert.strictEqual(found, true, `Expected array to contain ${item}`);
        }
      } else if (typeof actual === 'string') {
        const found = actual.includes(String(item));
        if (isNot) {
          assert.strictEqual(found, false);
        } else {
          assert.strictEqual(found, true);
        }
      } else if (actual instanceof Set || actual instanceof Map) {
        const found = (actual as any).has(item);
        if (isNot) {
          assert.strictEqual(found, false);
        } else {
          assert.strictEqual(found, true);
        }
      } else {
        throw new Error(`toContain called on unsupported type: ${typeof actual}`);
      }
    },
    toMatch(pattern: RegExp | string) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      const pass = regex.test(String(actual));
      if (isNot) {
        assert.strictEqual(pass, false, `Expected "${actual}" not to match ${regex}`);
      } else {
        assert.strictEqual(pass, true, `Expected "${actual}" to match ${regex}`);
      }
    },
    toThrow(expectedError?: string | RegExp | Error) {
      if (typeof actual !== 'function') {
        throw new Error('toThrow requires a function to be passed to expect()');
      }
      let threw = false;
      let thrownError: any = null;
      try {
        (actual as any)();
      } catch (err) {
        threw = true;
        thrownError = err;
      }
      if (isNot) {
        if (threw) {
          throw new Error(`Expected function not to throw, but it threw: ${thrownError?.message || thrownError}`);
        }
      } else {
        if (!threw) {
          throw new Error('Expected function to throw, but it did not throw.');
        }
        if (expectedError) {
          if (typeof expectedError === 'string') {
            assert.ok(
              String(thrownError?.message || thrownError).includes(expectedError),
              `Expected error message to include "${expectedError}", got "${thrownError?.message || thrownError}"`
            );
          } else if (expectedError instanceof RegExp) {
            assert.ok(
              expectedError.test(String(thrownError?.message || thrownError)),
              `Expected error message to match ${expectedError}, got "${thrownError?.message || thrownError}"`
            );
          }
        }
      }
    },
    get not() {
      return buildExpectation(!isNot);
    },
    rejects: {
      async toThrow(expectedError?: string | RegExp | Error) {
        let threw = false;
        let thrownError: any = null;
        try {
          await (actual as any);
        } catch (err) {
          threw = true;
          thrownError = err;
        }
        if (isNot) {
          if (threw) {
            throw new Error(`Expected promise not to reject, but it rejected: ${thrownError?.message || thrownError}`);
          }
        } else {
          if (!threw) {
            throw new Error('Expected promise to reject, but it resolved.');
          }
          if (expectedError) {
            if (typeof expectedError === 'string') {
              assert.ok(
                String(thrownError?.message || thrownError).includes(expectedError),
                `Expected error message to include "${expectedError}", got "${thrownError?.message || thrownError}"`
              );
            } else if (expectedError instanceof RegExp) {
              assert.ok(
                expectedError.test(String(thrownError?.message || thrownError)),
                `Expected error message to match ${expectedError}, got "${thrownError?.message || thrownError}"`
              );
            }
          }
        }
      }
    }
  });

  return buildExpectation(false);
}
