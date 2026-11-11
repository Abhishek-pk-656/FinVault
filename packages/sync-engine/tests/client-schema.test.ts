import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CLIENT_SQLITE_SCHEMA,
  EXPECTED_CLIENT_TABLES,
  computeAccountBalanceDelta,
  validateTransactionBalance,
} from '../src/index.ts';

describe('FinVault Client SQLite Schema Parity & Invariants', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(CLIENT_SQLITE_SCHEMA);
  });

  test('1. Core tables exist in SQLite master catalog', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    const tableNames = rows.map(r => r.name);

    for (const expected of EXPECTED_CLIENT_TABLES) {
      assert.ok(tableNames.includes(expected), `Table ${expected} must exist in SQLite`);
    }
  });

  test('2. Indexes exist on indexed columns', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    const indexNames = indexes.map(r => r.name);

    assert.ok(indexNames.includes('idx_accounts_user'));
    assert.ok(indexNames.includes('idx_transactions_user'));
    assert.ok(indexNames.includes('idx_transactions_user_date'));
    assert.ok(indexNames.includes('idx_journal_entries_tx'));
    assert.ok(indexNames.includes('idx_journal_entries_account'));
    assert.ok(indexNames.includes('idx_journal_entries_user'));
    assert.ok(indexNames.includes('idx_iou_records_user'));
    assert.ok(indexNames.includes('idx_iou_records_status'));
    assert.ok(indexNames.includes('idx_iou_records_due_date'));
    assert.ok(indexNames.includes('idx_iou_records_user_status'));
    assert.ok(indexNames.includes('idx_sinking_funds_user'));
    assert.ok(indexNames.includes('idx_sync_queue_status'));
  });

  test('3. Foreign Keys: ON DELETE CASCADE on transactions -> journal_entries', () => {
    db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc1', 'u1', 'Bank', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx1', 'u1', 'key1', '2026-11-08', 'Test', '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je1', 'u1', 'tx1', 'acc1', 1000, 'DEBIT', '2026-11-08')").run();

    const countBefore = db.prepare("SELECT count(*) as c FROM journal_entries WHERE transaction_id = 'tx1'").get() as { c: number };
    assert.equal(countBefore.c, 1);

    db.prepare("DELETE FROM transactions WHERE id = 'tx1'").run();

    const countAfter = db.prepare("SELECT count(*) as c FROM journal_entries WHERE transaction_id = 'tx1'").get() as { c: number };
    assert.equal(countAfter.c, 0);
  });

  test('4. Foreign Keys: ON DELETE RESTRICT on accounts -> journal_entries', () => {
    db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc2', 'u1', 'Cash', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx2', 'u1', 'key2', '2026-11-08', 'Test', '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je2', 'u1', 'tx2', 'acc2', 1000, 'DEBIT', '2026-11-08')").run();

    assert.throws(() => {
      db.prepare("DELETE FROM accounts WHERE id = 'acc2'").run();
    }, /FOREIGN KEY constraint failed/);
  });

  test('5. Check constraints: IOU remaining_balance_minor and principal_minor', () => {
    // Non-positive principal rejected
    assert.throws(() => {
      db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou1', 'u1', 'Alice', 'LENT', 0, 0, '2026-11-08', '2026-11-08')").run();
    }, /CHECK constraint failed/);

    // Negative remaining_balance_minor rejected
    assert.throws(() => {
      db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou2', 'u1', 'Alice', 'LENT', 5000, -1, '2026-11-08', '2026-11-08')").run();
    }, /CHECK constraint failed/);

    // remaining_balance_minor > principal_minor rejected
    assert.throws(() => {
      db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou3', 'u1', 'Alice', 'LENT', 5000, 5001, '2026-11-08', '2026-11-08')").run();
    }, /CHECK constraint failed/);
  });

  test('6. Check constraints: Sinking funds allocated_amount_minor >= 0', () => {
    // Negative allocated amount rejected
    assert.throws(() => {
      db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf1', 'u1', 'Vacation', 50000, -100, '2026-11-08', '2026-11-08')").run();
    }, /CHECK constraint failed/);
  });

  test('7. Trigger: trg_sync_queue_compat_sync synchronizes aliases bidirectionally', () => {
    // Insert with table_name, record_id, created_at
    db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES ('sq1', 'accounts', 'acc1', 'INSERT', '{}', '2026-11-08T12:00:00Z')").run();

    const sq1 = db.prepare("SELECT * FROM sync_queue WHERE id = 'sq1'").get() as any;
    assert.equal(sq1.entity_type, 'accounts');
    assert.equal(sq1.record_id, 'acc1');
    assert.equal(sq1.entity_id, 'acc1');
    assert.equal(sq1.timestamp, '2026-11-08T12:00:00Z');

    // Insert with entity_type, entity_id, timestamp
    db.prepare("INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp) VALUES ('sq2', 'transactions', 'tx1', 'UPDATE', '{}', '2026-11-08T13:00:00Z')").run();

    const sq2 = db.prepare("SELECT * FROM sync_queue WHERE id = 'sq2'").get() as any;
    assert.equal(sq2.table_name, 'transactions');
    assert.equal(sq2.record_id, 'tx1');
    assert.equal(sq2.created_at, '2026-11-08T13:00:00Z');
  });

  test('8. 64-bit BigInt precision (> 2^53 - 1) with setReadBigInts(true)', () => {
    const hugeAmount = 900719925474099100n; // > Number.MAX_SAFE_INTEGER
    db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_huge', 'u1', 'Treasury', 'ASSET', 'INR', ?, '2026-11-08', '2026-11-08')").run(hugeAmount);

    const stmt = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_huge'");
    stmt.setReadBigInts(true);
    const result = stmt.get() as { balance_minor: bigint };

    assert.equal(typeof result.balance_minor, 'bigint');
    assert.equal(result.balance_minor, hugeAmount);
  });

  test('9. computeAccountBalanceDelta normal balance conventions', () => {
    // ASSET: DEBIT is +, CREDIT is -
    assert.equal(computeAccountBalanceDelta('ASSET', 'DEBIT', 5000n), 5000n);
    assert.equal(computeAccountBalanceDelta('ASSET', 'CREDIT', 5000n), -5000n);

    // EXPENSE: DEBIT is +, CREDIT is -
    assert.equal(computeAccountBalanceDelta('EXPENSE', 'DEBIT', 3000n), 3000n);
    assert.equal(computeAccountBalanceDelta('EXPENSE', 'CREDIT', 3000n), -3000n);

    // LIABILITY: CREDIT is +, DEBIT is -
    assert.equal(computeAccountBalanceDelta('LIABILITY', 'CREDIT', 2000n), 2000n);
    assert.equal(computeAccountBalanceDelta('LIABILITY', 'DEBIT', 2000n), -2000n);

    // EQUITY: CREDIT is +, DEBIT is -
    assert.equal(computeAccountBalanceDelta('EQUITY', 'CREDIT', 10000n), 10000n);
    assert.equal(computeAccountBalanceDelta('EQUITY', 'DEBIT', 10000n), -10000n);

    // INCOME: CREDIT is +, DEBIT is -
    assert.equal(computeAccountBalanceDelta('INCOME', 'CREDIT', 7500n), 7500n);
    assert.equal(computeAccountBalanceDelta('INCOME', 'DEBIT', 7500n), -7500n);

    // Non-positive amount throws
    assert.throws(() => computeAccountBalanceDelta('ASSET', 'DEBIT', 0n), /Amount must be positive/);
    assert.throws(() => computeAccountBalanceDelta('ASSET', 'DEBIT', -100n), /Amount must be positive/);
  });

  test('10. validateTransactionBalance double-entry validation', () => {
    // Balanced transaction passes
    assert.doesNotThrow(() => {
      validateTransactionBalance([
        { amount_minor: 5000n, direction: 'DEBIT' },
        { amount_minor: 5000n, direction: 'CREDIT' },
      ]);
    });

    // Multi-split balanced transaction passes
    assert.doesNotThrow(() => {
      validateTransactionBalance([
        { amount_minor: 2500n, direction: 'DEBIT' },
        { amount_minor: 2500n, direction: 'DEBIT' },
        { amount_minor: 5000n, direction: 'CREDIT' },
      ]);
    });

    // Unbalanced transaction throws
    assert.throws(() => {
      validateTransactionBalance([
        { amount_minor: 5000n, direction: 'DEBIT' },
        { amount_minor: 4999n, direction: 'CREDIT' },
      ]);
    }, /Double-entry invariant violated/);

    // Missing credit throws
    assert.throws(() => {
      validateTransactionBalance([
        { amount_minor: 5000n, direction: 'DEBIT' },
        { amount_minor: 5000n, direction: 'DEBIT' },
      ]);
    }, /Transaction missing debit or credit leg/);

    // Less than 2 entries throws
    assert.throws(() => {
      validateTransactionBalance([
        { amount_minor: 5000n, direction: 'DEBIT' },
      ]);
    }, /Transaction must contain at least two journal entries/);

    // Non-positive amount throws
    assert.throws(() => {
      validateTransactionBalance([
        { amount_minor: 0n, direction: 'DEBIT' },
        { amount_minor: 0n, direction: 'CREDIT' },
      ]);
    }, /Journal entry amount must be strictly positive/);
  });
});
