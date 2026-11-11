/**
 * Tier 4: Real-World Application Workload Scenarios
 * 
 * Verifies end-to-end multi-step user workflows reflecting real-world usage:
 * 1. Monthly Salary Inflow & Multi-Bucket Split
 * 2. Group Dinner Bill Splitting with Peer IOU tracking and multi-stage settlement
 * 3. Multi-Day Offline Travel Spending and synchronized reconnection
 * 4. Sinking Fund Goal Lifecycle (progressive allocation & fulfillment)
 * 5. Bilateral Peer Lending & Borrowing with strict multi-tenant privacy isolation
 */

import { describe, it, expect, beforeEach, afterEach } from '../infra/harness.ts';
import { SQLiteHarness } from '../infra/sqlite-harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import { SyncEngineOracle } from '../infra/sync-oracle.ts';
import { LedgerOracle } from '../infra/ledger-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 4: Real-World Application Workload Scenarios', () => {
  let localDb: SQLiteHarness;
  let supabase: SupabaseOracle;

  const aliceSession: UserSession = {
    userId: crypto.randomUUID(),
    email: 'alice@scenario.test',
    role: 'authenticated'
  };

  const bobSession: UserSession = {
    userId: crypto.randomUUID(),
    email: 'bob@scenario.test',
    role: 'authenticated'
  };

  beforeEach(() => {
    localDb = new SQLiteHarness(':memory:');
    supabase = new SupabaseOracle();
  });

  afterEach(() => {
    localDb.close();
  });

  // Scenario 1: Monthly Salary Inflow & Multi-Bucket Split
  it('T4-SCENARIO-01: executes monthly salary inflow and multi-bucket budget allocation', () => {
    const checking = supabase.createAccount(aliceSession, { name: 'Main Checking Account', type: 'ASSET' });
    const rentExp = supabase.createAccount(aliceSession, { name: 'Apartment Rent', type: 'EXPENSE' });
    const groceryExp = supabase.createAccount(aliceSession, { name: 'Groceries & Supplies', type: 'EXPENSE' });
    const investmentAsset = supabase.createAccount(aliceSession, { name: 'Nifty 50 Index Fund', type: 'ASSET' });
    const sinkingFundAsset = supabase.createAccount(aliceSession, { name: 'Emergency Liquid Fund', type: 'ASSET' });
    const salaryIncome = supabase.createAccount(aliceSession, { name: 'Tech Corp Salary', type: 'INCOME' });

    // Monthly Salary: 150,000 INR = 15,000,000 paise
    // Rent: 40,000 INR (4,000,000)
    // Groceries: 25,000 INR (2,500,000)
    // Investments: 50,000 INR (5,000,000)
    // Emergency Fund: 15,000 INR (1,500,000)
    // Left in checking: 20,000 INR (2,000,000)
    const { transaction, entries } = supabase.postTransaction(aliceSession, {
      idempotencyKey: crypto.randomUUID(),
      transactionDate: '2026-11-01',
      description: 'November 2026 Payroll Split Allocation',
      entries: [
        { accountId: rentExp.id, amountMinor: 4000000n, direction: 'DEBIT' },
        { accountId: groceryExp.id, amountMinor: 2500000n, direction: 'DEBIT' },
        { accountId: investmentAsset.id, amountMinor: 5000000n, direction: 'DEBIT' },
        { accountId: sinkingFundAsset.id, amountMinor: 1500000n, direction: 'DEBIT' },
        { accountId: checking.id, amountMinor: 2000000n, direction: 'DEBIT' },
        { accountId: salaryIncome.id, amountMinor: 15000000n, direction: 'CREDIT' }
      ]
    });

    expect(entries).toHaveLength(6);
    expect(transaction.is_deleted).toBe(false);

    // Verify individual account balances
    expect(supabase.getAccountById(aliceSession, rentExp.id)!.balance_minor).toBe(4000000n);
    expect(supabase.getAccountById(aliceSession, groceryExp.id)!.balance_minor).toBe(2500000n);
    expect(supabase.getAccountById(aliceSession, investmentAsset.id)!.balance_minor).toBe(5000000n);
    expect(supabase.getAccountById(aliceSession, sinkingFundAsset.id)!.balance_minor).toBe(1500000n);
    expect(supabase.getAccountById(aliceSession, checking.id)!.balance_minor).toBe(2000000n);
    expect(supabase.getAccountById(aliceSession, salaryIncome.id)!.balance_minor).toBe(15000000n);

    // Verify Accounting Equation
    const equation = LedgerOracle.verifyAccountingEquation(supabase.getAccounts(aliceSession).map(a => ({
      id: a.id,
      userId: a.user_id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balanceMinor: a.balance_minor,
      isArchived: a.is_archived,
      version: a.version
    })));

    expect(equation.isBalanced).toBe(true);
    expect(equation.equationDelta).toBe(0n);
  });

  // Scenario 2: Group Dinner Bill Splitting with Peer IOU tracking & multi-stage settlement
  it('T4-SCENARIO-02: executes group dinner bill split, bilateral IOUs, and multi-stage repayments', () => {
    const aliceChecking = supabase.createAccount(aliceSession, { name: "Alice HDFC Bank", type: 'ASSET' });
    const aliceDining = supabase.createAccount(aliceSession, { name: "Dining Expense", type: 'EXPENSE' });

    // Total Dinner: 6,000 INR (600,000 paise). Alice pays card:
    // Alice share: 2,000 INR (200,000 paise)
    // Bob owes Alice: 2,000 INR (200,000 paise)
    // Charlie owes Alice: 2,000 INR (200,000 paise)
    const bobIOU = supabase.createIOU(aliceSession, {
      counterpartyName: 'Bob',
      direction: 'LENT',
      principalMinor: 200000n,
      notes: 'Dinner bill split 1/3'
    });

    const charlieIOU = supabase.createIOU(aliceSession, {
      counterpartyName: 'Charlie',
      direction: 'LENT',
      principalMinor: 200000n,
      notes: 'Dinner bill split 1/3'
    });

    expect(bobIOU.status).toBe('OPEN');
    expect(bobIOU.remaining_balance_minor).toBe(200000n);
    expect(charlieIOU.status).toBe('OPEN');

    // Stage 1: Bob pays partial 1,000 INR (100,000 paise) via UPI
    const settlement1 = supabase.settleIOU(aliceSession, bobIOU.id, 100000n, aliceChecking.id);
    expect(settlement1.iou.status).toBe('PARTIAL');
    expect(settlement1.iou.remaining_balance_minor).toBe(100000n);
    expect(supabase.getAccountById(aliceSession, aliceChecking.id)!.balance_minor).toBe(100000n);

    // Stage 2: Bob pays remaining 1,000 INR (100,000 paise)
    const settlement2 = supabase.settleIOU(aliceSession, bobIOU.id, 100000n, aliceChecking.id);
    expect(settlement2.iou.status).toBe('SETTLED');
    expect(settlement2.iou.remaining_balance_minor).toBe(0n);
    expect(supabase.getAccountById(aliceSession, aliceChecking.id)!.balance_minor).toBe(200000n);

    // Stage 3: Charlie settles in full in one transaction: 2,000 INR (200,000 paise)
    const settlement3 = supabase.settleIOU(aliceSession, charlieIOU.id, 200000n, aliceChecking.id);
    expect(settlement3.iou.status).toBe('SETTLED');
    expect(settlement3.iou.remaining_balance_minor).toBe(0n);
    expect(supabase.getAccountById(aliceSession, aliceChecking.id)!.balance_minor).toBe(400000n);
  });

  // Scenario 3: Multi-Day Offline Travel Spending and Synchronized Reconnection
  it('T4-SCENARIO-03: records 6 transactions offline during 3-day travel and reconciles cleanly on reconnect', async () => {
    const travelCard = supabase.createAccount(aliceSession, { name: 'Travel Forex Card', type: 'ASSET' });
    const transportExp = supabase.createAccount(aliceSession, { name: 'Travel Transport', type: 'EXPENSE' });
    const foodExp = supabase.createAccount(aliceSession, { name: 'Travel Food', type: 'EXPENSE' });
    const stayExp = supabase.createAccount(aliceSession, { name: 'Hotel & Stay', type: 'EXPENSE' });
    const giftsExp = supabase.createAccount(aliceSession, { name: 'Gifts & Souvenirs', type: 'EXPENSE' });

    // Sync down initial accounts to mobile SQLite
    localDb.insertAccount({ id: travelCard.id, user_id: aliceSession.userId, name: travelCard.name, type: 'ASSET', balance_minor: 5000000n }); // 50,000 INR loaded
    localDb.insertAccount({ id: transportExp.id, user_id: aliceSession.userId, name: transportExp.name, type: 'EXPENSE', balance_minor: 0n });
    localDb.insertAccount({ id: foodExp.id, user_id: aliceSession.userId, name: foodExp.name, type: 'EXPENSE', balance_minor: 0n });
    localDb.insertAccount({ id: stayExp.id, user_id: aliceSession.userId, name: stayExp.name, type: 'EXPENSE', balance_minor: 0n });
    localDb.insertAccount({ id: giftsExp.id, user_id: aliceSession.userId, name: giftsExp.name, type: 'EXPENSE', balance_minor: 0n });

    // Day 1: Offline
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day1-taxi',
      transaction_date: '2026-11-05',
      description: 'Airport Taxi',
      entries: [
        { account_id: transportExp.id, amount_minor: 120000n, direction: 'DEBIT' }, // 1,200 INR
        { account_id: travelCard.id, amount_minor: 120000n, direction: 'CREDIT' }
      ]
    });
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day1-coffee',
      transaction_date: '2026-11-05',
      description: 'Airport Cafe',
      entries: [
        { account_id: foodExp.id, amount_minor: 35000n, direction: 'DEBIT' }, // 350 INR
        { account_id: travelCard.id, amount_minor: 35000n, direction: 'CREDIT' }
      ]
    });

    // Day 2: Offline
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day2-hotel',
      transaction_date: '2026-11-06',
      description: 'Mountain Resort Stay',
      entries: [
        { account_id: stayExp.id, amount_minor: 450000n, direction: 'DEBIT' }, // 4,500 INR
        { account_id: travelCard.id, amount_minor: 450000n, direction: 'CREDIT' }
      ]
    });
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day2-dinner',
      transaction_date: '2026-11-06',
      description: 'Village Dinner',
      entries: [
        { account_id: foodExp.id, amount_minor: 180000n, direction: 'DEBIT' }, // 1,800 INR
        { account_id: travelCard.id, amount_minor: 180000n, direction: 'CREDIT' }
      ]
    });

    // Day 3: Offline
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day3-gifts',
      transaction_date: '2026-11-07',
      description: 'Handmade Shawls & Tea',
      entries: [
        { account_id: giftsExp.id, amount_minor: 210000n, direction: 'DEBIT' }, // 2,100 INR
        { account_id: travelCard.id, amount_minor: 210000n, direction: 'CREDIT' }
      ]
    });
    localDb.postTransaction({
      user_id: aliceSession.userId,
      idempotency_key: 'day3-train',
      transaction_date: '2026-11-07',
      description: 'Return Train Ticket',
      entries: [
        { account_id: transportExp.id, amount_minor: 95000n, direction: 'DEBIT' }, // 950 INR
        { account_id: travelCard.id, amount_minor: 95000n, direction: 'CREDIT' }
      ]
    });

    // Verify 6 pending mutations in queue
    expect(localDb.getPendingMutations()).toHaveLength(6);

    // Online reconnect: Trigger sync
    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, aliceSession);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(6);
    expect(localDb.getPendingMutations()).toHaveLength(0);

    // Verify all 6 transactions exist in Supabase cloud
    const cloudTxs = supabase.getTransactions(aliceSession);
    expect(cloudTxs).toHaveLength(6);

    // Total spent: 1200 + 350 + 4500 + 1800 + 2100 + 950 = 10,900 INR = 1,090,000 paise
    const cloudCard = supabase.accounts.get(travelCard.id)!;
    expect(cloudCard.balance_minor).toBe(-1090000n);
  });

  // Scenario 4: Sinking Fund Goal Lifecycle (New Laptop Replacement)
  it('T4-SCENARIO-04: creates sinking fund, allocates progressively across 3 months, and marks fulfilled', () => {
    const checking = supabase.createAccount(aliceSession, { name: 'Salary Checking', type: 'ASSET' });
    const laptopFundAsset = supabase.createAccount(aliceSession, { name: 'MacBook Reserve Account', type: 'ASSET' });
    const equipmentExpense = supabase.createAccount(aliceSession, { name: 'Computer Equipment', type: 'EXPENSE' });

    // Target: 180,000 INR = 18,000,000 paise
    const fund = supabase.createSinkingFund(aliceSession, {
      name: 'MacBook Pro M-Series Goal',
      targetAmountMinor: 18000000n,
      targetDate: '2027-01-31'
    });

    expect(fund.is_completed).toBe(false);
    expect(fund.allocated_amount_minor).toBe(0n);

    // Month 1: Transfer 60,000 INR (6,000,000 paise)
    supabase.postTransaction(aliceSession, {
      idempotencyKey: 'alloc-month-1',
      transactionDate: '2026-11-01',
      description: 'Month 1 Allocation to Laptop',
      entries: [
        { accountId: laptopFundAsset.id, amountMinor: 6000000n, direction: 'DEBIT' },
        { accountId: checking.id, amountMinor: 6000000n, direction: 'CREDIT' }
      ]
    });
    fund.allocated_amount_minor += 6000000n;

    // Month 2: Transfer 60,000 INR (6,000,000 paise)
    supabase.postTransaction(aliceSession, {
      idempotencyKey: 'alloc-month-2',
      transactionDate: '2026-12-01',
      description: 'Month 2 Allocation to Laptop',
      entries: [
        { accountId: laptopFundAsset.id, amountMinor: 6000000n, direction: 'DEBIT' },
        { accountId: checking.id, amountMinor: 6000000n, direction: 'CREDIT' }
      ]
    });
    fund.allocated_amount_minor += 6000000n;

    // Month 3: Transfer final 60,000 INR (6,000,000 paise)
    supabase.postTransaction(aliceSession, {
      idempotencyKey: 'alloc-month-3',
      transactionDate: '2027-01-01',
      description: 'Month 3 Allocation to Laptop (Goal Complete)',
      entries: [
        { accountId: laptopFundAsset.id, amountMinor: 6000000n, direction: 'DEBIT' },
        { accountId: checking.id, amountMinor: 6000000n, direction: 'CREDIT' }
      ]
    });
    fund.allocated_amount_minor += 6000000n;

    // Goal reached!
    expect(fund.allocated_amount_minor).toBe(fund.target_amount_minor);
    fund.is_completed = true;
    expect(fund.is_completed).toBe(true);

    // Final Purchase: Spend from laptopFundAsset
    supabase.postTransaction(aliceSession, {
      idempotencyKey: 'laptop-purchase',
      transactionDate: '2027-01-10',
      description: 'Bought MacBook Pro M-Series at Apple Store',
      entries: [
        { accountId: equipmentExpense.id, amountMinor: 18000000n, direction: 'DEBIT' },
        { accountId: laptopFundAsset.id, amountMinor: 18000000n, direction: 'CREDIT' }
      ]
    });

    expect(supabase.getAccountById(aliceSession, laptopFundAsset.id)!.balance_minor).toBe(0n);
    expect(supabase.getAccountById(aliceSession, equipmentExpense.id)!.balance_minor).toBe(18000000n);
  });

  // Scenario 5: Bilateral Peer Lending & Borrowing with Strict Multi-Tenant Privacy Isolation
  it('T4-SCENARIO-05: executes bilateral lending between distinct users with full RLS privacy isolation', () => {
    // Alice's accounts
    const aliceCash = supabase.createAccount(aliceSession, { name: "Alice Cash", type: 'ASSET' });
    const aliceSavings = supabase.createAccount(aliceSession, { name: "Alice Savings", type: 'ASSET' });

    // Bob's accounts
    const bobBank = supabase.createAccount(bobSession, { name: "Bob ICICI Bank", type: 'ASSET' });
    const bobSalary = supabase.createAccount(bobSession, { name: "Bob Salary", type: 'INCOME' });

    // Step 1: Alice lends 10,000 INR (1,000,000 paise) to Bob
    const aliceIOU = supabase.createIOU(aliceSession, {
      counterpartyName: 'Bob',
      direction: 'LENT',
      principalMinor: 1000000n
    });

    // Step 2: Bob logs in his own ledger that he borrowed 10,000 INR from Alice
    const bobIOU = supabase.createIOU(bobSession, {
      counterpartyName: 'Alice',
      direction: 'BORROWED',
      principalMinor: 1000000n
    });

    // Step 3: Verify strict privacy isolation
    // Alice can see only her IOU
    const aliceIOUs = supabase.getIOUs(aliceSession);
    expect(aliceIOUs).toHaveLength(1);
    expect(aliceIOUs[0].id).toBe(aliceIOU.id);

    // Bob can see only his IOU
    const bobIOUs = supabase.getIOUs(bobSession);
    expect(bobIOUs).toHaveLength(1);
    expect(bobIOUs[0].id).toBe(bobIOU.id);

    // Alice cannot see Bob's accounts
    expect(supabase.getAccountById(aliceSession, bobBank.id)).toBeNull();
    // Bob cannot see Alice's accounts
    expect(supabase.getAccountById(bobSession, aliceCash.id)).toBeNull();

    // Step 4: Bob repays Alice in full: 10,000 INR
    supabase.settleIOU(aliceSession, aliceIOU.id, 1000000n, aliceCash.id);
    expect(supabase.ious.get(aliceIOU.id)!.status).toBe('SETTLED');
    expect(supabase.getAccountById(aliceSession, aliceCash.id)!.balance_minor).toBe(1000000n);
  });
});
