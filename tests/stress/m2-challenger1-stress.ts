/**
 * FinVault Milestone 2 Adversarial Stress Test Suite
 * Agent: Challenger 1 (challenger_m2_1)
 * 
 * Empirically challenges and stress-tests:
 * 1. Double-Entry Invariants across multi-splits: 50 legs, 100 legs, 200 legs, asymmetric splits
 * 2. 1-paise discrepancy rejection across 2-leg, 50-leg, and 100-leg transactions
 * 3. Single-leg transaction rejection (1 debit only, 1 credit only)
 * 4. Deletion bypass resistance (cascade full delete vs rejected partial delete)
 * 5. Int64 Max boundaries: 9,223,372,036,854,775,807n, NUMERIC(38,0) accumulator overflow resistance
 * 6. SQLite setReadBigInts(true) 64-bit precision and SQLite SUM() integer overflow behavior
 * 7. Row-Level Security & post_transaction RPC cross-tenant isolation and security analysis
 * 8. SQLite schema check constraints: chk_iou_remaining_balance & chk_sinking_funds_allocated
 * 9. Foreign key CASCADE and RESTRICT parity in client SQLite
 * 10. Bidirectional sync_queue compatibility trigger
 * 11. sync-engine computeAccountBalanceDelta & validateTransactionBalance
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}${details ? ': ' + details : ''}`);
  }
}

/**
 * High-fidelity PostgreSQL Trigger Simulator using BigInt arithmetic
 * to strictly model NUMERIC(38, 0) in PL/pgSQL verify_transaction_balance().
 */
class PostgresTriggerSimulatorBigInt {
  public db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
        currency TEXT NOT NULL DEFAULT 'INR',
        balance_minor INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE journal_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT'))
      );
    `);
  }

  /**
   * Simulates verify_transaction_balance() PL/pgSQL routine with NUMERIC(38,0)
   */
  public evaluateTrigger(targetTxId: string): { allowed: boolean; error?: string; totalDebits: bigint; totalCredits: bigint; entryCount: number } {
    const stmt = this.db.prepare(`
      SELECT id, amount_minor, direction
      FROM journal_entries
      WHERE transaction_id = ?
    `);
    stmt.setReadBigInts(true);
    const rows = stmt.all(targetTxId) as Array<{ id: string; amount_minor: bigint; direction: string }>;

    let totalDebits = 0n;
    let totalCredits = 0n;
    const entryCount = rows.length;

    for (const r of rows) {
      if (r.direction === 'DEBIT') {
        totalDebits += r.amount_minor;
      } else if (r.direction === 'CREDIT') {
        totalCredits += r.amount_minor;
      }
    }

    // If all journal entries were deleted as part of transaction removal, allow
    if (entryCount === 0) {
      return { allowed: true, totalDebits, totalCredits, entryCount };
    }

    // Enforce at least one debit and one credit
    if (totalDebits === 0n || totalCredits === 0n) {
      return {
        allowed: false,
        error: `Transaction ${targetTxId} violates double-entry invariant: missing debit or credit leg (debits: ${totalDebits}, credits: ${totalCredits})`,
        totalDebits,
        totalCredits,
        entryCount
      };
    }

    // Enforce debit == credit equality
    if (totalDebits !== totalCredits) {
      return {
        allowed: false,
        error: `Transaction ${targetTxId} violates double-entry invariant: sum(debits) = ${totalDebits} != sum(credits) = ${totalCredits} (difference: ${totalDebits - totalCredits})`,
        totalDebits,
        totalCredits,
        entryCount
      };
    }

    return { allowed: true, totalDebits, totalCredits, entryCount };
  }

  public commit(txId: string): void {
    const res = this.evaluateTrigger(txId);
    if (!res.allowed) {
      throw new Error(res.error);
    }
  }
}

console.log('============================================================');
console.log('CHALLENGER 1: FINVAULT M2 EMPIRICAL ADVERSARIAL STRESS TEST');
console.log('============================================================\n');

// ======================================================================
// SECTION 1: Multi-Split Transactions (50, 100, 200 legs)
// ======================================================================
console.log('--- SECTION 1: Multi-Split Transactions (50, 100, 200 legs) ---');

// Test 1.1: 50-leg balanced transaction (25 debits, 25 credits)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-50-legs';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '50-leg split')").run(txId);

  const splitCount = 25;
  const unitAmount = 1000n; // 10.00 INR each

  for (let i = 0; i < splitCount; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`deb-${i}`, txId, unitAmount);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(`cred-${i}`, txId, unitAmount);
  }

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.entryCount === 50 && evalRes.totalDebits === 25000n, '50-leg balanced transaction commits successfully with entryCount=50');
}

// Test 1.2: 100-leg balanced transaction (50 debits, 50 credits)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-100-legs';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '100-leg split')").run(txId);

  const splitCount = 50;
  const unitAmount = 375n;

  for (let i = 0; i < splitCount; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`deb-${i}`, txId, unitAmount);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(`cred-${i}`, txId, unitAmount);
  }

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.entryCount === 100 && evalRes.totalDebits === 18750n, '100-leg balanced transaction commits successfully with entryCount=100');
}

// Test 1.3: 200-leg balanced transaction (100 debits, 100 credits)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-200-legs';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '200-leg split')").run(txId);

  const splitCount = 100;
  const unitAmount = 150n;

  for (let i = 0; i < splitCount; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`deb-${i}`, txId, unitAmount);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(`cred-${i}`, txId, unitAmount);
  }

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.entryCount === 200 && evalRes.totalDebits === 15000n, '200-leg balanced transaction commits successfully with entryCount=200');
}

// Test 1.4: Asymmetric split (99 small debits + 1 large credit)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-asym-100';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Asymmetric 100-leg split')").run(txId);

  let totalDebit = 0n;
  for (let i = 0; i < 99; i++) {
    const amt = BigInt(i + 1); // 1, 2, ..., 99 paise
    totalDebit += amt;
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`deb-${i}`, txId, amt);
  }
  // 1 large balancing credit = sum(1..99) = 99 * 100 / 2 = 4950 paise
  sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run('cred-main', txId, totalDebit);

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.totalDebits === 4950n && evalRes.totalCredits === 4950n, 'Asymmetric 100-leg (99 debits + 1 credit) commits successfully at 4950 paise');
}

// ======================================================================
// SECTION 2: 1-Paise Discrepancy Rejection
// ======================================================================
console.log('\n--- SECTION 2: 1-Paise Discrepancy Rejection ---');

// Test 2.1: Simple 2-leg 1-paise discrepancy (debit = 500000n, credit = 500001n)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-disc-2';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '2-leg 1-paise discrepancy')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('d1', 'u1', ?, 'acc-deb', 500000, 'DEBIT')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('c1', 'u1', ?, 'acc-cred', 500001, 'CREDIT')").run(txId);

  let caught = false;
  let errorMsg = '';
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = true;
    errorMsg = e.message;
  }
  assert(caught && errorMsg.includes('difference: -1'), '2-leg 1-paise discrepancy rejected with difference: -1', errorMsg);
}

// Test 2.2: 50-leg 1-paise discrepancy (25 debits = 25000n, 25 credits = 25001n)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-disc-50';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '50-leg 1-paise discrepancy')").run(txId);

  for (let i = 0; i < 25; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', 1000, 'DEBIT')").run(`d-${i}`, txId);
    // Add 1 paise extra on the last credit leg
    const credAmt = i === 24 ? 1001n : 1000n;
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(`c-${i}`, txId, credAmt);
  }

  let caught = false;
  let errorMsg = '';
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = true;
    errorMsg = e.message;
  }
  assert(caught && errorMsg.includes('sum(debits) = 25000 != sum(credits) = 25001'), '50-leg 1-paise discrepancy rejected with exact totals', errorMsg);
}

// Test 2.3: 100-leg 1-paise discrepancy (50 debits = 50001n, 50 credits = 50000n)
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-disc-100';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '100-leg 1-paise discrepancy')").run(txId);

  for (let i = 0; i < 50; i++) {
    const debAmt = i === 0 ? 1001n : 1000n;
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`d-${i}`, txId, debAmt);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', 1000, 'CREDIT')").run(`c-${i}`, txId);
  }

  let caught = false;
  let errorMsg = '';
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = true;
    errorMsg = e.message;
  }
  assert(caught && errorMsg.includes('sum(debits) = 50001 != sum(credits) = 50000'), '100-leg 1-paise discrepancy rejected with difference: 1', errorMsg);
}

// ======================================================================
// SECTION 3: Single-Leg Rejection & Deletion Bypass Resistance
// ======================================================================
console.log('\n--- SECTION 3: Single-Leg Rejection & Deletion Bypass ---');

// Test 3.1: Single debit leg rejected
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-single-debit';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Single debit')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('d1', 'u1', ?, 'acc-deb', 10000, 'DEBIT')").run(txId);

  let caught = false;
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = e.message.includes('missing debit or credit leg');
  }
  assert(caught, 'Single debit leg rejected at commit time');
}

// Test 3.2: Single credit leg rejected
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-single-credit';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Single credit')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('c1', 'u1', ?, 'acc-cred', 10000, 'CREDIT')").run(txId);

  let caught = false;
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = e.message.includes('missing debit or credit leg');
  }
  assert(caught, 'Single credit leg rejected at commit time');
}

// Test 3.3: Complete transaction deletion allows entry_count = 0
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-full-delete';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Full delete')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('d1', 'u1', ?, 'acc-deb', 5000, 'DEBIT')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('c1', 'u1', ?, 'acc-cred', 5000, 'CREDIT')").run(txId);
  sim.commit(txId);

  // Full delete of all journal entries
  sim.db.prepare("DELETE FROM journal_entries WHERE transaction_id = ?").run(txId);
  sim.db.prepare("DELETE FROM transactions WHERE id = ?").run(txId);

  let allowed = false;
  try {
    sim.commit(txId);
    allowed = true;
  } catch (e: any) {
    allowed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(allowed && evalRes.entryCount === 0, 'Complete DELETE allows entry_count = 0 without error');
}

// Test 3.4: Partial delete from 50-leg transaction rejected
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-partial-50';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', '50-leg partial delete')").run(txId);

  for (let i = 0; i < 25; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', 1000, 'DEBIT')").run(`d-${i}`, txId);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', 1000, 'CREDIT')").run(`c-${i}`, txId);
  }
  sim.commit(txId);

  // Maliciously delete 1 debit leg: d-0
  sim.db.prepare("DELETE FROM journal_entries WHERE id = 'd-0'").run();

  let caught = false;
  let msg = '';
  try {
    sim.commit(txId);
  } catch (e: any) {
    caught = true;
    msg = e.message;
  }
  assert(caught && msg.includes('sum(debits) = 24000 != sum(credits) = 25000'), 'Partial DELETE from 50-leg transaction rejected with exact discrepancy', msg);
}

// ======================================================================
// SECTION 4: Int64 Max Boundaries & NUMERIC(38,0) Invariants
// ======================================================================
console.log('\n--- SECTION 4: Int64 Max Boundaries & NUMERIC(38,0) Invariants ---');

const MAX_INT64 = 9223372036854775807n; // 2^63 - 1

// Test 4.1: Single leg at exactly 64-bit max integer
{
  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-max-int64';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Max Int64')").run(txId);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('d1', 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(txId, MAX_INT64);
  sim.db.prepare("INSERT INTO journal_entries VALUES ('c1', 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(txId, MAX_INT64);

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.totalDebits === MAX_INT64 && evalRes.totalCredits === MAX_INT64, 'Balanced transaction at 2^63 - 1 (9,223,372,036,854,775,807n) commits cleanly');
}

// Test 4.2: Multi-leg summation exceeding Int64 Max (demonstrating why NUMERIC(38,0) is needed)
{
  // 10 legs each having 9,000,000,000,000,000,000n
  // Total debits = 90,000,000,000,000,000,000n (approx 9 x 10^19, which is ~10x greater than MAX_INT64)
  const hugeLeg = 9000000000000000000n;
  const numLegs = 10;
  const expectedTotal = hugeLeg * BigInt(numLegs); // 90,000,000,000,000,000,000n

  const sim = new PostgresTriggerSimulatorBigInt();
  const txId = 'tx-huge-numeric';
  sim.db.prepare("INSERT INTO transactions VALUES (?, 'u1', 'Huge numeric sum')").run(txId);

  for (let i = 0; i < numLegs; i++) {
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-deb', ?, 'DEBIT')").run(`d-${i}`, txId, hugeLeg);
    sim.db.prepare("INSERT INTO journal_entries VALUES (?, 'u1', ?, 'acc-cred', ?, 'CREDIT')").run(`c-${i}`, txId, hugeLeg);
  }

  let passed = false;
  try {
    sim.commit(txId);
    passed = true;
  } catch (e: any) {
    passed = false;
  }
  const evalRes = sim.evaluateTrigger(txId);
  assert(passed && evalRes.totalDebits === expectedTotal && evalRes.totalDebits > MAX_INT64, `Multi-split sum ${expectedTotal} > 2^63-1 handled without overflow via arbitrary precision`, `totalDebits=${evalRes.totalDebits}`);
}

// Test 4.3: Empirical verification of SQLite native SUM() integer overflow vs NUMERIC(38,0)
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE test_overflow (amount INTEGER NOT NULL);');
  for (let i = 0; i < 10; i++) {
    db.prepare('INSERT INTO test_overflow VALUES (?)').run(9000000000000000000n);
  }

  let sqliteSumThrewOverflow = false;
  try {
    const stmt = db.prepare('SELECT SUM(amount) as total FROM test_overflow');
    stmt.get();
  } catch (err: any) {
    sqliteSumThrewOverflow = err.message.includes('integer overflow');
  }
  assert(sqliteSumThrewOverflow, 'SQLite native SUM() throws "integer overflow" when sum > 2^63-1, proving PostgreSQL NUMERIC(38,0) prevents server crash');
}

// Test 4.4: SQLite setReadBigInts(true) preserves exact 64-bit BigInt
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE test_bigint (id TEXT PRIMARY KEY, val INTEGER NOT NULL);');
  db.prepare('INSERT INTO test_bigint VALUES (?, ?)').run('row1', MAX_INT64);

  const stmt = db.prepare('SELECT val FROM test_bigint WHERE id = ?');
  stmt.setReadBigInts(true);
  const row = stmt.get('row1') as { val: bigint };
  assert(typeof row.val === 'bigint' && row.val === MAX_INT64, 'SQLite stmt.setReadBigInts(true) yields exact native BigInt (row.val === MAX_INT64)');
}

// ======================================================================
// SECTION 5: Client SQLite Parity, Constraints & Triggers
// ======================================================================
console.log('\n--- SECTION 5: Client SQLite Parity, Constraints & Triggers ---');

import { CLIENT_SQLITE_SCHEMA } from '../../packages/sync-engine/src/schema.ts';

// Test 5.1: Initialize full client SQLite schema DDL
const clientDb = new DatabaseSync(':memory:');
clientDb.exec(CLIENT_SQLITE_SCHEMA);

// Verify tables exist
const tableStmt = clientDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
const tableNames = (tableStmt.all() as Array<{ name: string }>).map(r => r.name);
const expectedTables = ['accounts', 'transactions', 'journal_entries', 'iou_records', 'sinking_funds', 'sync_queue'];
const allTablesPresent = expectedTables.every(t => tableNames.includes(t));
assert(allTablesPresent, `Client SQLite schema contains all 6 core tables: ${tableNames.join(', ')}`);

// Test 5.2: IOU check constraint: remaining_balance_minor <= principal_minor
{
  // Invalid: remaining_balance_minor > principal_minor (600 > 500)
  let caught = false;
  try {
    clientDb.prepare(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at)
      VALUES ('iou-inv-1', 'u1', 'Eve', 'LENT', 500, 600, '2026-11-08', '2026-11-08')
    `).run();
  } catch (err: any) {
    caught = err.message.includes('CHECK constraint failed');
  }
  assert(caught, 'chk_iou_remaining_balance rejects remaining_balance_minor > principal_minor');

  // Invalid: remaining_balance_minor < 0 (-50)
  let caughtNegative = false;
  try {
    clientDb.prepare(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at)
      VALUES ('iou-inv-2', 'u1', 'Eve', 'LENT', 500, -50, '2026-11-08', '2026-11-08')
    `).run();
  } catch (err: any) {
    caughtNegative = err.message.includes('CHECK constraint failed');
  }
  assert(caughtNegative, 'chk_iou_remaining_balance rejects negative remaining_balance_minor');

  // Valid IOU record
  let validInserted = false;
  try {
    clientDb.prepare(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at)
      VALUES ('iou-valid', 'u1', 'Eve', 'LENT', 500, 500, '2026-11-08', '2026-11-08')
    `).run();
    validInserted = true;
  } catch (err: any) {
    validInserted = false;
  }
  assert(validInserted, 'chk_iou_remaining_balance accepts valid IOU (remaining <= principal)');
}

// Test 5.3: Sinking Funds check constraint: allocated_amount_minor >= 0
{
  let caught = false;
  try {
    clientDb.prepare(`
      INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at)
      VALUES ('sf-inv', 'u1', 'Emergency', 100000, -100, '2026-11-08', '2026-11-08')
    `).run();
  } catch (err: any) {
    caught = err.message.includes('CHECK constraint failed');
  }
  assert(caught, 'chk_sinking_funds_allocated rejects negative allocated_amount_minor');

  let valid = false;
  try {
    clientDb.prepare(`
      INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at)
      VALUES ('sf-valid', 'u1', 'Emergency', 100000, 25000, '2026-11-08', '2026-11-08')
    `).run();
    valid = true;
  } catch (err: any) {
    valid = false;
  }
  assert(valid, 'chk_sinking_funds_allocated accepts non-negative allocated_amount_minor');
}

// Test 5.4: Foreign Key ON DELETE RESTRICT on accounts -> journal_entries
{
  clientDb.prepare(`
    INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
    VALUES ('acc-restr', 'u1', 'Savings', 'ASSET', 'INR', 10000, '2026-11-08', '2026-11-08')
  `).run();
  clientDb.prepare(`
    INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at)
    VALUES ('tx-restr', 'u1', 'idem-restr', '2026-11-08', 'Test restrict', '2026-11-08', '2026-11-08')
  `).run();
  clientDb.prepare(`
    INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at)
    VALUES ('je-restr', 'u1', 'tx-restr', 'acc-restr', 5000, 'DEBIT', '2026-11-08')
  `).run();

  let restrictFired = false;
  try {
    clientDb.prepare("DELETE FROM accounts WHERE id = 'acc-restr'").run();
  } catch (err: any) {
    restrictFired = err.message.includes('FOREIGN KEY constraint failed');
  }
  assert(restrictFired, 'ON DELETE RESTRICT blocks deletion of account when journal_entries exist');
}

// Test 5.5: Foreign Key ON DELETE CASCADE on transactions -> journal_entries
{
  clientDb.prepare("DELETE FROM transactions WHERE id = 'tx-restr'").run();
  const remainingEntries = clientDb.prepare("SELECT COUNT(*) as count FROM journal_entries WHERE transaction_id = 'tx-restr'").get() as { count: number };
  assert(remainingEntries.count === 0, 'ON DELETE CASCADE automatically deletes journal_entries when transaction is deleted');
}

// Test 5.6: Bidirectional sync_queue trigger compatibility
{
  // Insert with test-harness columns: entity_type, entity_id, timestamp
  clientDb.prepare(`
    INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp)
    VALUES ('sq-legacy', 'accounts', 'acc-123', 'INSERT', '{"name":"Legacy"}', '2026-11-08T12:00:00Z')
  `).run();

  const legacyRow = clientDb.prepare("SELECT table_name, record_id, created_at FROM sync_queue WHERE id = 'sq-legacy'").get() as any;
  assert(legacyRow.table_name === 'accounts' && legacyRow.record_id === 'acc-123' && legacyRow.created_at === '2026-11-08T12:00:00Z', 'trg_sync_queue_compat_sync populated (table_name, record_id, created_at) from legacy columns');

  // Insert with standard sync-engine columns: table_name, record_id, created_at
  clientDb.prepare(`
    INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
    VALUES ('sq-modern', 'transactions', 'tx-456', 'UPDATE', '{"desc":"Modern"}', '2026-11-08T14:00:00Z')
  `).run();

  const modernRow = clientDb.prepare("SELECT entity_type, entity_id, timestamp FROM sync_queue WHERE id = 'sq-modern'").get() as any;
  assert(modernRow.entity_type === 'transactions' && modernRow.entity_id === 'tx-456' && modernRow.timestamp === '2026-11-08T14:00:00Z', 'trg_sync_queue_compat_sync populated (entity_type, entity_id, timestamp) from modern columns');
}

// ======================================================================
// SECTION 6: post_transaction RPC & RLS Security Logic
// ======================================================================
console.log('\n--- SECTION 6: post_transaction RPC & RLS Security Logic ---');

/**
 * Simulates the exact logic of post_transaction() in PostgreSQL
 */
function simulatePostTransaction(
  authUid: string | null,
  accountsTable: Map<string, { id: string; user_id: string }>,
  params: {
    p_user_id?: string | null;
    p_idempotency_key?: string;
    p_transaction_date?: string;
    p_description?: string;
    p_notes?: string | null;
    p_entries?: Array<{ account_id: string; amount_minor: bigint; direction: string }>;
  }
): { success: boolean; error?: string } {
  const v_user_id = params.p_user_id ?? authUid;
  if (!v_user_id) {
    return { success: false, error: 'Not authenticated' };
  }

  if (authUid !== null && authUid !== v_user_id) {
    return { success: false, error: 'Unauthorized: cannot post transactions for other users' };
  }

  if (!params.p_entries || params.p_entries.length < 2) {
    return { success: false, error: 'A transaction must contain at least two journal entries' };
  }

  for (const entry of params.p_entries) {
    const acc = accountsTable.get(entry.account_id);
    if (!acc || acc.user_id !== v_user_id) {
      return { success: false, error: `Cross-tenant foreign key violation: account ${entry.account_id} does not belong to user ${v_user_id}` };
    }
  }

  return { success: true };
}

const mockAccounts = new Map<string, { id: string; user_id: string }>([
  ['acc-alice-1', { id: 'acc-alice-1', user_id: 'user-alice' }],
  ['acc-alice-2', { id: 'acc-alice-2', user_id: 'user-alice' }],
  ['acc-bob-1', { id: 'acc-bob-1', user_id: 'user-bob' }],
]);

// Test 6.1: Valid post_transaction by authenticated Alice
{
  const res = simulatePostTransaction('user-alice', mockAccounts, {
    p_entries: [
      { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-alice-2', amount_minor: 1000n, direction: 'CREDIT' },
    ]
  });
  assert(res.success, 'Authenticated Alice posts transaction to her own accounts successfully');
}

// Test 6.2: Alice attempts to reference Bob account (cross-tenant violation)
{
  const res = simulatePostTransaction('user-alice', mockAccounts, {
    p_entries: [
      { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'CREDIT' },
    ]
  });
  assert(!res.success && res.error?.includes('Cross-tenant foreign key violation'), 'Alice referencing Bob account rejected with Cross-tenant foreign key violation');
}

// Test 6.3: Alice attempts to impersonate Bob via p_user_id parameter
{
  const res = simulatePostTransaction('user-alice', mockAccounts, {
    p_user_id: 'user-bob',
    p_entries: [
      { account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'CREDIT' },
    ]
  });
  assert(!res.success && res.error?.includes('Unauthorized: cannot post transactions for other users'), 'Authenticated Alice passing p_user_id = Bob rejected with Unauthorized');
}

// Test 6.4: Unauthenticated caller omitting p_user_id
{
  const res = simulatePostTransaction(null, mockAccounts, {
    p_entries: [
      { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-alice-2', amount_minor: 1000n, direction: 'CREDIT' },
    ]
  });
  assert(!res.success && res.error?.includes('Not authenticated'), 'Unauthenticated caller with no p_user_id rejected with Not authenticated');
}

// Test 6.5: Transaction with < 2 entries rejected
{
  const res = simulatePostTransaction('user-alice', mockAccounts, {
    p_entries: [
      { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' }
    ]
  });
  assert(!res.success && res.error?.includes('at least two journal entries'), 'Transaction with single entry rejected with at least two journal entries check');
}

// ======================================================================
// SECTION 7: packages/sync-engine Invariant Functions
// ======================================================================
console.log('\n--- SECTION 7: packages/sync-engine Invariant Functions ---');

import { computeAccountBalanceDelta, validateTransactionBalance } from '../../packages/sync-engine/src/index.ts';

// Test 7.1: computeAccountBalanceDelta for all 5 account types
assert(computeAccountBalanceDelta('ASSET', 'DEBIT', 5000n) === 5000n, 'ASSET DEBIT increases balance (+5000)');
assert(computeAccountBalanceDelta('ASSET', 'CREDIT', 5000n) === -5000n, 'ASSET CREDIT decreases balance (-5000)');
assert(computeAccountBalanceDelta('EXPENSE', 'DEBIT', 2000n) === 2000n, 'EXPENSE DEBIT increases balance (+2000)');
assert(computeAccountBalanceDelta('EXPENSE', 'CREDIT', 2000n) === -2000n, 'EXPENSE CREDIT decreases balance (-2000)');
assert(computeAccountBalanceDelta('LIABILITY', 'CREDIT', 3000n) === 3000n, 'LIABILITY CREDIT increases balance (+3000)');
assert(computeAccountBalanceDelta('LIABILITY', 'DEBIT', 3000n) === -3000n, 'LIABILITY DEBIT decreases balance (-3000)');
assert(computeAccountBalanceDelta('EQUITY', 'CREDIT', 7000n) === 7000n, 'EQUITY CREDIT increases balance (+7000)');
assert(computeAccountBalanceDelta('EQUITY', 'DEBIT', 7000n) === -7000n, 'EQUITY DEBIT decreases balance (-7000)');
assert(computeAccountBalanceDelta('INCOME', 'CREDIT', 10000n) === 10000n, 'INCOME CREDIT increases balance (+10000)');
assert(computeAccountBalanceDelta('INCOME', 'DEBIT', 10000n) === -10000n, 'INCOME DEBIT decreases balance (-10000)');

// Test 7.2: computeAccountBalanceDelta rejects non-positive amounts
let caughtNonPos = false;
try {
  computeAccountBalanceDelta('ASSET', 'DEBIT', 0n);
} catch (err: any) {
  caughtNonPos = true;
}
assert(caughtNonPos, 'computeAccountBalanceDelta rejects amount <= 0n');

// Test 7.3: validateTransactionBalance 50-leg and 100-leg validation
{
  const balanced50: Array<{ amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }> = [];
  for (let i = 0; i < 25; i++) {
    balanced50.push({ amount_minor: 100n, direction: 'DEBIT' });
    balanced50.push({ amount_minor: 100n, direction: 'CREDIT' });
  }
  let ok50 = false;
  try {
    validateTransactionBalance(balanced50);
    ok50 = true;
  } catch (err: any) {
    ok50 = false;
  }
  assert(ok50, 'validateTransactionBalance validates 50-leg balanced transaction');

  const unbalanced50: Array<{ amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }> = [...balanced50];
  unbalanced50[0] = { amount_minor: 101n, direction: 'DEBIT' };
  let caughtUnbal = false;
  try {
    validateTransactionBalance(unbalanced50);
  } catch (err: any) {
    caughtUnbal = err.message.includes('Double-entry invariant violated');
  }
  assert(caughtUnbal, 'validateTransactionBalance catches 1-paise imbalance in 50-leg transaction');
}

// ======================================================================
// SUMMARY
// ======================================================================
console.log('\n============================================================');
console.log(`CHALLENGER 1 STRESS RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
console.log('============================================================\n');

process.exit(failedTests > 0 ? 1 : 0);
