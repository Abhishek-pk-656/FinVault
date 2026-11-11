/**
 * FinVault Test Fixture & Arbitrary Generators (fast-check compatible)
 * 
 * Provides automated generators for balanced multi-split transactions,
 * boundary monetary units, out-of-balance transactions, IOUs, and user tenants.
 */

import { fc } from './fast-check.ts';
import type { Arbitrary } from './fast-check.ts';
import type { AccountType, EntryDirection } from './ledger-oracle.ts';
import * as crypto from 'node:crypto';

export interface GeneratedJournalEntry {
  accountId: string;
  amountMinor: bigint;
  direction: EntryDirection;
}

export interface GeneratedBalancedTransaction {
  idempotencyKey: string;
  description: string;
  entries: GeneratedJournalEntry[];
  totalMinor: bigint;
  splitCount: number;
}

export const generators = {
  /**
   * Generates a valid account type
   */
  accountType(): Arbitrary<AccountType> {
    return fc.constantFrom('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
  },

  /**
   * Generates minor unit monetary amounts as BIGINT > 0
   */
  minorUnit(opts?: { min?: bigint; max?: bigint }): Arbitrary<bigint> {
    return fc.bigInt({
      min: opts?.min ?? 1n,
      max: opts?.max ?? 1_000_000_000_000n // up to 10 billion currency units (in paise/cents)
    });
  },

  /**
   * Generates invalid floating-point currency representations (for rejection tests)
   */
  floatingPointMoney(): Arbitrary<number> {
    return fc.integer({ min: 1, max: 100000 }).map(intVal => intVal + 0.55);
  },

  /**
   * Generates an arbitrary balanced multi-split transaction where SUM(debits) == SUM(credits)
   */
  balancedTransaction(accountIds: string[]): Arbitrary<GeneratedBalancedTransaction> {
    if (accountIds.length < 2) {
      throw new Error('At least 2 accounts required for balanced transaction generation');
    }

    return fc.tuple(
      fc.uuid(),
      fc.string({ minLength: 5, maxLength: 30 }),
      fc.bigInt({ min: 100n, max: 10_000_000n }), // Total transaction amount
      fc.integer({ min: 1, max: Math.min(accountIds.length - 1, 4) }), // Debit split count
      fc.integer({ min: 1, max: Math.min(accountIds.length - 1, 4) })  // Credit split count
    ).map(([idempotencyKey, description, totalMinor, numDebits, numCredits]) => {
      const entries: GeneratedJournalEntry[] = [];

      // Split total among debits
      let remainingDebit = totalMinor;
      const debitAccounts = [...accountIds].sort(() => 0.5 - Math.random()).slice(0, numDebits);
      for (let i = 0; i < debitAccounts.length; i++) {
        if (i === debitAccounts.length - 1) {
          entries.push({
            accountId: debitAccounts[i],
            amountMinor: remainingDebit,
            direction: 'DEBIT'
          });
        } else {
          // allocate a portion
          const portion = remainingDebit / BigInt(debitAccounts.length - i + 1) + 1n;
          const amt = portion < remainingDebit ? portion : 1n;
          entries.push({
            accountId: debitAccounts[i],
            amountMinor: amt,
            direction: 'DEBIT'
          });
          remainingDebit -= amt;
        }
      }

      // Split total among credits
      let remainingCredit = totalMinor;
      const creditAccounts = [...accountIds].sort(() => 0.5 - Math.random()).slice(0, numCredits);
      for (let i = 0; i < creditAccounts.length; i++) {
        if (i === creditAccounts.length - 1) {
          entries.push({
            accountId: creditAccounts[i],
            amountMinor: remainingCredit,
            direction: 'CREDIT'
          });
        } else {
          const portion = remainingCredit / BigInt(creditAccounts.length - i + 1) + 1n;
          const amt = portion < remainingCredit ? portion : 1n;
          entries.push({
            accountId: creditAccounts[i],
            amountMinor: amt,
            direction: 'CREDIT'
          });
          remainingCredit -= amt;
        }
      }

      return {
        idempotencyKey,
        description: `Generated Tx: ${description}`,
        entries,
        totalMinor,
        splitCount: entries.length
      };
    });
  },

  /**
   * Generates deliberately unbalanced transactions where debits != credits
   */
  unbalancedTransaction(accountIds: string[]): Arbitrary<GeneratedJournalEntry[]> {
    return fc.tuple(
      generators.balancedTransaction(accountIds),
      fc.bigInt({ min: 1n, max: 10_000n }) // Imbalance delta
    ).map(([balancedTx, delta]) => {
      const modified = [...balancedTx.entries];
      // Corrupt the first entry by adding delta
      modified[0] = {
        ...modified[0],
        amountMinor: modified[0].amountMinor + delta
      };
      return modified;
    });
  }
};
