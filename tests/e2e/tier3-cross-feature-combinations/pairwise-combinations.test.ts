/**
 * Tier 3: Cross-Feature Combinations — Pairwise Combinatorial Coverage
 * 
 * Verifies cross-feature interactions using Pairwise (Combinatorial) Testing:
 * [Account Type] × [Transaction Modality] × [Execution Mode] × [Tenant Context] × [Currency]
 */

import { describe, it, expect, beforeEach, afterEach } from '../infra/harness.ts';
import { SQLiteHarness } from '../infra/sqlite-harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import { SyncEngineOracle } from '../infra/sync-oracle.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 3: Pairwise Cross-Feature Combinations', () => {
  let localDb: SQLiteHarness;
  let supabase: SupabaseOracle;

  const userAlice: UserSession = {
    userId: crypto.randomUUID(),
    email: 'alice@finvault.io',
    role: 'authenticated'
  };

  const userBob: UserSession = {
    userId: crypto.randomUUID(),
    email: 'bob@finvault.io',
    role: 'authenticated'
  };

  beforeEach(() => {
    localDb = new SQLiteHarness(':memory:');
    supabase = new SupabaseOracle();
  });

  afterEach(() => {
    localDb.close();
  });

  // Pairwise Case 1: [ASSET -> EXPENSE] × [Simple 2-Leg] × [Online Direct] × [Single User] × [INR]
  it('T3-PAIR-01: Asset -> Expense | Simple 2-Leg | Online Direct | Single User | INR', () => {
    const accBank = supabase.createAccount(userAlice, { name: 'HDFC Checking', type: 'ASSET', currency: 'INR' });
    const accRent = supabase.createAccount(userAlice, { name: 'Apartment Rent', type: 'EXPENSE', currency: 'INR' });

    const { transaction, entries } = supabase.postTransaction(userAlice, {
      idempotencyKey: crypto.randomUUID(),
      transactionDate: '2026-11-01',
      description: 'November Rent Payment',
      entries: [
        { accountId: accRent.id, amountMinor: 3500000n, direction: 'DEBIT' }, // 35,000 INR
        { accountId: accBank.id, amountMinor: 3500000n, direction: 'CREDIT' }
      ]
    });

    expect(transaction.is_deleted).toBe(false);
    expect(entries).toHaveLength(2);
    expect(supabase.getAccountById(userAlice, accBank.id)!.balance_minor).toBe(-3500000n);
    expect(supabase.getAccountById(userAlice, accRent.id)!.balance_minor).toBe(3500000n);
  });

  // Pairwise Case 2: [INCOME -> ASSET] × [Multi-Split 3-Way] × [Offline Sync] × [Single User] × [INR]
  it('T3-PAIR-02: Income -> Asset | Multi-Split 3-Way | Offline Sync | Single User | INR', async () => {
    // Setup accounts on server and replicate locally
    const accSalary = supabase.createAccount(userAlice, { name: 'Employer Payroll', type: 'INCOME', currency: 'INR' });
    const accChecking = supabase.createAccount(userAlice, { name: 'SBI Salary Acc', type: 'ASSET', currency: 'INR' });
    const accTDS = supabase.createAccount(userAlice, { name: 'Income Tax TDS', type: 'EXPENSE', currency: 'INR' });

    localDb.insertAccount({ id: accSalary.id, user_id: userAlice.userId, name: accSalary.name, type: 'INCOME' });
    localDb.insertAccount({ id: accChecking.id, user_id: userAlice.userId, name: accChecking.name, type: 'ASSET' });
    localDb.insertAccount({ id: accTDS.id, user_id: userAlice.userId, name: accTDS.name, type: 'EXPENSE' });

    // Gross: 100,000 INR (10,000,000 paise), Net to Bank: 90,000 INR (9,000,000), TDS: 10,000 INR (1,000,000)
    localDb.postTransaction({
      user_id: userAlice.userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-01',
      description: 'Monthly Salary with Tax Deducted',
      entries: [
        { account_id: accChecking.id, amount_minor: 9000000n, direction: 'DEBIT' },
        { account_id: accTDS.id, amount_minor: 1000000n, direction: 'DEBIT' },
        { account_id: accSalary.id, amount_minor: 10000000n, direction: 'CREDIT' }
      ]
    });

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, userAlice);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(1);

    // Verify Cloud reflects balances
    expect(supabase.accounts.get(accChecking.id)!.balance_minor).toBe(9000000n);
    expect(supabase.accounts.get(accTDS.id)!.balance_minor).toBe(1000000n);
    expect(supabase.accounts.get(accSalary.id)!.balance_minor).toBe(10000000n);
  });

  // Pairwise Case 3: [ASSET -> LIABILITY] × [Peer IOU Settlement] × [Online Direct] × [Multi-User Bilateral] × [INR]
  it('T3-PAIR-03: Asset -> Liability | Peer IOU Settlement | Online Direct | Multi-User Bilateral | INR', () => {
    const aliceBank = supabase.createAccount(userAlice, { name: "Alice HDFC", type: 'ASSET' });
    const bobBank = supabase.createAccount(userBob, { name: "Bob ICICI", type: 'ASSET' });

    // Alice lent 15,000 INR (1,500,000 paise) to Bob
    const aliceIOU = supabase.createIOU(userAlice, {
      counterpartyName: 'Bob',
      direction: 'LENT',
      principalMinor: 1500000n
    });

    // Bob settles partial 5,000 INR (500,000 paise) back to Alice
    // Alice records the settlement
    const { iou: updatedIOU, transaction } = supabase.settleIOU(userAlice, aliceIOU.id, 500000n, aliceBank.id);

    expect(updatedIOU.remaining_balance_minor).toBe(1000000n);
    expect(updatedIOU.status).toBe('PARTIAL');
    expect(transaction.is_deleted).toBe(false);

    // Alice's bank increased by 5,000 INR
    expect(supabase.getAccountById(userAlice, aliceBank.id)!.balance_minor).toBe(500000n);

    // Ensure Bob cannot see Alice's IOU or transaction
    expect(supabase.getIOUs(userBob)).toHaveLength(0);
    expect(supabase.getTransactions(userBob)).toHaveLength(0);
  });

  // Pairwise Case 4: [ASSET -> ASSET] × [Sinking Fund Goal Transfer] × [Offline Sync] × [Single User] × [USD]
  it('T3-PAIR-04: Asset -> Asset | Sinking Fund Goal | Offline Sync | Single User | USD', async () => {
    const accPrimary = supabase.createAccount(userAlice, { name: 'USD Checking', type: 'ASSET', currency: 'USD' });
    const accGoal = supabase.createAccount(userAlice, { name: 'USD Emergency Goal', type: 'ASSET', currency: 'USD' });

    localDb.insertAccount({ id: accPrimary.id, user_id: userAlice.userId, name: 'USD Checking', type: 'ASSET', currency: 'USD' });
    localDb.insertAccount({ id: accGoal.id, user_id: userAlice.userId, name: 'USD Emergency Goal', type: 'ASSET', currency: 'USD' });

    // Transfer $500.00 (50,000 cents) from primary to goal account
    localDb.postTransaction({
      user_id: userAlice.userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Transfer to Emergency Fund',
      entries: [
        { account_id: accGoal.id, amount_minor: 50000n, direction: 'DEBIT' },
        { account_id: accPrimary.id, amount_minor: 50000n, direction: 'CREDIT' }
      ]
    });

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, userAlice);
    expect(syncRes.success).toBe(true);

    expect(supabase.accounts.get(accPrimary.id)!.balance_minor).toBe(-50000n);
    expect(supabase.accounts.get(accGoal.id)!.balance_minor).toBe(50000n);
  });

  // Pairwise Case 5: [LIABILITY -> EXPENSE] × [Multi-Split Interest + Principal] × [Online Direct] × [Single User] × [USD]
  it('T3-PAIR-05: Liability -> Expense | Multi-Split Debt Service | Online Direct | Single User | USD', () => {
    const accBank = supabase.createAccount(userAlice, { name: 'Bank USD', type: 'ASSET', currency: 'USD' });
    const accLoan = supabase.createAccount(userAlice, { name: 'Student Loan', type: 'LIABILITY', currency: 'USD' });
    const accInterest = supabase.createAccount(userAlice, { name: 'Loan Interest Expense', type: 'EXPENSE', currency: 'USD' });

    // Total monthly payment: $1,200.00 ($120,000 cents)
    // Principal reduction: $1,000.00 (100,000 cents)
    // Interest expense: $200.00 (20,000 cents)
    supabase.postTransaction(userAlice, {
      idempotencyKey: crypto.randomUUID(),
      transactionDate: '2026-11-08',
      description: 'Monthly Student Loan EMI Payment',
      entries: [
        { accountId: accLoan.id, amountMinor: 100000n, direction: 'DEBIT' }, // Reduces liability
        { accountId: accInterest.id, amountMinor: 20000n, direction: 'DEBIT' }, // Increases expense
        { accountId: accBank.id, amountMinor: 120000n, direction: 'CREDIT' } // Outflow from bank
      ]
    });

    expect(supabase.getAccountById(userAlice, accLoan.id)!.balance_minor).toBe(-100000n);
    expect(supabase.getAccountById(userAlice, accInterest.id)!.balance_minor).toBe(20000n);
    expect(supabase.getAccountById(userAlice, accBank.id)!.balance_minor).toBe(-120000n);
  });

  // Pairwise Case 6: [EQUITY -> ASSET] × [Capital Injection] × [Offline Sync] × [Single User] × [INR]
  it('T3-PAIR-06: Equity -> Asset | Capital Contribution | Offline Sync | Single User | INR', async () => {
    const accCapital = supabase.createAccount(userAlice, { name: 'Owner Equity', type: 'EQUITY', currency: 'INR' });
    const accBank = supabase.createAccount(userAlice, { name: 'Business Current Acc', type: 'ASSET', currency: 'INR' });

    localDb.insertAccount({ id: accCapital.id, user_id: userAlice.userId, name: 'Owner Equity', type: 'EQUITY' });
    localDb.insertAccount({ id: accBank.id, user_id: userAlice.userId, name: 'Business Current Acc', type: 'ASSET' });

    // Initial equity injection: 500,000 INR (50,000,000 paise)
    localDb.postTransaction({
      user_id: userAlice.userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Founder Initial Equity Investment',
      entries: [
        { account_id: accBank.id, amount_minor: 50000000n, direction: 'DEBIT' },
        { account_id: accCapital.id, amount_minor: 50000000n, direction: 'CREDIT' }
      ]
    });

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, userAlice);
    expect(syncRes.success).toBe(true);

    expect(supabase.accounts.get(accBank.id)!.balance_minor).toBe(50000000n);
    expect(supabase.accounts.get(accCapital.id)!.balance_minor).toBe(50000000n);
  });
});
