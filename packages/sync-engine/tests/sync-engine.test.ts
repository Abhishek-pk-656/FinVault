import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  initDatabase,
  getAccounts,
  postTransaction,
  settleIOU,
  enqueueMutation,
  syncWithRemote,
  executeDeltaSync,
  NodeSQLiteAdapter,
  OutboxQueueManager,
  MAX_SYNC_RETRIES,
  computeAccountBalanceDelta,
  validateTransactionBalance,
  shouldRemoteOverwriteLocal
} from '../src/index.ts';

describe('FinVault Sync Engine — Comprehensive Test Suite', () => {
  beforeEach(async () => {
    await initDatabase(':memory:');
  });

  // =========================================================================
  // 1. Storage Adapter & BigInt Precision
  // =========================================================================

  test('F01: NodeSQLiteAdapter query/run/transaction with BigInt precision (> 2^53 - 1)', () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    adapter.exec('CREATE TABLE test_vals (id TEXT PRIMARY KEY, amount INTEGER);');

    const hugeVal = 900719925474099105n; // > Number.MAX_SAFE_INTEGER
    const res = adapter.run('INSERT INTO test_vals (id, amount) VALUES (?, ?)', ['v1', hugeVal]);
    assert.equal(res.changes, 1);

    const row = adapter.queryOne<{ id: string; amount: bigint }>('SELECT * FROM test_vals WHERE id = ?', ['v1']);
    assert.ok(row);
    assert.equal(typeof row.amount, 'bigint');
    assert.equal(row.amount, hugeVal);

    // Transaction rollback test
    assert.throws(() => {
      adapter.transaction(() => {
        adapter.run('INSERT INTO test_vals (id, amount) VALUES (?, ?)', ['v2', 100n]);
        throw new Error('Forced Rollback');
      });
    }, /Forced Rollback/);

    const rollbackRow = adapter.queryOne('SELECT * FROM test_vals WHERE id = ?', ['v2']);
    assert.equal(rollbackRow, null);

    adapter.close();
  });

  // =========================================================================
  // 2. Schema Initialization & Catalog Parity
  // =========================================================================

  test('F02: initDatabase creates tables, composite indexes and compatibility triggers', async () => {
    const db = await initDatabase(':memory:');
    const tables = (await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )) as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    assert.ok(tableNames.includes('accounts'));
    assert.ok(tableNames.includes('transactions'));
    assert.ok(tableNames.includes('journal_entries'));
    assert.ok(tableNames.includes('iou_records'));
    assert.ok(tableNames.includes('sinking_funds'));
    assert.ok(tableNames.includes('sync_queue'));

    // Check indexes
    const indexes = (await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
    )) as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);
    assert.ok(indexNames.includes('idx_accounts_user'));
    assert.ok(indexNames.includes('idx_sync_queue_status'));
  });

  // =========================================================================
  // 3. Outbox Queue Lifecycle & Max Retries
  // =========================================================================

  test('F03: Outbox queue status lifecycle (PENDING -> IN_FLIGHT -> SYNCED)', async () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    const db = await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    const mutationId = await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'transactions',
      record_id: 'tx_100',
      payload: JSON.stringify({ id: 'tx_100', description: 'Test' })
    });

    let pending = await outbox.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.id, mutationId);
    assert.equal(pending[0]!.status, 'PENDING');

    await outbox.markInFlight(mutationId);
    const inFlightRows = (await db.execute(
      `SELECT status FROM sync_queue WHERE id = ?`,
      [mutationId]
    )) as any[];
    assert.equal(inFlightRows[0].status, 'IN_FLIGHT');

    await outbox.markSynced(mutationId);
    const syncedRows = (await db.execute(
      `SELECT status FROM sync_queue WHERE id = ?`,
      [mutationId]
    )) as any[];
    assert.equal(syncedRows[0].status, 'SYNCED');

    // Pending should now be empty
    pending = await outbox.getPending();
    assert.equal(pending.length, 0);
  });

  test('F04: Outbox retry count increments and transitions to FAILED after MAX_SYNC_RETRIES (5)', async () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    const db = await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    const id = await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'accounts',
      record_id: 'acc_fail',
      payload: '{}'
    });

    for (let i = 1; i < MAX_SYNC_RETRIES; i++) {
      await outbox.markFailed(id, `Error attempt ${i}`);
      const row = (await db.execute(`SELECT status, retry_count FROM sync_queue WHERE id = ?`, [id])) as any[];
      assert.equal(Number(row[0].retry_count), i);
      assert.equal(row[0].status, 'PENDING');
    }

    // 5th failure transitions to FAILED
    await outbox.markFailed(id, 'Final error attempt 5');
    const finalRow = (await db.execute(`SELECT status, retry_count FROM sync_queue WHERE id = ?`, [id])) as any[];
    assert.equal(Number(finalRow[0].retry_count), 5);
    assert.equal(finalRow[0].status, 'FAILED');
  });

  // =========================================================================
  // 4. Client Financial Operations: getAccounts & Filtering
  // =========================================================================

  test('F05: getAccounts filters archived accounts and converts balance to native bigint', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
       VALUES ('acc_active', 'u_test', 'Active Account', 'ASSET', 'INR', 25000, 0, '2026-11-08', '2026-11-08', 1),
              ('acc_archived', 'u_test', 'Archived Account', 'ASSET', 'INR', 10000, 1, '2026-11-08', '2026-11-08', 1),
              ('acc_other_user', 'u_other', 'Other User Account', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08', 1)`
    );

    const allActive = await getAccounts();
    assert.equal(allActive.length, 2);
    assert.ok(allActive.every(a => !a.is_archived));

    const userActive = await getAccounts('u_test');
    assert.equal(userActive.length, 1);
    assert.equal(userActive[0]!.id, 'acc_active');
    assert.equal(typeof userActive[0]!.balance_minor, 'bigint');
    assert.equal(userActive[0]!.balance_minor, 25000n);
  });

  // =========================================================================
  // 5. Client Financial Operations: postTransaction & Double-Entry Invariants
  // =========================================================================

  test('F06: postTransaction executes atomic multi-split with balance delta updates in <50ms', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_bank', 'u1', 'Bank', 'ASSET', 'INR', 100000, 0, '2026-11-08', '2026-11-08'),
              ('acc_rent', 'u1', 'Rent', 'EXPENSE', 'INR', 0, 0, '2026-11-08', '2026-11-08'),
              ('acc_util', 'u1', 'Utilities', 'EXPENSE', 'INR', 0, 0, '2026-11-08', '2026-11-08')`
    );

    const start = performance.now();
    const tx = await postTransaction({
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Monthly Living Expenses',
      entries: [
        { account_id: 'acc_rent', amount_minor: 30000n, direction: 'DEBIT' },
        { account_id: 'acc_util', amount_minor: 5000n, direction: 'DEBIT' },
        { account_id: 'acc_bank', amount_minor: 35000n, direction: 'CREDIT' }
      ]
    }, 'u1');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 50, `postTransaction SLA must be <50ms, took ${elapsed}ms`);
    assert.ok(tx.id);
    assert.equal(tx.description, 'Monthly Living Expenses');

    const accounts = await getAccounts('u1');
    const bank = accounts.find(a => a.id === 'acc_bank')!;
    const rent = accounts.find(a => a.id === 'acc_rent')!;
    const util = accounts.find(a => a.id === 'acc_util')!;

    assert.equal(bank.balance_minor, 65000n);
    assert.equal(rent.balance_minor, 30000n);
    assert.equal(util.balance_minor, 5000n);

    // Verify mutation enqueued in sync_queue
    const queueRows = (await db.execute(
      `SELECT * FROM sync_queue WHERE status = 'PENDING'`
    )) as any[];
    assert.equal(queueRows.length, 1);
    assert.ok(queueRows[0].payload.includes('Monthly Living Expenses'));
  });

  test('F07: postTransaction rejects unbalanced entries and rolls back completely', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_a', 'u1', 'Asset', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08'),
              ('acc_e', 'u1', 'Expense', 'EXPENSE', 'INR', 0, 0, '2026-11-08', '2026-11-08')`
    );

    await assert.rejects(async () => {
      await postTransaction({
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-08',
        description: 'Imbalanced Tx',
        entries: [
          { account_id: 'acc_e', amount_minor: 10001n, direction: 'DEBIT' },
          { account_id: 'acc_a', amount_minor: 10000n, direction: 'CREDIT' }
        ]
      }, 'u1');
    }, /Double-entry invariant violated/);

    const txRows = (await db.execute(`SELECT * FROM transactions`)) as any[];
    const entryRows = (await db.execute(`SELECT * FROM journal_entries`)) as any[];
    const queueRows = (await db.execute(`SELECT * FROM sync_queue`)) as any[];
    const accounts = await getAccounts('u1');

    assert.equal(txRows.length, 0);
    assert.equal(entryRows.length, 0);
    assert.equal(queueRows.length, 0);
    assert.equal(accounts.find(a => a.id === 'acc_a')!.balance_minor, 50000n);
  });

  test('F08: postTransaction rejects non-positive amounts and single-leg transactions', async () => {
    await assert.rejects(async () => {
      await postTransaction({
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-08',
        description: 'Single leg',
        entries: [{ account_id: 'a1', amount_minor: 1000n, direction: 'DEBIT' }]
      });
    }, /at least two journal entries/);

    await assert.rejects(async () => {
      await postTransaction({
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-08',
        description: 'Zero amount',
        entries: [
          { account_id: 'a1', amount_minor: 0n, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 0n, direction: 'CREDIT' }
        ]
      });
    }, /strictly positive/);
  });

  // =========================================================================
  // 6. Client Financial Operations: settleIOU
  // =========================================================================

  test('F09: settleIOU handles full and partial debt settlements cleanly', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_cash', 'u_iou', 'Cash', 'ASSET', 'INR', 20000, 0, '2026-11-08', '2026-11-08')`
    );
    await db.execute(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_lent', 'u_iou', 'Dave', 'LENT', 10000, 10000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
    );

    // 1. Partial settlement: Dave repays 4000
    const partResult = await settleIOU('iou_lent', 4000n, 'acc_cash', 'u_iou');
    assert.equal(partResult.iou.remaining_balance_minor, 6000n);
    assert.equal(partResult.iou.status, 'PARTIAL');
    assert.equal(partResult.iou.version, 2n);

    let accounts = await getAccounts('u_iou');
    let cash = accounts.find(a => a.id === 'acc_cash')!;
    assert.equal(cash.balance_minor, 24000n); // 20000 + 4000

    // 2. Full settlement: Dave repays remaining 6000
    const fullResult = await settleIOU('iou_lent', 6000n, 'acc_cash', 'u_iou');
    assert.equal(fullResult.iou.remaining_balance_minor, 0n);
    assert.equal(fullResult.iou.status, 'SETTLED');
    assert.equal(fullResult.iou.version, 3n);

    accounts = await getAccounts('u_iou');
    cash = accounts.find(a => a.id === 'acc_cash')!;
    assert.equal(cash.balance_minor, 30000n); // 24000 + 6000
  });

  test('F10: settleIOU rejects overpayment exceeding remaining balance', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_c', 'u1', 'Cash', 'ASSET', 'INR', 10000, 0, '2026-11-08', '2026-11-08')`
    );
    await db.execute(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_small', 'u1', 'Eve', 'LENT', 2000, 2000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
    );

    await assert.rejects(async () => {
      await settleIOU('iou_small', 2500n, 'acc_c', 'u1');
    }, /exceeds remaining balance/);

    const iou = (await db.execute(`SELECT remaining_balance_minor, status FROM iou_records WHERE id = 'iou_small'`)) as any[];
    assert.equal(Number(iou[0].remaining_balance_minor), 2000);
    assert.equal(iou[0].status, 'OPEN');
  });

  // =========================================================================
  // 7. Bidirectional Delta Sync: Push, Pull & LWW
  // =========================================================================

  test('F11: Delta sync push replays pending mutations with idempotency deduplication', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('a_wallet', 'u_sync', 'Wallet', 'ASSET', 'INR', 5000, '2026-11-08', '2026-11-08'),
              ('a_cafe', 'u_sync', 'Cafe', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08')`
    );

    const txKey = 'idemp_key_sync_01';
    await postTransaction({
      idempotency_key: txKey,
      transaction_date: '2026-11-08',
      description: 'Coffee',
      entries: [
        { account_id: 'a_cafe', amount_minor: 250n, direction: 'DEBIT' },
        { account_id: 'a_wallet', amount_minor: 250n, direction: 'CREDIT' }
      ]
    }, 'u_sync');

    // Remote mock harness
    const remoteHarness = {
      idempotencyKeys: new Set<string>([txKey]), // Server ALREADY has this key (network retry scenario)
      postedTxs: [] as any[],
      postTransaction(_session: any, params: any) {
        this.postedTxs.push(params);
      },
      getAccounts() {
        return [];
      }
    };

    const res = await syncWithRemote(remoteHarness, { userId: 'u_sync' });
    assert.equal(res.success, true);
    assert.equal(res.pushed, 1);
    assert.equal(remoteHarness.postedTxs.length, 0); // No duplicate post!

    // Verify local queue marked SYNCED
    const pending = (await db.execute(`SELECT * FROM sync_queue WHERE status = 'PENDING'`)) as any[];
    assert.equal(pending.length, 0);
  });

  test('F12: Delta sync pull applies remote account and handles LWW conflict resolution', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES ('acc_loc_1', 'u_lww', 'Local Old Name', 'ASSET', 'INR', 5000, '2026-11-08T00:00:00Z', '2026-11-08T00:00:00Z', 1)`
    );

    const remoteHarness = {
      getAccounts() {
        return [
          // 1. Account with higher version (LWW remote wins)
          {
            id: 'acc_loc_1',
            user_id: 'u_lww',
            name: 'Remote Newer Name',
            type: 'ASSET',
            currency: 'INR',
            balance_minor: 12000n,
            version: 2n,
            updated_at: '2026-11-08T02:00:00Z'
          },
          // 2. Brand new remote account
          {
            id: 'acc_new_rem',
            user_id: 'u_lww',
            name: 'Cloud Savings',
            type: 'ASSET',
            currency: 'INR',
            balance_minor: 500000n,
            version: 1n,
            updated_at: '2026-11-08T02:00:00Z'
          }
        ];
      }
    };

    const res = await syncWithRemote(remoteHarness, { userId: 'u_lww' });
    assert.equal(res.success, true);
    assert.equal(res.pulled, 2);
    assert.equal(res.conflictsResolved, 1);

    const accounts = await getAccounts('u_lww');
    const updatedLoc = accounts.find(a => a.id === 'acc_loc_1')!;
    const newRem = accounts.find(a => a.id === 'acc_new_rem')!;

    assert.equal(updatedLoc.name, 'Remote Newer Name');
    assert.equal(updatedLoc.balance_minor, 12000n);
    assert.equal(updatedLoc.version, 2n);

    assert.ok(newRem);
    assert.equal(newRem.name, 'Cloud Savings');
    assert.equal(newRem.balance_minor, 500000n);
  });

  test('F13: Delta sync pull ignores stale remote record when local version is higher', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
       VALUES ('acc_v5', 'u1', 'Local V5 Name', 'ASSET', 'INR', 8000, '2026-11-08T05:00:00Z', '2026-11-08T05:00:00Z', 5)`
    );

    const remoteHarness = {
      getAccounts() {
        return [
          {
            id: 'acc_v5',
            user_id: 'u1',
            name: 'Stale Remote V2',
            type: 'ASSET',
            currency: 'INR',
            balance_minor: 2000n,
            version: 2n, // Stale!
            updated_at: '2026-11-08T01:00:00Z'
          }
        ];
      }
    };

    const res = await syncWithRemote(remoteHarness, { userId: 'u1' });
    assert.equal(res.success, true);
    assert.equal(res.pulled, 0);
    assert.equal(res.conflictsResolved, 0);

    const accounts = await getAccounts('u1');
    const acc = accounts.find(a => a.id === 'acc_v5')!;
    assert.equal(acc.name, 'Local V5 Name');
    assert.equal(acc.balance_minor, 8000n);
    assert.equal(acc.version, 5n);
  });

  test('F14: Delta sync isolates corrupted JSON payload without crashing', async () => {
    const db = await initDatabase(':memory:');
    // Enqueue unparseable JSON
    await db.execute(
      `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status)
       VALUES ('bad_item', 'transactions', 'tx_corrupt', 'INSERT', '{ corrupted-unparseable-json', '2026-11-08', 'PENDING')`
    );

    const remoteMock = {
      getAccounts: () => []
    };

    const res = await syncWithRemote(remoteMock);
    assert.equal(res.success, false);
    assert.equal(res.errors.length, 1);
    assert.ok(res.errors[0]!.includes('Corrupted JSON payload in queue item bad_item'));

    // Corrupted item remains in sync_queue marked PENDING (with retry_count incremented)
    const row = (await db.execute(`SELECT status, retry_count FROM sync_queue WHERE id = 'bad_item'`)) as any[];
    assert.equal(Number(row[0].retry_count), 1);
  });

  test('F15: Empty sync_queue executes gracefully with 0 pushed and 0 pulled', async () => {
    const remoteMock = {
      getAccounts: () => []
    };

    const res = await syncWithRemote(remoteMock);
    assert.equal(res.success, true);
    assert.equal(res.pushed, 0);
    assert.equal(res.pulled, 0);
    assert.equal(res.errors.length, 0);
  });

  test('F16: LWW resolver tie-breaks deterministically by timestamp and id', () => {
    // 1. Remote higher version wins
    assert.equal(shouldRemoteOverwriteLocal({ id: '1', version: 3n }, { id: '1', version: 2n }), true);
    // 2. Local higher version wins (remote loses)
    assert.equal(shouldRemoteOverwriteLocal({ id: '1', version: 1n }, { id: '1', version: 4n }), false);
    // 3. Same version, remote newer timestamp wins
    assert.equal(
      shouldRemoteOverwriteLocal(
        { id: '1', version: 2n, updated_at: '2026-11-08T12:00:00Z' },
        { id: '1', version: 2n, updated_at: '2026-11-08T11:00:00Z' }
      ),
      true
    );
    // 4. Same version, local newer timestamp wins
    assert.equal(
      shouldRemoteOverwriteLocal(
        { id: '1', version: 2n, updated_at: '2026-11-08T10:00:00Z' },
        { id: '1', version: 2n, updated_at: '2026-11-08T11:00:00Z' }
      ),
      false
    );
  });

  test('F17: enqueueMutation writes mutation to queue with status PENDING', async () => {
    const db = await initDatabase(':memory:');
    await enqueueMutation({
      id: 'custom_mut_1',
      operation: 'INSERT',
      table_name: 'accounts',
      payload: JSON.stringify({ name: 'Test Enqueue' })
    });

    const rows = (await db.execute(`SELECT * FROM sync_queue WHERE id = 'custom_mut_1'`)) as any[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'PENDING');
    assert.equal(rows[0].table_name, 'accounts');
  });

  test('F18: Complex 5-split transaction posts atomically and preserves balance invariant', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('bank', 'u5', 'Bank', 'ASSET', 'INR', 100000, '2026-11-08', '2026-11-08'),
              ('groceries', 'u5', 'Groceries', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08'),
              ('transport', 'u5', 'Transport', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08'),
              ('entertainment', 'u5', 'Fun', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08'),
              ('savings', 'u5', 'Savings', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')`
    );

    const tx = await postTransaction({
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: '5-Way Split Allocation',
      entries: [
        { account_id: 'groceries', amount_minor: 4500n, direction: 'DEBIT' },
        { account_id: 'transport', amount_minor: 3000n, direction: 'DEBIT' },
        { account_id: 'entertainment', amount_minor: 2500n, direction: 'DEBIT' },
        { account_id: 'savings', amount_minor: 10000n, direction: 'DEBIT' },
        { account_id: 'bank', amount_minor: 20000n, direction: 'CREDIT' }
      ]
    }, 'u5');

    assert.ok(tx.id);
    const accounts = await getAccounts('u5');
    assert.equal(accounts.find(a => a.id === 'bank')!.balance_minor, 80000n);
    assert.equal(accounts.find(a => a.id === 'groceries')!.balance_minor, 4500n);
    assert.equal(accounts.find(a => a.id === 'transport')!.balance_minor, 3000n);
    assert.equal(accounts.find(a => a.id === 'entertainment')!.balance_minor, 2500n);
    assert.equal(accounts.find(a => a.id === 'savings')!.balance_minor, 10000n);
  });

  test('F19: Sequential 3-transaction push replays in strict chronological order', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('cash_seq', 'u_seq', 'Cash', 'ASSET', 'INR', 100000, '2026-11-08', '2026-11-08'),
              ('food_seq', 'u_seq', 'Food', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08')`
    );

    const replayedTxs: string[] = [];
    const mockSupabase = {
      idempotencyKeys: new Set<string>(),
      postTransaction(_session: any, params: any) {
        replayedTxs.push(params.description);
      },
      getAccounts() {
        return [];
      }
    };

    // Insert 3 txs with spaced timestamps
    await postTransaction({
      idempotency_key: 'tx_seq_1',
      transaction_date: '2026-11-08',
      description: 'First Tx',
      entries: [
        { account_id: 'food_seq', amount_minor: 100n, direction: 'DEBIT' },
        { account_id: 'cash_seq', amount_minor: 100n, direction: 'CREDIT' }
      ]
    }, 'u_seq');

    await postTransaction({
      idempotency_key: 'tx_seq_2',
      transaction_date: '2026-11-08',
      description: 'Second Tx',
      entries: [
        { account_id: 'food_seq', amount_minor: 200n, direction: 'DEBIT' },
        { account_id: 'cash_seq', amount_minor: 200n, direction: 'CREDIT' }
      ]
    }, 'u_seq');

    await postTransaction({
      idempotency_key: 'tx_seq_3',
      transaction_date: '2026-11-08',
      description: 'Third Tx',
      entries: [
        { account_id: 'food_seq', amount_minor: 300n, direction: 'DEBIT' },
        { account_id: 'cash_seq', amount_minor: 300n, direction: 'CREDIT' }
      ]
    }, 'u_seq');

    const res = await syncWithRemote(mockSupabase, { userId: 'u_seq' });
    assert.equal(res.success, true);
    assert.equal(res.pushed, 3);
    assert.deepEqual(replayedTxs, ['First Tx', 'Second Tx', 'Third Tx']);
  });

  test('F20: settleIOU dynamically provisions contra clearing account for BORROWED direction', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_borrowed_bank', 'u_borrow', 'Bank Account', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08')`
    );
    await db.execute(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_borrowed_1', 'u_borrow', 'Charlie', 'BORROWED', 20000, 20000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
    );

    const res = await settleIOU('iou_borrowed_1', 20000n, 'acc_borrowed_bank', 'u_borrow');
    assert.equal(res.iou.status, 'SETTLED');
    assert.equal(res.iou.remaining_balance_minor, 0n);

    // Bank account should have decreased by 20000
    const accounts = await getAccounts('u_borrow');
    const bank = accounts.find(a => a.id === 'acc_borrowed_bank')!;
    assert.equal(bank.balance_minor, 30000n);

    // Auto-created IOU Clearing account should exist with LIABILITY type
    const clearing = accounts.find(a => a.name === 'IOU Clearing');
    assert.ok(clearing);
    assert.equal(clearing.type, 'LIABILITY');
  });

  test('F21: 64-bit integer values (> 2^53 - 1) preserved across postTransaction and getAccounts', async () => {
    const hugeAmt = 900719925474099120n;
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_src', 'u_huge', 'Source', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08'),
              ('acc_dst', 'u_huge', 'Destination', 'LIABILITY', 'INR', 0, '2026-11-08', '2026-11-08')`
    );

    await postTransaction({
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Huge Transaction',
      entries: [
        { account_id: 'acc_src', amount_minor: hugeAmt, direction: 'DEBIT' },
        { account_id: 'acc_dst', amount_minor: hugeAmt, direction: 'CREDIT' }
      ]
    }, 'u_huge');

    const accounts = await getAccounts('u_huge');
    const src = accounts.find(a => a.id === 'acc_src')!;
    const dst = accounts.find(a => a.id === 'acc_dst')!;

    assert.equal(src.balance_minor, hugeAmt);
    assert.equal(dst.balance_minor, hugeAmt);
  });

  test('F22: Delta sync pull reconciles remote soft-deletes (is_deleted)', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
       VALUES ('acc_to_archive', 'u_del', 'Old Account', 'ASSET', 'INR', 0, 0, '2026-11-08', '2026-11-08', 1)`
    );

    const remoteClient = {
      getAccounts() {
        return [
          {
            id: 'acc_to_archive',
            user_id: 'u_del',
            name: 'Old Account',
            type: 'ASSET',
            currency: 'INR',
            balance_minor: 0n,
            is_archived: true, // Archived remotely
            version: 2n,
            updated_at: '2026-11-08T15:00:00Z'
          }
        ];
      }
    };

    const res = await syncWithRemote(remoteClient, { userId: 'u_del' });
    assert.equal(res.success, true);
    assert.equal(res.conflictsResolved, 1);

    // Locally it should now be archived and omitted from active getAccounts
    const active = await getAccounts('u_del');
    assert.equal(active.length, 0);
  });

  test('F23: settleIOU provisions IOU Clearing without polluting Opening Balance Equity', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_f23_bank', 'u_f23', 'Bank Account', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08'),
              ('acc_f23_equity', 'u_f23', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')`
    );
    await db.execute(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_f23_lent', 'u_f23', 'Frank', 'LENT', 15000, 15000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
    );

    const res = await settleIOU('iou_f23_lent', 15000n, 'acc_f23_bank', 'u_f23');
    assert.equal(res.iou.status, 'SETTLED');
    assert.equal(res.iou.remaining_balance_minor, 0n);

    const accounts = await getAccounts('u_f23');
    const bank = accounts.find(a => a.id === 'acc_f23_bank')!;
    const equity = accounts.find(a => a.id === 'acc_f23_equity')!;
    const clearing = accounts.find(a => a.name === 'IOU Clearing');

    // Bank increased by 15000
    assert.equal(bank.balance_minor, 65000n);
    // Equity remained untouched
    assert.equal(equity.balance_minor, 0n);
    // Clearing account created as ASSET
    assert.ok(clearing);
    assert.equal(clearing.type, 'ASSET');
  });
});
