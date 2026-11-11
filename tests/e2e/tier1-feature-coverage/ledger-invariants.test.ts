/**
 * Tier 1: Feature Coverage — Financial Ledger Invariants
 * 
 * Verifies Double-Entry Lite balancing: SUM(debits) == SUM(credits) across
 * simple, multi-split, income, expense, and transfer transactions.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { fc } from '../infra/fast-check.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';
import type { JournalEntryModel, AccountModel } from '../infra/ledger-oracle.ts';
import { generators } from '../infra/generators.ts';
import * as crypto from 'node:crypto';

describe('Tier 1: Financial Ledger Invariants', () => {
  const userId = crypto.randomUUID();

  // Test 1: Simple two-leg transaction balance
  it('T1-LEDGER-01: verifies simple balanced 2-leg transaction (debit == credit)', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx1', accountId: 'acc-bank', amountMinor: 500000n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx1', accountId: 'acc-salary', amountMinor: 500000n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe(500000n);
    expect(result.totalCredits).toBe(500000n);
    expect(result.delta).toBe(0n);
  });

  // Test 2: Multi-split expense allocation
  it('T1-LEDGER-02: verifies 3-leg multi-split expense allocation with multiple debits to one credit', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx2', accountId: 'acc-groceries', amountMinor: 250000n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx2', accountId: 'acc-utilities', amountMinor: 150000n, direction: 'DEBIT' },
      { id: 'e3', userId, transactionId: 'tx2', accountId: 'acc-bank', amountMinor: 400000n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe(400000n);
    expect(result.totalCredits).toBe(400000n);
    expect(result.delta).toBe(0n);
  });

  // Test 3: Property-based verification with arbitrary multi-splits
  it('T1-LEDGER-03: verifies arbitrary multi-split transactions via fast-check property testing', async () => {
    const accountIds = ['acc1', 'acc2', 'acc3', 'acc4', 'acc5'];
    const prop = fc.property(
      generators.balancedTransaction(accountIds),
      (balancedTx) => {
        const result = LedgerOracle.validateTransaction(
          balancedTx.entries.map((e, idx) => ({
            id: `entry-${idx}`,
            userId,
            transactionId: balancedTx.idempotencyKey,
            accountId: e.accountId,
            amountMinor: e.amountMinor,
            direction: e.direction
          }))
        );
        expect(result.isValid).toBe(true);
        expect(result.delta).toBe(0n);
        expect(result.totalDebits).toBe(result.totalCredits);
      }
    );

    await fc.assert(prop, { numRuns: 50 });
  });

  // Test 4: Rejection of unbalanced transactions
  it('T1-LEDGER-04: rejects unbalanced transaction where debits != credits', () => {
    const entries: JournalEntryModel[] = [
      { id: 'e1', userId, transactionId: 'tx3', accountId: 'acc-groceries', amountMinor: 250000n, direction: 'DEBIT' },
      { id: 'e2', userId, transactionId: 'tx3', accountId: 'acc-bank', amountMinor: 200000n, direction: 'CREDIT' }
    ];

    const result = LedgerOracle.validateTransaction(entries);
    expect(result.isValid).toBe(false);
    expect(result.totalDebits).toBe(250000n);
    expect(result.totalCredits).toBe(200000n);
    expect(result.delta).toBe(50000n);
    expect(result.errorMessage).toContain('Ledger imbalance');
  });

  // Test 5: Fundamental accounting equation preservation
  it('T1-LEDGER-05: verifies fundamental accounting equation preservation across account types', () => {
    const accounts: AccountModel[] = [
      { id: 'a1', userId, name: 'Bank Account', type: 'ASSET', currency: 'INR', balanceMinor: 1000000n, isArchived: false, version: 1n },
      { id: 'a2', userId, name: 'Credit Card', type: 'LIABILITY', currency: 'INR', balanceMinor: 200000n, isArchived: false, version: 1n },
      { id: 'a3', userId, name: 'Opening Equity', type: 'EQUITY', currency: 'INR', balanceMinor: 500000n, isArchived: false, version: 1n },
      { id: 'a4', userId, name: 'Salary Income', type: 'INCOME', currency: 'INR', balanceMinor: 400000n, isArchived: false, version: 1n },
      { id: 'a5', userId, name: 'Living Expenses', type: 'EXPENSE', currency: 'INR', balanceMinor: 100000n, isArchived: false, version: 1n }
    ];

    // Net worth = Assets (1,000,000) - Liabilities (200,000) = 800,000
    // Right side = Equity (500,000) + (Income (400,000) - Expenses (100,000)) = 500,000 + 300,000 = 800,000
    const equation = LedgerOracle.verifyAccountingEquation(accounts);
    expect(equation.isBalanced).toBe(true);
    expect(equation.netWorth).toBe(800000n);
    expect(equation.equationDelta).toBe(0n);
  });

  // Test 6: Account balance sign convention dynamics
  it('T1-LEDGER-06: computes balance deltas according to accounting sign conventions', () => {
    // ASSET: Debit increases, Credit decreases
    expect(LedgerOracle.calculateBalanceDelta('ASSET', 'DEBIT', 1000n)).toBe(1000n);
    expect(LedgerOracle.calculateBalanceDelta('ASSET', 'CREDIT', 1000n)).toBe(-1000n);

    // LIABILITY: Credit increases, Debit decreases
    expect(LedgerOracle.calculateBalanceDelta('LIABILITY', 'CREDIT', 2000n)).toBe(2000n);
    expect(LedgerOracle.calculateBalanceDelta('LIABILITY', 'DEBIT', 2000n)).toBe(-2000n);

    // EXPENSE: Debit increases, Credit decreases
    expect(LedgerOracle.calculateBalanceDelta('EXPENSE', 'DEBIT', 500n)).toBe(500n);
    expect(LedgerOracle.calculateBalanceDelta('EXPENSE', 'CREDIT', 500n)).toBe(-500n);

    // INCOME: Credit increases, Debit decreases
    expect(LedgerOracle.calculateBalanceDelta('INCOME', 'CREDIT', 3000n)).toBe(3000n);
    expect(LedgerOracle.calculateBalanceDelta('INCOME', 'DEBIT', 3000n)).toBe(-3000n);
  });
});
