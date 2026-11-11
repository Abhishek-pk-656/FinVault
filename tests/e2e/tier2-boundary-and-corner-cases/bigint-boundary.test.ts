/**
 * Tier 2: Boundary & Corner Cases — BIGINT & Numeric Limits
 * 
 * Verifies boundaries around IEEE 754 MAX_SAFE_INTEGER, signed 64-bit bounds,
 * scientific notation rejection, malformed inputs, and extreme precision edge cases.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';

describe('Tier 2: BIGINT & Numeric Limits', () => {
  // Boundary 1: Exceeding JavaScript Number.MAX_SAFE_INTEGER
  it('T2-BIGINT-01: performs exact arithmetic beyond Number.MAX_SAFE_INTEGER without IEEE 754 precision loss', () => {
    // JavaScript Number loses precision beyond 9,007,199,254,740,991
    const beyondSafeInteger = 900719925474099200n; // 900 quadrillion minor units
    const addOne = beyondSafeInteger + 1n;

    expect(addOne - beyondSafeInteger).toBe(1n);

    // Number representation would fail this equality
    const formatted = LedgerOracle.formatMinorToDecimal(beyondSafeInteger);
    const parsed = LedgerOracle.parseDecimalToMinor(formatted);
    expect(parsed).toBe(beyondSafeInteger);
  });

  // Boundary 2: Rejection of scientific notation
  it('T2-BIGINT-02: strictly rejects scientific/exponential notation strings', () => {
    expect(() => LedgerOracle.parseDecimalToMinor('1e6')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('2.5e+4')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('1E-2')).toThrow('Invalid monetary decimal format');
  });

  // Boundary 3: Rejection of malformed non-numeric strings
  it('T2-BIGINT-03: rejects malformed, formatted, or whitespace-only strings', () => {
    expect(() => LedgerOracle.parseDecimalToMinor('')).toThrow('Cannot parse empty string');
    expect(() => LedgerOracle.parseDecimalToMinor('   ')).toThrow('Cannot parse empty string');
    expect(() => LedgerOracle.parseDecimalToMinor('NaN')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('$100.00')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('1,000.00')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('100.00.00')).toThrow('Invalid monetary decimal format');
    expect(() => LedgerOracle.parseDecimalToMinor('--50.00')).toThrow('Invalid monetary decimal format');
  });

  // Boundary 4: Rejection of extreme fractional sub-minor decimals
  it('T2-BIGINT-04: rejects fractional decimals exceeding 2 decimal places', () => {
    expect(() => LedgerOracle.parseDecimalToMinor('0.001')).toThrow('Monetary precision overflow');
    expect(() => LedgerOracle.parseDecimalToMinor('19.999')).toThrow('Monetary precision overflow');
    expect(() => LedgerOracle.parseDecimalToMinor('100.000000000001')).toThrow('Monetary precision overflow');
  });

  // Boundary 5: Maximum signed 64-bit integer limit
  it('T2-BIGINT-05: formats and parses signed 64-bit integer limits (Int64 Max)', () => {
    const int64Max = 9223372036854775807n; // 2^63 - 1
    const formatted = LedgerOracle.formatMinorToDecimal(int64Max);
    const parsed = LedgerOracle.parseDecimalToMinor(formatted);
    expect(parsed).toBe(int64Max);
  });

  // Boundary 6: Zero and negative-zero normalization
  it('T2-BIGINT-06: normalizes zero representations cleanly to 0n without negative zero anomalies', () => {
    expect(LedgerOracle.parseDecimalToMinor('0')).toBe(0n);
    expect(LedgerOracle.parseDecimalToMinor('0.00')).toBe(0n);
    expect(LedgerOracle.parseDecimalToMinor('-0.00')).toBe(0n);
    expect(LedgerOracle.formatMinorToDecimal(0n)).toBe('0.00');
  });
});
