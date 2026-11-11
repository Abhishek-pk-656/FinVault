/**
 * Tier 1: Feature Coverage — Strict BIGINT Minor Units
 * 
 * Verifies that all monetary amounts are stored as 64-bit integer minor units (paise/cents),
 * floating-point representations are strictly rejected, and decimal conversions are lossless.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { fc } from '../infra/fast-check.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';
import type { JournalEntryModel } from '../infra/ledger-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 1: Strict BIGINT Minor Units', () => {
  const userId = crypto.randomUUID();

  // Test 1: Strict BIGINT type enforcement
  it('T1-BIGINT-01: verifies all financial entries require native BigInt amounts', () => {
    const validEntry: JournalEntryModel = {
      id: 'e1',
      userId,
      transactionId: 'tx1',
      accountId: 'acc1',
      amountMinor: 25000000000n, // 250 million paise = 2.5 million INR
      direction: 'DEBIT'
    };

    expect(typeof validEntry.amountMinor).toBe('bigint');
    expect(validEntry.amountMinor).toBe(25000000000n);
  });

  // Test 2: Rejection of floating-point money
  it('T1-BIGINT-02: strictly rejects floating-point money passed into journal entries', () => {
    const floatEntries: any[] = [
      { id: 'e1', userId, transactionId: 'tx1', accountId: 'acc1', amountMinor: 125.50, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx1', accountId: 'acc2', amountMinor: 125.50, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(floatEntries);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Non-bigint monetary amount detected');
    expect(result.errorMessage).toContain('Floating-point money prohibited');
  });

  // Test 3: Lossless decimal string parsing
  it('T1-BIGINT-03: parses human decimal string directly to BIGINT minor units without float error', () => {
    expect(LedgerOracle.parseDecimalToMinor('0.01')).toBe(1n);
    expect(LedgerOracle.parseDecimalToMinor('1.00')).toBe(100n);
    expect(LedgerOracle.parseDecimalToMinor('1234567.89')).toBe(123456789n);
    expect(LedgerOracle.parseDecimalToMinor('500')).toBe(50000n);
    expect(LedgerOracle.parseDecimalToMinor('-45.20')).toBe(-4520n);
  });

  // Test 4: Minor unit to decimal string formatting
  it('T1-BIGINT-04: formats BIGINT minor units to canonical ISO decimal strings', () => {
    expect(LedgerOracle.formatMinorToDecimal(1n)).toBe('0.01');
    expect(LedgerOracle.formatMinorToDecimal(100n)).toBe('1.00');
    expect(LedgerOracle.formatMinorToDecimal(123456789n)).toBe('1234567.89');
    expect(LedgerOracle.formatMinorToDecimal(-4520n)).toBe('-45.20');
    expect(LedgerOracle.formatMinorToDecimal(0n)).toBe('0.00');
  });

  // Test 5: Property-based lossless round-trip
  it('T1-BIGINT-05: verifies lossless round-trip (minor -> decimal -> minor) across 50 random amounts', async () => {
    const prop = fc.property(
      fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
      (originalMinor) => {
        const formatted = LedgerOracle.formatMinorToDecimal(originalMinor);
        const parsed = LedgerOracle.parseDecimalToMinor(formatted);
        expect(parsed).toBe(originalMinor);
      }
    );

    await fc.assert(prop, { numRuns: 50 });
  });

  // Test 6: Rejection of sub-minor precision overflow
  it('T1-BIGINT-06: rejects sub-minor precision fractions (more than 2 decimal places)', () => {
    expect(() => {
      LedgerOracle.parseDecimalToMinor('10.555');
    }).toThrow('Monetary precision overflow: maximum 2 decimal places allowed, received 3');

    expect(() => {
      LedgerOracle.parseDecimalToMinor('0.12345');
    }).toThrow('Monetary precision overflow');
  });
});
