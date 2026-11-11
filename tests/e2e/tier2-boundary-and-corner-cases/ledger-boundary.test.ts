/**
 * Tier 2: Boundary & Corner Cases — Financial Ledger Boundaries
 * 
 * Verifies extreme ledger boundaries: 1-paise minimum splits, 100-way multi-splits,
 * maximum 64-bit integer limits, zero-amount rejection, negative-amount rejection,
 * and single minor unit imbalance detection.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';
import type { JournalEntryModel } from '../infra/ledger-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 2: Financial Ledger Boundaries & Corner Cases', () => {
  const userId = crypto.randomUUID();

  // Boundary 1: Minimum possible currency unit (1 minor unit = 1 paise/cent)
  it('T2-LEDGER-01: validates minimum possible monetary unit (1 paise/cent) split', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-min', accountId: 'acc1', amountMinor: 1n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx-min', accountId: 'acc2', amountMinor: 1n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe(1n);
    expect(result.totalCredits).toBe(1n);
    expect(result.delta).toBe(0n);
  });

  // Boundary 2: 100-way multi-split transaction
  it('T2-LEDGER-02: verifies 100-way multi-split transaction (50 debits and 50 credits)', () => {
    const entries: JournalEntryModel[] = [];
    const splitAmount = 250n; // 250 minor units each
    const splitCount = 50;

    for (let i = 0; i < splitCount; i++) {
      entries.push({
        id: `deb-${i}`,
        userId,
        transactionId: 'tx-100',
        accountId: `acc-deb-${i}`,
        amountMinor: splitAmount,
        direction: 'DEBIT'
      });
      entries.push({
        id: `cred-${i}`,
        userId,
        transactionId: 'tx-100',
        accountId: `acc-cred-${i}`,
        amountMinor: splitAmount,
        direction: 'CREDIT'
      });
    }

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe(12500n); // 50 * 250
    expect(result.totalCredits).toBe(12500n);
    expect(result.delta).toBe(0n);
  });

  // Boundary 3: Maximum 64-bit integer limit ($9 \times 10^{18}$)
  it('T2-LEDGER-03: validates extreme maximum 64-bit signed integer boundary without overflow', () => {
    const maxInt64 = 9223372036854775807n; // 2^63 - 1
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-max', accountId: 'acc1', amountMinor: maxInt64, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx-max', accountId: 'acc2', amountMinor: maxInt64, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe(maxInt64);
    expect(result.totalCredits).toBe(maxInt64);
    expect(result.delta).toBe(0n);
  });

  // Boundary 4: Rejection of zero-amount journal entry
  it('T2-LEDGER-04: strictly rejects zero-amount entries (amount_minor = 0n)', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-zero', accountId: 'acc1', amountMinor: 0n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx-zero', accountId: 'acc2', amountMinor: 0n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Journal entry amount must be strictly positive (> 0n)');
  });

  // Boundary 5: Rejection of negative-amount journal entry
  it('T2-LEDGER-05: strictly rejects negative-amount entries (amount_minor < 0n)', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-neg', accountId: 'acc1', amountMinor: -500n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx-neg', accountId: 'acc2', amountMinor: -500n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Journal entry amount must be strictly positive');
  });

  // Boundary 6: Off-by-one minor unit imbalance
  it('T2-LEDGER-06: detects single minor unit discrepancy (off-by-1 paise)', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-off1', accountId: 'acc1', amountMinor: 100000n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx-off1', accountId: 'acc2', amountMinor: 99999n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(false);
    expect(result.delta).toBe(1n);
    expect(result.errorMessage).toContain('delta: 1n');
  });

  // Boundary 7: Single-entry transaction rejection (< 2 entries)
  it('T2-LEDGER-07: rejects single-sided transaction with only one entry', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx-single', accountId: 'acc1', amountMinor: 1000n, direction: 'DEBIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('at least two journal entries');
  });
});
