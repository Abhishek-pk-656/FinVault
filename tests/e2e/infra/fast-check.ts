/**
 * FinVault Property-Based Testing Engine (fast-check compatible)
 * 
 * Implements property-based fuzzing, arbitrary generation, and invariant checking.
 */

import * as crypto from 'node:crypto';

export interface Arbitrary<T> {
  generate(rng: RandomGenerator): T;
  shrink?(val: T): T[];
  map<U>(fn: (val: T) => U): Arbitrary<U>;
  filter(fn: (val: T) => boolean): Arbitrary<T>;
}

export class RandomGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  // Linear congruential generator (LCG)
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  nextInt(min: number, max: number): number {
    const range = max - min + 1;
    return min + Math.floor(this.next() * range);
  }

  nextBigInt(min: bigint, max: bigint): bigint {
    if (min === max) return min;
    const diff = max - min;
    // Generate pseudo-random big integer within diff
    const randDouble = this.next();
    // To handle large 64-bit numbers safely:
    const diffNum = diff > BigInt(Number.MAX_SAFE_INTEGER) 
      ? BigInt(Math.floor(randDouble * Number.MAX_SAFE_INTEGER)) 
      : BigInt(Math.floor(randDouble * Number(diff)));
    return min + diffNum;
  }
}

class BaseArbitrary<T> implements Arbitrary<T> {
  private generator: (rng: RandomGenerator) => T;

  constructor(generator: (rng: RandomGenerator) => T) {
    this.generator = generator;
  }

  generate(rng: RandomGenerator): T {
    return this.generator(rng);
  }

  map<U>(fn: (val: T) => U): Arbitrary<U> {
    return new BaseArbitrary((rng) => fn(this.generate(rng)));
  }

  filter(predicate: (val: T) => boolean): Arbitrary<T> {
    return new BaseArbitrary((rng) => {
      let attempts = 0;
      while (attempts < 100) {
        const val = this.generate(rng);
        if (predicate(val)) return val;
        attempts++;
      }
      throw new Error('fc.filter failed to generate value meeting predicate within 100 attempts');
    });
  }
}

export interface PropertyOptions {
  numRuns?: number;
  seed?: number;
  verbose?: boolean;
}

export class Property<TArgs extends any[]> {
  public arbitraries: { [K in keyof TArgs]: Arbitrary<TArgs[K]> };
  public predicate: (...args: TArgs) => boolean | void | Promise<boolean | void>;

  constructor(
    arbitraries: { [K in keyof TArgs]: Arbitrary<TArgs[K]> },
    predicate: (...args: TArgs) => boolean | void | Promise<boolean | void>
  ) {
    this.arbitraries = arbitraries;
    this.predicate = predicate;
  }
}

export const fc = {
  property<TArgs extends any[]>(
    ...args: [...{ [K in keyof TArgs]: Arbitrary<TArgs[K]> }, (...args: TArgs) => boolean | void | Promise<boolean | void>]
  ): Property<TArgs> {
    const predicate = args[args.length - 1] as (...args: TArgs) => boolean | void | Promise<boolean | void>;
    const arbitraries = args.slice(0, args.length - 1) as unknown as { [K in keyof TArgs]: Arbitrary<TArgs[K]> };
    return new Property(arbitraries, predicate);
  },

  async assert<TArgs extends any[]>(property: Property<TArgs>, options: PropertyOptions = {}): Promise<void> {
    const numRuns = options.numRuns ?? 50;
    const rng = new RandomGenerator(options.seed);

    for (let run = 0; run < numRuns; run++) {
      const generatedValues = property.arbitraries.map(arb => arb.generate(rng)) as TArgs;
      try {
        const result = await property.predicate(...generatedValues);
        if (result === false) {
          throw new Error(`Property returned false on run ${run + 1} with inputs: ${JSON.stringify(generatedValues, (_, v) => typeof v === 'bigint' ? v.toString() + 'n' : v)}`);
        }
      } catch (err: any) {
        throw new Error(
          `Property failed after ${run + 1} test runs!\n` +
          `Counterexample: ${JSON.stringify(generatedValues, (_, v) => typeof v === 'bigint' ? v.toString() + 'n' : v)}\n` +
          `Error: ${err.message}\n` +
          `Stack: ${err.stack}`
        );
      }
    }
  },

  integer(opts?: { min?: number; max?: number }): Arbitrary<number> {
    const min = opts?.min ?? -2147483648;
    const max = opts?.max ?? 2147483647;
    return new BaseArbitrary((rng) => rng.nextInt(min, max));
  },

  nat(opts?: { max?: number }): Arbitrary<number> {
    const max = opts?.max ?? 2147483647;
    return new BaseArbitrary((rng) => rng.nextInt(0, max));
  },

  bigInt(opts?: { min?: bigint; max?: bigint }): Arbitrary<bigint> {
    const min = opts?.min ?? -9223372036854775807n;
    const max = opts?.max ?? 9223372036854775807n;
    return new BaseArbitrary((rng) => rng.nextBigInt(min, max));
  },

  bigNat(opts?: { max?: bigint }): Arbitrary<bigint> {
    const max = opts?.max ?? 9223372036854775807n;
    return new BaseArbitrary((rng) => rng.nextBigInt(0n, max));
  },

  boolean(): Arbitrary<boolean> {
    return new BaseArbitrary((rng) => rng.next() >= 0.5);
  },

  string(opts?: { minLength?: number; maxLength?: number }): Arbitrary<string> {
    const min = opts?.minLength ?? 0;
    const max = opts?.maxLength ?? 20;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-';
    return new BaseArbitrary((rng) => {
      const len = rng.nextInt(min, max);
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars[rng.nextInt(0, chars.length - 1)];
      }
      return res;
    });
  },

  uuid(): Arbitrary<string> {
    return new BaseArbitrary(() => crypto.randomUUID());
  },

  constant<T>(val: T): Arbitrary<T> {
    return new BaseArbitrary(() => val);
  },

  constantFrom<T>(...values: T[]): Arbitrary<T> {
    if (values.length === 0) throw new Error('constantFrom requires at least one value');
    return new BaseArbitrary((rng) => values[rng.nextInt(0, values.length - 1)]);
  },

  oneof<T>(...arbitraries: Arbitrary<T>[]): Arbitrary<T> {
    if (arbitraries.length === 0) throw new Error('oneof requires at least one arbitrary');
    return new BaseArbitrary((rng) => {
      const chosen = arbitraries[rng.nextInt(0, arbitraries.length - 1)];
      return chosen.generate(rng);
    });
  },

  tuple<T extends any[]>(...arbitraries: { [K in keyof T]: Arbitrary<T[K]> }): Arbitrary<T> {
    return new BaseArbitrary((rng) => arbitraries.map(a => a.generate(rng)) as T);
  },

  array<T>(arbitrary: Arbitrary<T>, opts?: { minLength?: number; maxLength?: number }): Arbitrary<T[]> {
    const min = opts?.minLength ?? 0;
    const max = opts?.maxLength ?? 10;
    return new BaseArbitrary((rng) => {
      const length = rng.nextInt(min, max);
      const arr: T[] = [];
      for (let i = 0; i < length; i++) {
        arr.push(arbitrary.generate(rng));
      }
      return arr;
    });
  },

  record<T extends object>(shape: { [K in keyof T]: Arbitrary<T[K]> }): Arbitrary<T> {
    return new BaseArbitrary((rng) => {
      const result: any = {};
      for (const key of Object.keys(shape) as (keyof T)[]) {
        result[key] = shape[key].generate(rng);
      }
      return result as T;
    });
  }
};
