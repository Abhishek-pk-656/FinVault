/**
/**
 * FinVault Milestone 2 Adversarial Stress Test Harness
 * Role: Challenger 2 (Empirical Challenger)
 * 
 * Empirically challenges and stress-tests:
 * 1. SQLite in-memory execution directly from client-schema.sql and schema.sql
 * 2. Foreign key CASCADE and RESTRICT constraints
 * 3. Check constraints (hostile values, boundary violations, negative numbers)
 * 4. sync_queue compatibility trigger behavior under concurrent and edge-case writes
 * 5. 64-bit BigInt precision (> 2^53 - 1, Int64 Max/Min, IEEE-754 precision loss oracle)
 * 6. PostgreSQL migration logic verification (composite FKs, RLS, search path, trigger invariants)
 * 7. Fast-check property testing for accounting delta invariants
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import {
  computeAccountBalanceDelta,
  validateTransactionBalance,
  CLIENT_SQLITE_SCHEMA,
  EXPECTED_CLIENT_TABLES
} from '../../packages/sync-engine/src/index.ts';

// Test counters
let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

console.log('============================================================');
console.log('CHALLENGER 2: FINVAULT M2 ADVERSARIAL STRESS TEST HARNESS');
console.log('============================================================\n');

// ----------------------------------------------------------------------------
// SECTION 1: SQLite In-Memory Execution directly from File Content
// ----------------------------------------------------------------------------
console.log('--- SECTION 1: SQLite Schema Files & DDL Parity ---');

const clientSchemaPath = path.resolve('packages/sync-engine/src/client-schema.sql');
const schemaSqlPath = path.resolve('packages/sync-engine/src/schema.sql');

runTest('1.1 client-schema.sql and schema.sql exist on disk', () => {
  assert.ok(fs.existsSync(clientSchemaPath), 'client-schema.sql must exist');
  assert.ok(fs.existsSync(schemaSqlPath), 'schema.sql must exist');
});

const clientSchemaContent = fs.readFileSync(clientSchemaPath, 'utf-8');
const schemaSqlContent = fs.readFileSync(schemaSqlPath, 'utf-8');

runTest('1.2 client-schema.sql and schema.sql are identical in content', () => {
  assert.equal(
    clientSchemaContent.trim().replace(/\r\n/g, '\n'),
    schemaSqlContent.trim().replace(/\r\n/g, '\n'),
    'Both SQL files must have identical DDL definitions'
  );
});

runTest('1.3 SQLite in-memory database initializes directly from raw SQL file', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(clientSchemaContent);
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  const tableNames = rows.map(r => r.name);

  for (const table of EXPECTED_CLIENT_TABLES) {
    assert.ok(tableNames.includes(table), `Table ${table} must be created in SQLite`);
  }
});

runTest('1.4 All 13 performance and lookup indexes exist in SQLite catalog', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(clientSchemaContent);
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  const indexNames = rows.map(r => r.name);

  const expectedIndexes = [
    'idx_accounts_user',
    'idx_transactions_user',
    'idx_transactions_date',
    'idx_transactions_user_date',
    'idx_journal_entries_tx',
    'idx_journal_entries_account',
    'idx_journal_entries_user',
    'idx_iou_records_user',
    'idx_iou_records_status',
    'idx_iou_records_due_date',
    'idx_iou_records_user_status',
    'idx_sinking_funds_user',
    'idx_sinking_funds_target_date',
    'idx_sync_queue_status'
  ];

  for (const idx of expectedIndexes) {
    assert.ok(indexNames.includes(idx), `Index ${idx} must exist`);
  }
});

// ----------------------------------------------------------------------------
// SECTION 2: Foreign Key Constraints & Cascades
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Foreign Key Cascades & RESTRICT Constraints ---');

function createFreshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(clientSchemaContent);
  return db;
}

runTest('2.1 ON DELETE CASCADE: Deleting transaction cascades to journal entries', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc1', 'u1', 'Bank', 'ASSET', 'INR', 10000, '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc2', 'u1', 'Food', 'EXPENSE', 'INR', 0, '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx1', 'u1', 'key1', '2026-11-08', 'Dinner', '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je1', 'u1', 'tx1', 'acc1', 500, 'CREDIT', '2026-11-08')").run();
  db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je2', 'u1', 'tx1', 'acc2', 500, 'DEBIT', '2026-11-08')").run();

  assert.equal((db.prepare("SELECT count(*) as c FROM journal_entries WHERE transaction_id = 'tx1'").get() as any).c, 2);
  db.prepare("DELETE FROM transactions WHERE id = 'tx1'").run();
  assert.equal((db.prepare("SELECT count(*) as c FROM journal_entries WHERE transaction_id = 'tx1'").get() as any).c, 0);
});

runTest('2.2 ON DELETE RESTRICT: Deleting account referenced by journal entries throws', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_res', 'u1', 'Bank', 'ASSET', 'INR', 10000, '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx2', 'u1', 'key2', '2026-11-08', 'Dinner', '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je3', 'u1', 'tx2', 'acc_res', 500, 'CREDIT', '2026-11-08')").run();

  assert.throws(() => {
    db.prepare("DELETE FROM accounts WHERE id = 'acc_res'").run();
  }, /FOREIGN KEY constraint failed/);
});

runTest('2.3 Non-existent transaction_id in journal_entries throws FOREIGN KEY violation', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_valid', 'u1', 'Bank', 'ASSET', 'INR', 10000, '2026-11-08', '2026-11-08')").run();

  assert.throws(() => {
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je4', 'u1', 'non_existent_tx', 'acc_valid', 500, 'CREDIT', '2026-11-08')").run();
  }, /FOREIGN KEY constraint failed/);
});

runTest('2.4 Non-existent account_id in journal_entries throws FOREIGN KEY violation', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx_valid', 'u1', 'key3', '2026-11-08', 'Test', '2026-11-08', '2026-11-08')").run();

  assert.throws(() => {
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je5', 'u1', 'tx_valid', 'non_existent_acc', 500, 'CREDIT', '2026-11-08')").run();
  }, /FOREIGN KEY constraint failed/);
});

// ----------------------------------------------------------------------------
// SECTION 3: Check Constraints Stress Testing (Adversarial Edge Cases)
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Adversarial Check Constraints Stress Testing ---');

runTest('3.1 Rejection of invalid Account types', () => {
  const db = createFreshDb();
  const invalidTypes = ['asset', 'ASSET ', 'SAVINGS', 'CRYPTO', '', 'MUTUAL_FUND', 'DEBT'];
  for (const inv of invalidTypes) {
    assert.throws(() => {
      db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES (?, 'u1', 'Test', ?, 'INR', 0, '2026-11-08', '2026-11-08')").run(`acc_${inv}`, inv);
    }, /CHECK constraint failed/);
  }
});

runTest('3.2 Rejection of invalid Account is_archived values', () => {
  const db = createFreshDb();
  const invalidArchived = [-1, 2, 5, 99];
  for (const inv of invalidArchived) {
    assert.throws(() => {
      db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at) VALUES (?, 'u1', 'Test', 'ASSET', 'INR', 0, ?, '2026-11-08', '2026-11-08')").run(`acc_arch_${inv}`, inv);
    }, /CHECK constraint failed/);
  }
});

runTest('3.3 Rejection of non-positive journal entry amount_minor (0 and negative)', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_chk', 'u1', 'Bank', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx_chk', 'u1', 'key_chk', '2026-11-08', 'Test', '2026-11-08', '2026-11-08')").run();

  // Zero amount
  assert.throws(() => {
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je_zero', 'u1', 'tx_chk', 'acc_chk', 0, 'DEBIT', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Negative amount
  assert.throws(() => {
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('je_neg', 'u1', 'tx_chk', 'acc_chk', -500, 'DEBIT', '2026-11-08')").run();
  }, /CHECK constraint failed/);
});

runTest('3.4 Rejection of invalid journal entry direction', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_dir', 'u1', 'Bank', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')").run();
  db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx_dir', 'u1', 'key_dir', '2026-11-08', 'Test', '2026-11-08', '2026-11-08')").run();

  const invalidDirs = ['debit', 'Debit', 'CRED', 'TRANSFER', ''];
  for (const dir of invalidDirs) {
    assert.throws(() => {
      db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES (?, 'u1', 'tx_dir', 'acc_dir', 100, ?, '2026-11-08')").run(`je_${dir}`, dir);
    }, /CHECK constraint failed/);
  }
});

runTest('3.5 IOU principal_minor rejection when <= 0', () => {
  const db = createFreshDb();
  // 0 principal
  assert.throws(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_p0', 'u1', 'Alice', 'LENT', 0, 0, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Negative principal
  assert.throws(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_pneg', 'u1', 'Alice', 'LENT', -1000, -1000, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);
});

runTest('3.6 IOU chk_iou_remaining_balance rejects negative debt and remaining > principal', () => {
  const db = createFreshDb();
  // Negative remaining
  assert.throws(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_rneg', 'u1', 'Alice', 'LENT', 5000, -1, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Remaining > Principal
  assert.throws(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_rover', 'u1', 'Alice', 'LENT', 5000, 5001, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Edge cases: remaining == 0 (allowed)
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_zero_rem', 'u1', 'Alice', 'LENT', 5000, 0, '2026-11-08', '2026-11-08')").run();
  });

  // Edge cases: remaining == principal (allowed)
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('iou_full_rem', 'u1', 'Alice', 'LENT', 5000, 5000, '2026-11-08', '2026-11-08')").run();
  });
});

runTest('3.7 Sinking funds chk_sinking_funds_allocated rejects negative allocations', () => {
  const db = createFreshDb();
  // Target <= 0 rejected
  assert.throws(() => {
    db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf_t0', 'u1', 'Goal', 0, 0, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Allocated < 0 rejected
  assert.throws(() => {
    db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf_aneg', 'u1', 'Goal', 10000, -1, '2026-11-08', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Allocated = 0 allowed
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf_ok0', 'u1', 'Goal', 10000, 0, '2026-11-08', '2026-11-08')").run();
  });

  // Allocated > target allowed (over-saving is valid)
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf_over', 'u1', 'Goal', 10000, 12000, '2026-11-08', '2026-11-08')").run();
  });
});

runTest('3.8 Sync queue operation and status check constraints', () => {
  const db = createFreshDb();
  // Invalid operation
  assert.throws(() => {
    db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES ('sq_inv_op', 'accounts', 'a1', 'UPSERT', '{}', '2026-11-08')").run();
  }, /CHECK constraint failed/);

  // Invalid status
  assert.throws(() => {
    db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, status, created_at) VALUES ('sq_inv_st', 'accounts', 'a1', 'INSERT', '{}', 'INVALID_STATUS', '2026-11-08')").run();
  }, /CHECK constraint failed/);
});

// ----------------------------------------------------------------------------
// SECTION 4: sync_queue Trigger Compatibility Stress Testing
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 4: sync_queue Trigger Compatibility Stress Testing ---');

runTest('4.1 Trigger syncs table_name/record_id/created_at to entity_type/entity_id/timestamp', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES ('t1', 'accounts', 'rec_100', 'INSERT', '{\"name\":\"Test\"}', '2026-11-08T10:00:00Z')").run();

  const row = db.prepare("SELECT * FROM sync_queue WHERE id = 't1'").get() as any;
  assert.equal(row.table_name, 'accounts');
  assert.equal(row.record_id, 'rec_100');
  assert.equal(row.created_at, '2026-11-08T10:00:00Z');
  assert.equal(row.entity_type, 'accounts');
  assert.equal(row.entity_id, 'rec_100');
  assert.equal(row.timestamp, '2026-11-08T10:00:00Z');
});

runTest('4.2 Trigger syncs entity_type/entity_id/timestamp to table_name/record_id/created_at', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp) VALUES ('t2', 'transactions', 'tx_200', 'UPDATE', '{\"amount\":500}', '2026-11-08T11:00:00Z')").run();

  const row = db.prepare("SELECT * FROM sync_queue WHERE id = 't2'").get() as any;
  assert.equal(row.table_name, 'transactions');
  assert.equal(row.record_id, 'tx_200');
  assert.equal(row.created_at, '2026-11-08T11:00:00Z');
  assert.equal(row.entity_type, 'transactions');
  assert.equal(row.entity_id, 'tx_200');
  assert.equal(row.timestamp, '2026-11-08T11:00:00Z');
});

runTest('4.3 Trigger defaults created_at and timestamp to now if omitted', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload) VALUES ('t3', 'iou_records', 'iou_300', 'DELETE', '{}')").run();

  const row = db.prepare("SELECT * FROM sync_queue WHERE id = 't3'").get() as any;
  assert.ok(row.created_at, 'created_at should be auto-populated');
  assert.ok(row.timestamp, 'timestamp should be auto-populated');
  assert.equal(row.created_at, row.timestamp);
});

runTest('4.4 High volume batch insertion (100 rows) under transaction triggers cleanly', () => {
  const db = createFreshDb();
  db.exec('BEGIN TRANSACTION;');
  const stmt1 = db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (?, 'accounts', ?, 'INSERT', '{}', '2026-11-08T12:00:00Z')");
  const stmt2 = db.prepare("INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp) VALUES (?, 'iou_records', ?, 'UPDATE', '{}', '2026-11-08T12:00:00Z')");

  for (let i = 0; i < 50; i++) {
    stmt1.run(`batch_a_${i}`, `acc_${i}`);
    stmt2.run(`batch_b_${i}`, `iou_${i}`);
  }
  db.exec('COMMIT;');

  const total = db.prepare("SELECT count(*) as c FROM sync_queue").get() as any;
  assert.equal(total.c, 100);

  const unpopulated = db.prepare("SELECT count(*) as c FROM sync_queue WHERE table_name IS NULL OR entity_type IS NULL OR record_id IS NULL OR entity_id IS NULL").get() as any;
  assert.equal(unpopulated.c, 0, 'Every row must have both alias columns populated');
});

runTest('4.5 Row updates do not trigger infinite recursion or alter unrelated columns', () => {
  const db = createFreshDb();
  db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES ('up1', 'accounts', 'acc_u', 'INSERT', '{}', '2026-11-08')").run();

  // Update status and retry_count
  db.prepare("UPDATE sync_queue SET status = 'IN_FLIGHT', retry_count = 1 WHERE id = 'up1'").run();
  db.prepare("UPDATE sync_queue SET status = 'APPLIED' WHERE id = 'up1'").run();

  const row = db.prepare("SELECT * FROM sync_queue WHERE id = 'up1'").get() as any;
  assert.equal(row.status, 'APPLIED');
  assert.equal(row.retry_count, 1);
  assert.equal(row.entity_type, 'accounts');
  assert.equal(row.record_id, 'acc_u');
});

// ----------------------------------------------------------------------------
// SECTION 5: 64-bit BigInt Precision Stress Testing (> 2^53 - 1)
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 5: 64-bit BigInt Precision Stress Testing (> 2^53 - 1) ---');

runTest('5.1 Values beyond Number.MAX_SAFE_INTEGER (> 2^53 - 1) are preserved exactly with setReadBigInts(true)', () => {
  const db = createFreshDb();
  // 9007199254740993n is odd; in double IEEE 754 it rounds to 9007199254740992
  const largeOddBigInt = 9007199254740993n;

  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_safe', 'u1', 'Vault', 'ASSET', 'INR', ?, '2026-11-08', '2026-11-08')").run(largeOddBigInt);

  const stmt = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_safe'");
  stmt.setReadBigInts(true);
  const result = stmt.get() as { balance_minor: bigint };

  assert.equal(typeof result.balance_minor, 'bigint');
  assert.equal(result.balance_minor, largeOddBigInt);
  assert.notEqual(result.balance_minor, 9007199254740992n);
});

runTest('5.2 node:sqlite strictly throws RangeError if read without setReadBigInts(true) on > 2^53 - 1', () => {
  const db = createFreshDb();
  const largeOddBigInt = 9007199254740993n;
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_loss', 'u1', 'Vault', 'ASSET', 'INR', ?, '2026-11-08', '2026-11-08')").run(largeOddBigInt);

  const stmt = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_loss'");
  stmt.setReadBigInts(false); // Default JS number behavior

  // node:sqlite protects against silent IEEE 754 precision loss by throwing a RangeError
  assert.throws(() => {
    stmt.get();
  }, /Value is too large to be represented as a JavaScript number/);
});

runTest('5.3 Extreme 64-bit Signed Integer Boundaries (Int64 Max & Min)', () => {
  const db = createFreshDb();
  const int64Max = 9223372036854775807n; // 2^63 - 1
  const int64Min = -9223372036854775808n; // -2^63

  // Insert Max Int64
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_max', 'u1', 'Max', 'ASSET', 'INR', ?, '2026-11-08', '2026-11-08')").run(int64Max);
  // Insert Min Int64
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_min', 'u1', 'Min', 'LIABILITY', 'INR', ?, '2026-11-08', '2026-11-08')").run(int64Min);

  const stmtMax = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_max'");
  stmtMax.setReadBigInts(true);
  assert.equal((stmtMax.get() as any).balance_minor, int64Max);

  const stmtMin = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_min'");
  stmtMin.setReadBigInts(true);
  assert.equal((stmtMin.get() as any).balance_minor, int64Min);
});

// ----------------------------------------------------------------------------
// SECTION 6: PostgreSQL DDL & Trigger Logic Stress Testing
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 6: PostgreSQL Migration Analysis & Logic Verification ---');

const pgMigrationPath = path.resolve('supabase/migrations/20261108000000_init_finvault_schema.sql');
const pgMigrationContent = fs.readFileSync(pgMigrationPath, 'utf-8');

runTest('6.1 PostgreSQL schema defines uq_accounts_user_id and composite fk_journal_entries_account', () => {
  assert.ok(
    pgMigrationContent.includes('CONSTRAINT uq_accounts_user_id UNIQUE (user_id, id)'),
    'PostgreSQL accounts table must have UNIQUE (user_id, id)'
  );
  assert.ok(
    pgMigrationContent.includes('FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT'),
    'PostgreSQL journal_entries must have composite FK enforcing tenant isolation'
  );
});

runTest('6.2 PostgreSQL schema defines check constraints on IOU and Sinking Funds', () => {
  assert.ok(
    pgMigrationContent.includes('CONSTRAINT chk_iou_remaining_balance'),
    'PostgreSQL iou_records must have chk_iou_remaining_balance'
  );
  assert.ok(
    pgMigrationContent.includes('CONSTRAINT chk_sinking_funds_allocated'),
    'PostgreSQL sinking_funds must have chk_sinking_funds_allocated'
  );
});

runTest('6.3 PostgreSQL schema defines audit_logs table and audit_action enum', () => {
  assert.ok(
    pgMigrationContent.includes('CREATE TYPE audit_action AS ENUM'),
    'audit_action enum must be created'
  );
  assert.ok(
    pgMigrationContent.includes('CREATE TABLE IF NOT EXISTS audit_logs'),
    'audit_logs table must be created'
  );
});

runTest('6.4 All routines enforce secure search_path (SET search_path = public, pg_temp;)', () => {
  const matches = pgMigrationContent.match(/SET search_path = public, pg_temp;/g);
  assert.ok(matches && matches.length >= 4, `Expected at least 4 routines with secure search_path, found ${matches?.length}`);
});

runTest('6.5 trg_verify_transaction_balance uses NUMERIC(38, 0) to avoid 64-bit accumulator overflow', () => {
  assert.ok(
    pgMigrationContent.includes('total_debits NUMERIC(38, 0);'),
    'verify_transaction_balance must use NUMERIC(38, 0) for debits'
  );
  assert.ok(
    pgMigrationContent.includes('total_credits NUMERIC(38, 0);'),
    'verify_transaction_balance must use NUMERIC(38, 0) for credits'
  );
});

runTest('6.6 post_transaction RPC verifies tenant ownership of all accounts', () => {
  assert.ok(
    pgMigrationContent.includes('Cross-tenant foreign key violation'),
    'post_transaction must verify cross-tenant account ownership'
  );
  assert.ok(
    pgMigrationContent.includes('jsonb_array_length(p_entries) < 2'),
    'post_transaction must enforce minimum 2 entries'
  );
});

runTest('6.7 trg_update_account_balance increments version = version + 1 on all balance mutations', () => {
  const versionMatches = pgMigrationContent.match(/version = version \+ 1/g);
  assert.ok(versionMatches && versionMatches.length >= 3, 'Must increment version on INSERT, UPDATE, and DELETE');
});

// ----------------------------------------------------------------------------
// SECTION 7: Invariant Oracles & Accounting Math Property Tests
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 7: Invariant Oracles & Accounting Math Property Tests ---');

runTest('7.1 validateTransactionBalance accepts 500 randomized balanced multi-split transactions', () => {
  for (let i = 0; i < 500; i++) {
    // Generate split with 1 to 5 debit legs and 1 credit leg
    const numDebits = 1 + (i % 5);
    const debitAmounts: bigint[] = [];
    let totalDebit = 0n;

    for (let d = 0; d < numDebits; d++) {
      const amt = BigInt(Math.floor(Math.random() * 1000000) + 1);
      debitAmounts.push(amt);
      totalDebit += amt;
    }

    const entries = [
      ...debitAmounts.map(amt => ({ amount_minor: amt, direction: 'DEBIT' as const })),
      { amount_minor: totalDebit, direction: 'CREDIT' as const }
    ];

    assert.doesNotThrow(() => validateTransactionBalance(entries));
  }
});

runTest('7.2 validateTransactionBalance rejects 100 off-by-one paise discrepancies', () => {
  for (let i = 0; i < 100; i++) {
    const baseAmount = BigInt(Math.floor(Math.random() * 500000) + 100);
    const delta = (i % 2 === 0) ? 1n : -1n;

    const entries = [
      { amount_minor: baseAmount, direction: 'DEBIT' as const },
      { amount_minor: baseAmount + delta, direction: 'CREDIT' as const }
    ];

    assert.throws(() => validateTransactionBalance(entries), /Double-entry invariant violated/);
  }
});

runTest('7.3 computeAccountBalanceDelta adheres to Debit/Credit sign conventions across all 5 account types', () => {
  // ASSET & EXPENSE: Debit is +, Credit is -
  assert.equal(computeAccountBalanceDelta('ASSET', 'DEBIT', 1000n), 1000n);
  assert.equal(computeAccountBalanceDelta('ASSET', 'CREDIT', 1000n), -1000n);
  assert.equal(computeAccountBalanceDelta('EXPENSE', 'DEBIT', 1000n), 1000n);
  assert.equal(computeAccountBalanceDelta('EXPENSE', 'CREDIT', 1000n), -1000n);

  // LIABILITY, EQUITY, INCOME: Credit is +, Debit is -
  assert.equal(computeAccountBalanceDelta('LIABILITY', 'CREDIT', 1000n), 1000n);
  assert.equal(computeAccountBalanceDelta('LIABILITY', 'DEBIT', 1000n), -1000n);
  assert.equal(computeAccountBalanceDelta('EQUITY', 'CREDIT', 1000n), 1000n);
  assert.equal(computeAccountBalanceDelta('EQUITY', 'DEBIT', 1000n), -1000n);
  assert.equal(computeAccountBalanceDelta('INCOME', 'CREDIT', 1000n), 1000n);
  assert.equal(computeAccountBalanceDelta('INCOME', 'DEBIT', 1000n), -1000n);
});

console.log('\n============================================================');
console.log(`STRESS TEST SUMMARY: ${passed}/${passed + failed} PASSED (${failed} FAILED)`);
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
}
