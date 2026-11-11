/**
/**
 * Test prototype for Mobile Automated Verification Harness
 * Verifies that the proposed test suite executes cleanly and passes all 10 checks.
 */

import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  initDatabase,
  postTransaction,
  settleIOU,
  getAccounts,
  enqueueMutation,
  NodeSQLiteAdapter,
  CLIENT_SQLITE_SCHEMA
} from '../../../packages/sync-engine/src/index.ts';

describe('FinVault Mobile Automated Verification Harness', () => {
  let adapter: NodeSQLiteAdapter;
  const userId = crypto.randomUUID();

  beforeEach(async () => {
    adapter = new NodeSQLiteAdapter(':memory:');
    await adapter.exec('PRAGMA foreign_keys = ON;');
    await adapter.exec(CLIENT_SQLITE_SCHEMA);
    await initDatabase(':memory:', adapter);
  });

  // Check 1: Mobile SQLite store initialization
  test('M01: initializes mobile SQLite store with complete FinVault schema', async () => {
    const tables = await adapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const names = tables.map(t => t.name);
    assert.ok(names.includes('accounts'), 'accounts table missing');
    assert.ok(names.includes('transactions'), 'transactions table missing');
    assert.ok(names.includes('journal_entries'), 'journal_entries table missing');
    assert.ok(names.includes('iou_records'), 'iou_records table missing');
    assert.ok(names.includes('sinking_funds'), 'sinking_funds table missing');
    assert.ok(names.includes('sync_queue'), 'sync_queue table missing');
  });

  // Check 2: Sub-50ms offline write latency SLA
  test('M02: executes offline transaction write in sub-50ms latency SLA', async () => {
    const accBankId = crypto.randomUUID();
    const accFoodId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 100000, ?, ?, 1),
              (?, ?, 'Dining Out', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
      [accBankId, userId, now, now, accFoodId, userId, now, now]
    );

    const startTime = performance.now();
    const tx = await postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-09',
      description: 'Quick Coffee Offline',
      entries: [
        { account_id: accFoodId, amount_minor: 25000n, direction: 'DEBIT' },
        { account_id: accBankId, amount_minor: 25000n, direction: 'CREDIT' }
      ]
    }, userId);
    const elapsed = performance.now() - startTime;

    assert.ok(elapsed < 50, `Write latency ${elapsed.toFixed(2)}ms exceeded 50ms SLA`);
    assert.ok(tx.id, 'Transaction ID should be returned');
  });

  // Check 3: Dynamic balance updates according to accounting signs
  test('M03: updates account balances dynamically upon commit', async () => {
    const accBankId = crypto.randomUUID();
    const accExpenseId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 500000, ?, ?, 1),
              (?, ?, 'Office Supplies', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
      [accBankId, userId, now, now, accExpenseId, userId, now, now]
    );

    await postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-09',
      description: 'Notebooks',
      entries: [
        { account_id: accExpenseId, amount_minor: 120000n, direction: 'DEBIT' },
        { account_id: accBankId, amount_minor: 120000n, direction: 'CREDIT' }
      ]
    }, userId);

    const accounts = await getAccounts(userId);
    const bank = accounts.find(a => a.id === accBankId);
    const expense = accounts.find(a => a.id === accExpenseId);

    assert.equal(bank?.balance_minor, 380000n, 'Bank balance should be 500,000 - 120,000 = 380,000');
    assert.equal(expense?.balance_minor, 120000n, 'Expense balance should be 120,000');
  });

  // Check 4: Multi-split balanced transactions
  test('M04: executes 4-way multi-split balanced transaction atomically', async () => {
    const accIncomeId = crypto.randomUUID();
    const accCheckingId = crypto.randomUUID();
    const accSavingsId = crypto.randomUUID();
    const accTaxId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Consulting Income', 'INCOME', 'INR', 0, ?, ?, 1),
              (?, ?, 'Checking', 'ASSET', 'INR', 0, ?, ?, 1),
              (?, ?, 'Savings', 'ASSET', 'INR', 0, ?, ?, 1),
              (?, ?, 'TDS Tax', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
      [accIncomeId, userId, now, now, accCheckingId, userId, now, now, accSavingsId, userId, now, now, accTaxId, userId, now, now]
    );

    // Income = 100,000; Checking = 70,000; Savings = 20,000; Tax = 10,000
    await postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-09',
      description: 'Consulting Payout Split',
      entries: [
        { account_id: accIncomeId, amount_minor: 10000000n, direction: 'CREDIT' },
        { account_id: accCheckingId, amount_minor: 7000000n, direction: 'DEBIT' },
        { account_id: accSavingsId, amount_minor: 2000000n, direction: 'DEBIT' },
        { account_id: accTaxId, amount_minor: 1000000n, direction: 'DEBIT' }
      ]
    }, userId);

    const accounts = await getAccounts(userId);
    const income = accounts.find(a => a.id === accIncomeId);
    const checking = accounts.find(a => a.id === accCheckingId);
    const savings = accounts.find(a => a.id === accSavingsId);
    const tax = accounts.find(a => a.id === accTaxId);

    assert.equal(income?.balance_minor, 10000000n);
    assert.equal(checking?.balance_minor, 7000000n);
    assert.equal(savings?.balance_minor, 2000000n);
    assert.equal(tax?.balance_minor, 1000000n);
  });

  // Check 5: Rejection of unbalanced entries & complete atomic rollback
  test('M05: rejects unbalanced entries and rolls back completely', async () => {
    const accBankId = crypto.randomUUID();
    const accFoodId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 50000, ?, ?, 1),
              (?, ?, 'Food', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
      [accBankId, userId, now, now, accFoodId, userId, now, now]
    );

    await assert.rejects(
      async () => {
        await postTransaction({
          user_id: userId,
          idempotency_key: crypto.randomUUID(),
          transaction_date: '2026-11-09',
          description: 'Unbalanced Coffee',
          entries: [
            { account_id: accFoodId, amount_minor: 25000n, direction: 'DEBIT' },
            { account_id: accBankId, amount_minor: 20000n, direction: 'CREDIT' } // 5000 mismatch!
          ]
        }, userId);
      },
      /Double-entry invariant violated/
    );

    // Verify zero transactions or journal entries inserted
    const txs = await adapter.query('SELECT * FROM transactions WHERE user_id = ?', [userId]);
    const entries = await adapter.query('SELECT * FROM journal_entries WHERE user_id = ?', [userId]);
    const accounts = await getAccounts(userId);
    const bank = accounts.find(a => a.id === accBankId);

    assert.equal(txs.length, 0, 'No transaction should be created');
    assert.equal(entries.length, 0, 'No journal entries should be created');
    assert.equal(bank?.balance_minor, 50000n, 'Account balance must remain unmutated');
  });

  // Check 6: IOU creation and bilateral balance tracking
  test('M06: creates and tracks peer lending IOU record', async () => {
    const iouId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
       VALUES (?, ?, 'Alice Smith', 'LENT', 500000, 500000, 'INR', 'OPEN', ?, ?, 1)`,
      [iouId, userId, now, now]
    );

    const rows = await adapter.query<any>('SELECT * FROM iou_records WHERE id = ?', [iouId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].counterparty_name, 'Alice Smith');
    assert.equal(rows[0].direction, 'LENT');
    assert.equal(rows[0].remaining_balance_minor, 500000n);
    assert.equal(rows[0].status, 'OPEN');
  });

  // Check 7: Contra clearing settlement for IOUs
  test('M07: settles IOU with contra clearing and updates status', async () => {
    const iouId = crypto.randomUUID();
    const accBankId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 1000000, ?, ?, 1)`,
      [accBankId, userId, now, now]
    );

    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
       VALUES (?, ?, 'Bob Johnson', 'LENT', 500000, 500000, 'INR', 'OPEN', ?, ?, 1)`,
      [iouId, userId, now, now]
    );

    // Partial settlement of ₹2,000 (200000 minor units)
    const { iou: partialIou } = await settleIOU(iouId, 200000n, accBankId, userId);
    assert.equal(partialIou.remaining_balance_minor, 300000n);
    assert.equal(partialIou.status, 'PARTIAL');

    // Final settlement of remaining ₹3,000 (300000 minor units)
    const { iou: finalIou } = await settleIOU(iouId, 300000n, accBankId, userId);
    assert.equal(finalIou.remaining_balance_minor, 0n);
    assert.equal(finalIou.status, 'SETTLED');
  });

  // Check 8: Background sync queue outbox generation
  test('M08: automatically enqueues mutations into sync_queue with status PENDING', async () => {
    const accBankId = crypto.randomUUID();
    const accFoodId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 50000, ?, ?, 1),
              (?, ?, 'Food', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
      [accBankId, userId, now, now, accFoodId, userId, now, now]
    );

    const idempotencyKey = crypto.randomUUID();
    await postTransaction({
      user_id: userId,
      idempotency_key: idempotencyKey,
      transaction_date: '2026-11-09',
      description: 'Sync Queue Generation Test',
      entries: [
        { account_id: accFoodId, amount_minor: 1500n, direction: 'DEBIT' },
        { account_id: accBankId, amount_minor: 1500n, direction: 'CREDIT' }
      ]
    }, userId);

    const queueRows = await adapter.query<any>(
      "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY timestamp ASC"
    );
    assert.ok(queueRows.length >= 1, 'Sync queue should have at least 1 pending item');
    const item = queueRows[queueRows.length - 1];
    assert.equal(item.status, 'PENDING');
    assert.equal(item.operation, 'INSERT');

    const payload = JSON.parse(item.payload);
    assert.equal(payload.idempotency_key, idempotencyKey);
  });

  // Check 9: Rejection of overpayment on IOU settlement
  test('M09: rejects overpayment exceeding remaining IOU balance', async () => {
    const iouId = crypto.randomUUID();
    const accBankId = crypto.randomUUID();
    const now = new Date().toISOString();

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Bank Checking', 'ASSET', 'INR', 1000000, ?, ?, 1)`,
      [accBankId, userId, now, now]
    );

    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
       VALUES (?, ?, 'Charlie', 'LENT', 200000, 200000, 'INR', 'OPEN', ?, ?, 1)`,
      [iouId, userId, now, now]
    );

    await assert.rejects(
      async () => {
        // Attempt to settle ₹3,000 on a ₹2,000 IOU
        await settleIOU(iouId, 300000n, accBankId, userId);
      },
      /Settlement amount .* exceeds remaining balance/
    );
  });

  // Check 10: Strict BIGINT precision preservation beyond Number.MAX_SAFE_INTEGER
  test('M10: preserves exact 64-bit integer values beyond Number.MAX_SAFE_INTEGER', async () => {
    const accBankId = crypto.randomUUID();
    const accEquityId = crypto.randomUUID();
    const now = new Date().toISOString();
    const extremeAmount = 9007199254740993n; // MAX_SAFE_INTEGER + 2

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES (?, ?, 'Sovereign Wealth Vault', 'ASSET', 'INR', 0, ?, ?, 1),
              (?, ?, 'Capital Contribution', 'EQUITY', 'INR', 0, ?, ?, 1)`,
      [accBankId, userId, now, now, accEquityId, userId, now, now]
    );

    await postTransaction({
      user_id: userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-09',
      description: 'Massive Capital Infusion',
      entries: [
        { account_id: accBankId, amount_minor: extremeAmount, direction: 'DEBIT' },
        { account_id: accEquityId, amount_minor: extremeAmount, direction: 'CREDIT' }
      ]
    }, userId);

    const accounts = await getAccounts(userId);
    const bank = accounts.find(a => a.id === accBankId);
    assert.equal(bank?.balance_minor, extremeAmount);
  });
});
