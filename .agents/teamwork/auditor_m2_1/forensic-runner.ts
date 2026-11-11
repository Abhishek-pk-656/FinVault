import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';

import {
  CLIENT_SQLITE_SCHEMA,
  EXPECTED_CLIENT_TABLES,
  computeAccountBalanceDelta,
  validateTransactionBalance
} from '../../../packages/sync-engine/src/index.ts';

console.log('======================================================================');
console.log('           AUDITOR M2 INDEPENDENT FORENSIC VERIFICATION               ');
console.log('======================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function forensicAssert(cond: boolean, desc: string, details?: string) {
  totalChecks++;
  if (cond) {
    passedChecks++;
    console.log(`  [PASS] ${desc}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${desc}${details ? ' - ' + details : ''}`);
  }
}

// -------------------------------------------------------------------
// 1. FORENSIC VERIFICATION: SQLite Client Schema Parity & Invariants
// -------------------------------------------------------------------
console.log('--- 1. Client SQLite Parity & Invariants ---');
try {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CLIENT_SQLITE_SCHEMA);

  // Check tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  const tableNames = new Set(tables.map(t => t.name));
  for (const exp of EXPECTED_CLIENT_TABLES) {
    forensicAssert(tableNames.has(exp), `SQLite master contains table '${exp}'`);
  }

  // Check columns & types for accounts
  const accCols = db.prepare("PRAGMA table_info('accounts')").all() as Array<{ name: string; type: string; notnull: number }>;
  const balanceCol = accCols.find(c => c.name === 'balance_minor');
  forensicAssert(balanceCol?.type === 'INTEGER' && balanceCol?.notnull === 1, "accounts.balance_minor is INTEGER NOT NULL");

  // Check foreign keys enforcement
  let caughtFk1 = false;
  try {
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('j1', 'u1', 'nonexistent_tx', 'nonexistent_acc', 100, 'DEBIT', '2026-11-08')").run();
  } catch (err: any) {
    caughtFk1 = /FOREIGN KEY constraint failed/.test(err.message);
  }
  forensicAssert(caughtFk1, "Foreign key constraint rejects journal entry with nonexistent transaction/account");

  // Check journal_entries amount_minor > 0
  let caughtZeroAmount = false;
  try {
    db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc1', 'u1', 'Bank', 'ASSET', 'INR', 0, '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at) VALUES ('tx1', 'u1', 'k1', '2026-11-08', 'Tx', '2026-11-08', '2026-11-08')").run();
    db.prepare("INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at) VALUES ('j0', 'u1', 'tx1', 'acc1', 0, 'DEBIT', '2026-11-08')").run();
  } catch (err: any) {
    caughtZeroAmount = /CHECK constraint failed/.test(err.message);
  }
  forensicAssert(caughtZeroAmount, "journal_entries check constraint rejects amount_minor <= 0");

  // Check IOU constraint
  let caughtIouNeg = false;
  let caughtIouExceed = false;
  try {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('i1', 'u1', 'A', 'LENT', 1000, -1, '2026-11-08', '2026-11-08')").run();
  } catch (err: any) {
    caughtIouNeg = /CHECK constraint failed/.test(err.message);
  }
  try {
    db.prepare("INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, created_at, updated_at) VALUES ('i2', 'u1', 'A', 'LENT', 1000, 1001, '2026-11-08', '2026-11-08')").run();
  } catch (err: any) {
    caughtIouExceed = /CHECK constraint failed/.test(err.message);
  }
  forensicAssert(caughtIouNeg, "chk_iou_remaining_balance rejects negative balance");
  forensicAssert(caughtIouExceed, "chk_iou_remaining_balance rejects balance > principal");

  // Check sinking fund constraint
  let caughtSfNeg = false;
  try {
    db.prepare("INSERT INTO sinking_funds (id, user_id, name, target_amount_minor, allocated_amount_minor, created_at, updated_at) VALUES ('sf1', 'u1', 'Goal', 5000, -1, '2026-11-08', '2026-11-08')").run();
  } catch (err: any) {
    caughtSfNeg = /CHECK constraint failed/.test(err.message);
  }
  forensicAssert(caughtSfNeg, "chk_sinking_funds_allocated rejects negative allocated amount");

  // Check trg_sync_queue_compat_sync trigger bidirectional synchronization
  db.prepare("INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES ('q1', 'accounts', 'acc1', 'INSERT', '{}', '2026-11-08T00:00:00Z')").run();
  const q1 = db.prepare("SELECT * FROM sync_queue WHERE id = 'q1'").get() as any;
  forensicAssert(q1.entity_type === 'accounts' && q1.entity_id === 'acc1' && q1.timestamp === '2026-11-08T00:00:00Z', "sync_queue populates entity_type/entity_id/timestamp from table_name/record_id/created_at");

  db.prepare("INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp) VALUES ('q2', 'transactions', 'tx1', 'UPDATE', '{}', '2026-11-08T01:00:00Z')").run();
  const q2 = db.prepare("SELECT * FROM sync_queue WHERE id = 'q2'").get() as any;
  forensicAssert(q2.table_name === 'transactions' && q2.record_id === 'tx1' && q2.created_at === '2026-11-08T01:00:00Z', "sync_queue populates table_name/record_id/created_at from entity_type/entity_id/timestamp");

  // Check 64-bit BigInt read (> 2^53 - 1)
  const hugeVal = 123456789012345678n;
  db.prepare("INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at) VALUES ('acc_big', 'u1', 'Huge', 'ASSET', 'INR', ?, '2026-11-08', '2026-11-08')").run(hugeVal);
  const stmt = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc_big'");
  stmt.setReadBigInts(true);
  const res = stmt.get() as { balance_minor: bigint };
  forensicAssert(res.balance_minor === hugeVal, "SQLite 64-bit BigInt retrieved losslessly with setReadBigInts(true)");

  db.close();
} catch (err: any) {
  forensicAssert(false, "SQLite Parity Verification failed with unexpected error", err.message);
}

// -------------------------------------------------------------------
// 2. FORENSIC VERIFICATION: TypeScript Functions & Accounting Logic
// -------------------------------------------------------------------
console.log('\n--- 2. Accounting Math & Double-Entry Invariant Functions ---');
try {
  // Test normal balances
  forensicAssert(computeAccountBalanceDelta('ASSET', 'DEBIT', 500n) === 500n, "computeAccountBalanceDelta: ASSET DEBIT increases (+)");
  forensicAssert(computeAccountBalanceDelta('ASSET', 'CREDIT', 500n) === -500n, "computeAccountBalanceDelta: ASSET CREDIT decreases (-)");
  forensicAssert(computeAccountBalanceDelta('EXPENSE', 'DEBIT', 200n) === 200n, "computeAccountBalanceDelta: EXPENSE DEBIT increases (+)");
  forensicAssert(computeAccountBalanceDelta('EXPENSE', 'CREDIT', 200n) === -200n, "computeAccountBalanceDelta: EXPENSE CREDIT decreases (-)");
  forensicAssert(computeAccountBalanceDelta('LIABILITY', 'CREDIT', 300n) === 300n, "computeAccountBalanceDelta: LIABILITY CREDIT increases (+)");
  forensicAssert(computeAccountBalanceDelta('LIABILITY', 'DEBIT', 300n) === -300n, "computeAccountBalanceDelta: LIABILITY DEBIT decreases (-)");
  forensicAssert(computeAccountBalanceDelta('EQUITY', 'CREDIT', 400n) === 400n, "computeAccountBalanceDelta: EQUITY CREDIT increases (+)");
  forensicAssert(computeAccountBalanceDelta('EQUITY', 'DEBIT', 400n) === -400n, "computeAccountBalanceDelta: EQUITY DEBIT decreases (-)");
  forensicAssert(computeAccountBalanceDelta('INCOME', 'CREDIT', 600n) === 600n, "computeAccountBalanceDelta: INCOME CREDIT increases (+)");
  forensicAssert(computeAccountBalanceDelta('INCOME', 'DEBIT', 600n) === -600n, "computeAccountBalanceDelta: INCOME DEBIT decreases (-)");

  // Test zero / negative rejection
  let deltaZeroThrows = false;
  let deltaNegThrows = false;
  try { computeAccountBalanceDelta('ASSET', 'DEBIT', 0n); } catch (e) { deltaZeroThrows = true; }
  try { computeAccountBalanceDelta('ASSET', 'DEBIT', -50n); } catch (e) { deltaNegThrows = true; }
  forensicAssert(deltaZeroThrows, "computeAccountBalanceDelta rejects 0n amount");
  forensicAssert(deltaNegThrows, "computeAccountBalanceDelta rejects negative amount");

  // Test validateTransactionBalance
  let balancedOk = false;
  try {
    validateTransactionBalance([
      { amount_minor: 100000000000000000n, direction: 'DEBIT' },
      { amount_minor: 50000000000000000n, direction: 'CREDIT' },
      { amount_minor: 50000000000000000n, direction: 'CREDIT' }
    ]);
    balancedOk = true;
  } catch (e) {}
  forensicAssert(balancedOk, "validateTransactionBalance validates multi-split BigInt amounts > 2^53");

  let unbalThrows = false;
  try {
    validateTransactionBalance([
      { amount_minor: 100n, direction: 'DEBIT' },
      { amount_minor: 99n, direction: 'CREDIT' }
    ]);
  } catch (e) { unbalThrows = true; }
  forensicAssert(unbalThrows, "validateTransactionBalance rejects off-by-1 paise imbalance");

  let singleLegThrows = false;
  try {
    validateTransactionBalance([{ amount_minor: 100n, direction: 'DEBIT' }]);
  } catch (e) { singleLegThrows = true; }
  forensicAssert(singleLegThrows, "validateTransactionBalance rejects single-entry transaction (< 2 entries)");

  let allDebitsThrows = false;
  try {
    validateTransactionBalance([
      { amount_minor: 100n, direction: 'DEBIT' },
      { amount_minor: 100n, direction: 'DEBIT' }
    ]);
  } catch (e) { allDebitsThrows = true; }
  forensicAssert(allDebitsThrows, "validateTransactionBalance rejects transaction without credit leg");
} catch (err: any) {
  forensicAssert(false, "Accounting Functions Verification failed", err.message);
}

// -------------------------------------------------------------------
// 3. FORENSIC VERIFICATION: PostgreSQL Migration PL/pgSQL & RLS Analysis
// -------------------------------------------------------------------
console.log('\n--- 3. PostgreSQL Migration Structure, RLS & Trigger Analysis ---');
const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261108000000_init_finvault_schema.sql');
forensicAssert(fs.existsSync(migrationPath), "Migration file exists: supabase/migrations/20261108000000_init_finvault_schema.sql");

const sql = fs.readFileSync(migrationPath, 'utf8');

// Tables
const expectedTables = ['accounts', 'transactions', 'journal_entries', 'iou_records', 'sinking_funds', 'audit_logs'];
for (const tbl of expectedTables) {
  const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${tbl}\\s*\\(`, 'i');
  forensicAssert(tableRegex.test(sql), `PostgreSQL DDL defines table '${tbl}'`);
}

// RLS enabled
for (const tbl of expectedTables) {
  const rlsRegex = new RegExp(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`, 'i');
  forensicAssert(rlsRegex.test(sql), `RLS enabled on table '${tbl}'`);
}

// Granular RLS policies with auth.uid() = user_id
const nonAuditTables = ['accounts', 'transactions', 'journal_entries', 'iou_records', 'sinking_funds'];
for (const tbl of nonAuditTables) {
  const selPol = new RegExp(`CREATE POLICY "${tbl}_select" ON ${tbl} FOR SELECT USING \\(auth\\.uid\\(\\) = user_id\\);`, 'i');
  const insPol = new RegExp(`CREATE POLICY "${tbl}_insert" ON ${tbl} FOR INSERT WITH CHECK \\(auth\\.uid\\(\\) = user_id\\);`, 'i');
  const updPol = new RegExp(`CREATE POLICY "${tbl}_update" ON ${tbl} FOR UPDATE USING \\(auth\\.uid\\(\\) = user_id\\) WITH CHECK \\(auth\\.uid\\(\\) = user_id\\);`, 'i');
  const delPol = new RegExp(`CREATE POLICY "${tbl}_delete" ON ${tbl} FOR DELETE USING \\(auth\\.uid\\(\\) = user_id\\);`, 'i');

  forensicAssert(selPol.test(sql), `Table '${tbl}' has SELECT RLS policy with auth.uid() = user_id`);
  forensicAssert(insPol.test(sql), `Table '${tbl}' has INSERT RLS policy with WITH CHECK (auth.uid() = user_id)`);
  forensicAssert(updPol.test(sql), `Table '${tbl}' has UPDATE RLS policy with USING & WITH CHECK (auth.uid() = user_id)`);
  forensicAssert(delPol.test(sql), `Table '${tbl}' has DELETE RLS policy with auth.uid() = user_id`);
}

// Audit log policies (Append-Only)
forensicAssert(/CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING \(auth\.uid\(\) = user_id\);/i.test(sql), "audit_logs has SELECT RLS policy");
forensicAssert(/CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK \(auth\.uid\(\) = user_id\);/i.test(sql), "audit_logs has INSERT RLS policy with WITH CHECK");
forensicAssert(!/CREATE POLICY "audit_logs_update"/i.test(sql), "audit_logs has NO UPDATE policy (strictly append-only)");
forensicAssert(!/CREATE POLICY "audit_logs_delete"/i.test(sql), "audit_logs has NO DELETE policy (strictly append-only)");

// No permissive RLS bypasses
forensicAssert(!/USING\s*\(\s*true\s*\)/i.test(sql), "No permissive USING (true) RLS bypasses");
forensicAssert(!/WITH CHECK\s*\(\s*true\s*\)/i.test(sql), "No permissive WITH CHECK (true) RLS bypasses");

// Deferred trigger & numeric(38,0)
forensicAssert(/CREATE OR REPLACE FUNCTION verify_transaction_balance\(\)/i.test(sql), "verify_transaction_balance() function defined");
forensicAssert(/total_debits\s+NUMERIC\(38,\s*0\);/i.test(sql), "verify_transaction_balance uses NUMERIC(38,0) debits accumulator");
forensicAssert(/total_credits\s+NUMERIC\(38,\s*0\);/i.test(sql), "verify_transaction_balance uses NUMERIC(38,0) credits accumulator");
forensicAssert(/CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance/i.test(sql), "trg_verify_transaction_balance constraint trigger created");
forensicAssert(/DEFERRABLE INITIALLY DEFERRED/i.test(sql), "trg_verify_transaction_balance is DEFERRABLE INITIALLY DEFERRED");

// Balance maintenance trigger & version increment
forensicAssert(/CREATE OR REPLACE FUNCTION update_account_balance_on_journal\(\)/i.test(sql), "update_account_balance_on_journal() function defined");
forensicAssert(/version = version \+ 1/i.test(sql), "update_account_balance_on_journal increments account version");
forensicAssert(/CREATE TRIGGER trg_update_account_balance/i.test(sql), "trg_update_account_balance trigger created");

// User provisioning trigger
forensicAssert(/CREATE OR REPLACE FUNCTION handle_new_user_provisioning\(\)/i.test(sql), "handle_new_user_provisioning() defined");
forensicAssert(/'Opening Balance Equity'/i.test(sql), "Provisioning trigger provisions 'Opening Balance Equity'");
forensicAssert(/CREATE TRIGGER trg_on_auth_user_created/i.test(sql), "trg_on_auth_user_created trigger created on auth.users");

// post_transaction RPC
forensicAssert(/CREATE OR REPLACE FUNCTION post_transaction\(/i.test(sql), "post_transaction RPC function defined");
forensicAssert(/jsonb_array_length\(p_entries\)\s*<\s*2/i.test(sql), "post_transaction enforces jsonb_array_length >= 2");
forensicAssert(/Cross-tenant foreign key violation/i.test(sql), "post_transaction checks cross-tenant account ownership");
forensicAssert(/SET search_path = public, pg_temp;/i.test(sql), "Routines harden search_path to public, pg_temp");

// Check constraints in SQL
forensicAssert(/chk_iou_remaining_balance/i.test(sql), "Migration includes chk_iou_remaining_balance");
forensicAssert(/chk_sinking_funds_allocated/i.test(sql), "Migration includes chk_sinking_funds_allocated");

// Composite indexes
forensicAssert(/idx_accounts_user_type/i.test(sql), "Migration includes idx_accounts_user_type");
forensicAssert(/idx_transactions_user_date/i.test(sql), "Migration includes idx_transactions_user_date");
forensicAssert(/idx_journal_entries_tx/i.test(sql), "Migration includes idx_journal_entries_tx");
forensicAssert(/idx_journal_entries_user_acc/i.test(sql), "Migration includes idx_journal_entries_user_acc");

// -------------------------------------------------------------------
// 4. FORENSIC VERIFICATION: packages/db-types Strict BIGINT Invariants
// -------------------------------------------------------------------
console.log('\n--- 4. packages/db-types Strict Types & BIGINT Invariants ---');
const dbTypesPath = path.resolve(process.cwd(), 'packages/db-types/src/index.ts');
const dbTypesContent = fs.readFileSync(dbTypesPath, 'utf8');

forensicAssert(/export interface Account \{[^}]*balance_minor:\s*bigint;/s.test(dbTypesContent), "Account.balance_minor is bigint");
forensicAssert(/export interface JournalEntry \{[^}]*amount_minor:\s*bigint;/s.test(dbTypesContent), "JournalEntry.amount_minor is bigint");
forensicAssert(/export interface IOURecord \{[^}]*principal_minor:\s*bigint;[^}]*remaining_balance_minor:\s*bigint;/s.test(dbTypesContent), "IOURecord monetary amounts are bigint");
forensicAssert(/export interface SinkingFund \{[^}]*target_amount_minor:\s*bigint;[^}]*allocated_amount_minor:\s*bigint;/s.test(dbTypesContent), "SinkingFund monetary amounts are bigint");
forensicAssert(/export interface CreateAccountDTO \{[^}]*balance_minor\?:\s*bigint;/s.test(dbTypesContent), "CreateAccountDTO.balance_minor is bigint");
forensicAssert(/export interface CreateJournalEntryDTO \{[^}]*amount_minor:\s*bigint;/s.test(dbTypesContent), "CreateJournalEntryDTO.amount_minor is bigint");
forensicAssert(/export interface CreateIOUDTO \{[^}]*principal_minor:\s*bigint;/s.test(dbTypesContent), "CreateIOUDTO.principal_minor is bigint");
forensicAssert(/export interface SettleIOUDTO \{[^}]*amount_minor:\s*bigint;/s.test(dbTypesContent), "SettleIOUDTO.amount_minor is bigint");
forensicAssert(/export interface CreateSinkingFundDTO \{[^}]*target_amount_minor:\s*bigint;[^}]*allocated_amount_minor\?:\s*bigint;/s.test(dbTypesContent), "CreateSinkingFundDTO monetary amounts are bigint");

console.log('\n======================================================================');
console.log(`FORENSIC AUDIT SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED (${failedChecks} FAILED)`);
console.log('======================================================================');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
