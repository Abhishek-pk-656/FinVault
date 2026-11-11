/**
 * Tier 1: Feature Coverage — Offline Client SQLite Storage
 * 
 * Verifies local SQLite database operations (packages/sync-engine),
 * sub-50ms immediate offline writes, mutation outbox queue (sync_queue),
 * and ACID transaction atomicity.
 */

import { describe, it, expect, beforeEach, afterEach } from '../infra/harness.ts';
import { SQLiteHarness } from '../infra/sqlite-harness.ts';
import * as crypto from 'node:crypto';

describe('Tier 1: Offline Client SQLite Storage', () => {
  let harness: SQLiteHarness;
  const userId = crypto.randomUUID();

  beforeEach(() => {
    harness = new SQLiteHarness(':memory:');
  });

  afterEach(() => {
    harness.close();
  });

  // Test 1: Schema initialization
  it('T1-SQLITE-01: initializes client SQLite tables matching PostgreSQL DDL parity', () => {
    const tables: any[] = harness.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('accounts');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('journal_entries');
    expect(tableNames).toContain('iou_records');
    expect(tableNames).toContain('sinking_funds');
    expect(tableNames).toContain('sync_queue');
  });

  // Test 2: Immediate offline writes (< 50ms latency)
  it('T1-SQLITE-02: executes atomic offline transaction write in sub-50ms latency', () => {
    const accBank = harness.insertAccount({ user_id: userId, name: 'Offline Bank', type: 'ASSET' });
    const accFood = harness.insertAccount({ user_id: userId, name: 'Offline Food', type: 'EXPENSE' });

    const startTime = performance.now();
    const { transactionId } = harness.postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Coffee at station',
      entries: [
        { account_id: accFood, amount_minor: 25000n, direction: 'DEBIT' },
        { account_id: accBank, amount_minor: 25000n, direction: 'CREDIT' }
      ]
    });
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(50); // Under 50ms SLA requirement
    expect(typeof transactionId).toBe('string');

    const tx = harness.db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
    expect(tx).toBeDefined();
  });

  // Test 3: Local account balance maintenance
  it('T1-SQLITE-03: dynamically updates local account balances upon transaction commit', () => {
    const accBank = harness.insertAccount({ user_id: userId, name: 'Bank Acc', type: 'ASSET', balance_minor: 100000n });
    const accIncome = harness.insertAccount({ user_id: userId, name: 'Salary', type: 'INCOME', balance_minor: 0n });

    harness.postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Monthly Bonus',
      entries: [
        { account_id: accBank, amount_minor: 50000n, direction: 'DEBIT' },
        { account_id: accIncome, amount_minor: 50000n, direction: 'CREDIT' }
      ]
    });

    const updatedBank = harness.getAccount(accBank);
    const updatedIncome = harness.getAccount(accIncome);

    expect(updatedBank.balance_minor).toBe(150000); // 100,000 + 50,000
    expect(updatedIncome.balance_minor).toBe(50000);  // 0 + 50,000
  });

  // Test 4: Mutation outbox enqueueing
  it('T1-SQLITE-04: automatically enqueues transaction payload into sync_queue with status PENDING', () => {
    const acc1 = harness.insertAccount({ user_id: userId, name: 'Cash', type: 'ASSET' });
    const acc2 = harness.insertAccount({ user_id: userId, name: 'Snacks', type: 'EXPENSE' });

    harness.postTransaction({
      user_id: userId,
      idempotency_key: 'idemp-tx-sync-1',
      transaction_date: '2026-11-08',
      description: 'Offline Snack',
      entries: [
        { account_id: acc2, amount_minor: 1500n, direction: 'DEBIT' },
        { account_id: acc1, amount_minor: 1500n, direction: 'CREDIT' }
      ]
    });

    const pending = harness.getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].entity_type).toBe('transaction');
    expect(pending[0].operation).toBe('INSERT');
    expect(pending[0].status).toBe('PENDING');

    const payload = JSON.parse(pending[0].payload);
    expect(payload.idempotency_key).toBe('idemp-tx-sync-1');
  });

  // Test 5: Atomic rollback on ledger imbalance
  it('T1-SQLITE-05: rolls back entire transaction if entries do not balance', () => {
    const acc1 = harness.insertAccount({ user_id: userId, name: 'Cash', type: 'ASSET', balance_minor: 50000n });
    const acc2 = harness.insertAccount({ user_id: userId, name: 'Dinner', type: 'EXPENSE', balance_minor: 0n });

    expect(() => {
      harness.postTransaction({
        user_id: userId,
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-08',
        description: 'Unbalanced Dinner',
        entries: [
          { account_id: acc2, amount_minor: 20000n, direction: 'DEBIT' },
          { account_id: acc1, amount_minor: 15000n, direction: 'CREDIT' } // 5,000 discrepancy!
        ]
      });
    }).toThrow('Transaction out of balance');

    // Verify no partial state in DB
    const txCount: any = harness.db.prepare('SELECT COUNT(*) as count FROM transactions').get();
    const entryCount: any = harness.db.prepare('SELECT COUNT(*) as count FROM journal_entries').get();
    const queueCount: any = harness.db.prepare('SELECT COUNT(*) as count FROM sync_queue').get();

    expect(txCount.count).toBe(0);
    expect(entryCount.count).toBe(0);
    expect(queueCount.count).toBe(0);

    // Verify balance was not modified
    const acc1After = harness.getAccount(acc1);
    expect(acc1After.balance_minor).toBe(50000);
  });

  // Test 6: Query active accounts filtering archived accounts
  it('T1-SQLITE-06: filters out archived accounts when listing active accounts for user', () => {
    const accActive = harness.insertAccount({ user_id: userId, name: 'Active Wallet', type: 'ASSET' });
    const accArchived = harness.insertAccount({ user_id: userId, name: 'Old Closed Card', type: 'LIABILITY' });

    harness.db.prepare('UPDATE accounts SET is_archived = 1 WHERE id = ?').run(accArchived);

    const activeList = harness.listAccounts(userId);
    expect(activeList).toHaveLength(1);
    expect(activeList[0].id).toBe(accActive);
  });
});
