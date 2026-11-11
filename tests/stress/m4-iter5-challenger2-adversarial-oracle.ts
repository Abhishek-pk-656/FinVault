/**
 * FinVault Milestone 4 Iteration 5 — Challenger 2 Comprehensive Adversarial Oracle
 * 
 * Empirically tests:
 * 1. Double-Entry Invariant Pre-validation & Boundary Multi-Splits
 * 2. Deep BigInt Serialization Roundtrip & JSON Safety
 * 3. Zero-Float Money Arithmetic & Invariant Property Fuzzing
 * 4. IOU Partial Settlement Lifecycle & Contra Clearing Accounting
 * 5. SQLite Storage & Atomic Rollback Preservation
 * 6. Cockpit Layout & Venzer Timing Constraints
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  serializeAccount,
  deserializeAccount,
  serializeTransaction,
  deserializeTransaction,
  serializeJournalEntry,
  deserializeJournalEntry,
  serializeIOURecord,
  deserializeIOURecord,
  deepSerializeBigInt,
} from '../../apps/web/src/lib/money/serialization.ts';
import { validateTransactionEntries } from '../../apps/web/src/lib/validation/double-entry.ts';
import {
  formatMinorToDecimal,
  formatCurrency,
  parseDecimalToMinor,
} from '../../packages/ui/src/utils/money.ts';
import {
  initDatabase,
  getAccounts,
  postTransaction,
  settleIOU,
  shouldRemoteOverwriteLocal,
  NodeSQLiteAdapter,
} from '../../packages/sync-engine/src/index.ts';
import type { Account, Transaction, JournalEntry, IOURecord } from '../../packages/db-types/src/index.ts';

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function runCheck(name: string, fn: () => void | Promise<void>) {
  totalChecks++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(
        () => {
          passedChecks++;
          console.log(`  [PASS] ${name}`);
        },
        (err) => {
          failedChecks++;
          console.error(`  [FAIL] ${name}:`, err.message);
        }
      );
    } else {
      passedChecks++;
      console.log(`  [PASS] ${name}`);
    }
  } catch (err: any) {
    failedChecks++;
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

async function runAdversarialOracle() {
  console.log('======================================================================');
  console.log('   M4 ITERATION 5: CHALLENGER 2 EMPIRICAL ADVERSARIAL ORACLE          ');
  console.log('======================================================================');

  // =========================================================================
  // 1. Double-Entry Pre-validation & Boundary Multi-Splits
  // =========================================================================
  console.log('\n--- SECTION 1: Double-Entry Ledger Invariant Stress ---');

  runCheck('LE-01: Rejection of zero-amount 2-leg entry', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc1', amount_minor: 0n, direction: 'DEBIT' },
      { account_id: 'acc2', amount_minor: 0n, direction: 'CREDIT' },
    ]);
    assert.equal(res.isValid, false);
    assert.match(res.error!, /greater than zero/i);
  });

  runCheck('LE-02: Rejection of negative-amount legs', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc1', amount_minor: -500n, direction: 'DEBIT' },
      { account_id: 'acc2', amount_minor: -500n, direction: 'CREDIT' },
    ]);
    assert.equal(res.isValid, false);
    assert.match(res.error!, /greater than zero/i);
  });

  runCheck('LE-03: Extreme boundary: INT64_MAX / 2 balanced transaction', () => {
    const half = INT64_MAX / 2n;
    const res = validateTransactionEntries([
      { account_id: 'acc1', amount_minor: half, direction: 'DEBIT' },
      { account_id: 'acc2', amount_minor: half, direction: 'CREDIT' },
    ]);
    assert.equal(res.isValid, true);
    assert.equal(res.differenceMinor, 0n);
    assert.equal(res.totalDebitsMinor, half);
    assert.equal(res.totalCreditsMinor, half);
  });

  runCheck('LE-04: Asymmetric 101-leg multi-split (1 debit of 100,000, 100 credits of 1,000)', () => {
    const entries: { account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }[] = [
      { account_id: 'acc_source', amount_minor: 100000n, direction: 'DEBIT' },
    ];
    for (let i = 0; i < 100; i++) {
      entries.push({ account_id: `acc_dest_${i}`, amount_minor: 1000n, direction: 'CREDIT' });
    }
    const res = validateTransactionEntries(entries);
    assert.equal(res.isValid, true);
    assert.equal(res.differenceMinor, 0n);
    assert.equal(res.totalDebitsMinor, 100000n);
    assert.equal(res.totalCreditsMinor, 100000n);
  });

  runCheck('LE-05: Asymmetric 101-leg multi-split off by 1 paise (100 credits of 999)', () => {
    const entries: { account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }[] = [
      { account_id: 'acc_source', amount_minor: 100000n, direction: 'DEBIT' },
    ];
    for (let i = 0; i < 100; i++) {
      entries.push({ account_id: `acc_dest_${i}`, amount_minor: 999n, direction: 'CREDIT' });
    }
    const res = validateTransactionEntries(entries);
    assert.equal(res.isValid, false);
    assert.equal(res.differenceMinor, 100n); // 100000 - 99900 = 100
    assert.match(res.error!, /Double-entry violation/);
  });

  runCheck('LE-06: Rejection of whitespace-only account ID', () => {
    const res = validateTransactionEntries([
      { account_id: '   ', amount_minor: 100n, direction: 'DEBIT' },
      { account_id: 'acc2', amount_minor: 100n, direction: 'CREDIT' },
    ]);
    assert.equal(res.isValid, false);
    assert.match(res.error!, /missing a selected account/i);
  });

  runCheck('LE-07: Single-sided all-debit multi-split rejected', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc1', amount_minor: 50n, direction: 'DEBIT' },
      { account_id: 'acc2', amount_minor: 50n, direction: 'DEBIT' },
    ]);
    assert.equal(res.isValid, false);
    assert.match(res.error!, /cannot be single-sided/i);
  });

  // =========================================================================
  // 2. Deep BigInt Serialization & JSON Safety
  // =========================================================================
  console.log('\n--- SECTION 2: BigInt Serialization & JSON Safety ---');

  runCheck('SER-01: Native BigInt in plain JSON.stringify unconditionally throws TypeError', () => {
    assert.throws(() => {
      JSON.stringify({ amount: 100n });
    }, /Do not know how to serialize a BigInt/);
  });

  runCheck('SER-02: deepSerializeBigInt eliminates BigInts across 15-level deeply nested object graph', () => {
    let current: any = { value: 1234567890123456789n };
    for (let i = 0; i < 15; i++) {
      current = { level: i, nested: current, counter: BigInt(i) };
    }
    const serialized = deepSerializeBigInt(current);
    const json = JSON.stringify(serialized);
    assert.ok(typeof json === 'string');
    assert.ok(json.includes('"1234567890123456789"'));
  });

  runCheck('SER-03: Full Account roundtrip fidelity across Int64 limits', () => {
    const testValues = [0n, 1n, -1n, 9007199254740992n, INT64_MAX, INT64_MIN];
    for (const val of testValues) {
      const orig: Account = {
        id: 'acc_test_uuid',
        user_id: 'user_uuid',
        name: 'Checking Account',
        type: 'ASSET',
        currency: 'INR',
        balance_minor: val,
        is_archived: false,
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
        version: 42n,
      };
      const dto = serializeAccount(orig);
      assert.equal(typeof dto.balance_minor, 'string');
      assert.equal(typeof dto.version, 'string');
      const recovered = deserializeAccount(dto);
      assert.deepEqual(recovered, orig);
    }
  });

  runCheck('SER-04: Full IOURecord roundtrip fidelity', () => {
    const orig: IOURecord = {
      id: 'iou_123',
      user_id: 'user_456',
      counterparty_name: 'Bob Smith',
      counterparty_contact: '+123456789',
      direction: 'LENT',
      principal_minor: 50000000000n,
      remaining_balance_minor: 25000000000n,
      currency: 'INR',
      status: 'PARTIAL',
      due_date: '2026-12-31',
      notes: 'Half repaid',
      is_deleted: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
      version: 3n,
    };
    const dto = serializeIOURecord(orig);
    assert.equal(typeof dto.principal_minor, 'string');
    assert.equal(typeof dto.remaining_balance_minor, 'string');
    const recovered = deserializeIOURecord(dto);
    assert.deepEqual(recovered, orig);
  });

  // =========================================================================
  // 3. Zero-Float Money Arithmetic & Fuzzing
  // =========================================================================
  console.log('\n--- SECTION 3: Zero-Float Money Arithmetic & Fuzzing ---');

  runCheck('MATH-01: formatMinorToDecimal exactness on 1 paise, negative amounts, and zeroes', () => {
    assert.equal(formatMinorToDecimal(0n), '0.00');
    assert.equal(formatMinorToDecimal(1n), '0.01');
    assert.equal(formatMinorToDecimal(10n), '0.10');
    assert.equal(formatMinorToDecimal(99n), '0.99');
    assert.equal(formatMinorToDecimal(100n), '1.00');
    assert.equal(formatMinorToDecimal(-1n), '-0.01');
    assert.equal(formatMinorToDecimal(-100n), '-1.00');
  });

  runCheck('MATH-02: parseDecimalToMinor handling partial user inputs without exception', () => {
    assert.equal(parseDecimalToMinor(''), 0n);
    assert.equal(parseDecimalToMinor('.'), 0n);
    assert.equal(parseDecimalToMinor('-'), 0n);
    assert.equal(parseDecimalToMinor('-.'), 0n);
    assert.equal(parseDecimalToMinor('0'), 0n);
    assert.equal(parseDecimalToMinor('0.0'), 0n);
    assert.equal(parseDecimalToMinor('-0.00'), 0n);
    assert.equal(parseDecimalToMinor('12.'), 1200n);
    assert.equal(parseDecimalToMinor('.5'), 50n);
    assert.equal(parseDecimalToMinor('.05'), 5n);
    assert.equal(parseDecimalToMinor('₹ 1,234.56'), 123456n);
  });

  runCheck('MATH-03: Roundtrip property invariant: parse(format(X)) === X across 500 pseudorandom amounts', () => {
    for (let i = 0; i < 500; i++) {
      const sign = i % 2 === 0 ? 1n : -1n;
      const pseudoRandMinor = sign * (BigInt(i * 1234567) + BigInt(i % 100));
      const formatted = formatMinorToDecimal(pseudoRandMinor);
      const parsed = parseDecimalToMinor(formatted);
      assert.equal(parsed, pseudoRandMinor, `Failed at ${pseudoRandMinor}: got ${parsed}`);
    }
  });

  // =========================================================================
  // 4. IOU Partial Settlement Lifecycle & Contra Clearing
  // =========================================================================
  console.log('\n--- SECTION 4: IOU Partial Settlement Lifecycle & Contra Clearing ---');

  await runCheck('IOU-LIFECYCLE: Multi-stage partial settlement transitions OPEN -> PARTIAL -> SETTLED', async () => {
    const db = await initDatabase(':memory:');
    const adapter = (db as any).adapter as NodeSQLiteAdapter;

    // Seed test bank account
    const bankId = 'acc_bank_test';
    adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), 1)`,
      [bankId, 'usr_1', 'Main Bank', 'ASSET', 'INR', 1000000n]
    );

    // Seed IOU (Lent 10,000 paise / 100 INR to Charlie)
    const iouId = 'iou_charlie_1';
    adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), 1)`,
      [iouId, 'usr_1', 'Charlie', 'LENT', 10000n, 10000n, 'INR', 'OPEN']
    );

    // Stage 1: Partial settlement of 3,500 paise
    await settleIOU(iouId, 3500n, bankId);
    let iouRow = adapter.queryOne<any>('SELECT * FROM iou_records WHERE id = ?', [iouId]);
    assert.equal(iouRow.remaining_balance_minor, 6500n);
    assert.equal(iouRow.status, 'PARTIAL');

    // Stage 2: Second partial settlement of 3,500 paise
    await settleIOU(iouId, 3500n, bankId);
    iouRow = adapter.queryOne<any>('SELECT * FROM iou_records WHERE id = ?', [iouId]);
    assert.equal(iouRow.remaining_balance_minor, 3000n);
    assert.equal(iouRow.status, 'PARTIAL');

    // Stage 3: Final settlement of remaining 3,000 paise
    await settleIOU(iouId, 3000n, bankId);
    iouRow = adapter.queryOne<any>('SELECT * FROM iou_records WHERE id = ?', [iouId]);
    assert.equal(iouRow.remaining_balance_minor, 0n);
    assert.equal(iouRow.status, 'SETTLED');

    // Stage 4: Attempt overpayment on settled IOU -> must be rejected
    await assert.rejects(async () => {
      await settleIOU(iouId, 100n, bankId);
    }, /exceeds remaining balance|already settled/i);
  });

  // =========================================================================
  // 5. SQLite Storage & Atomic Rollback Preservation
  // =========================================================================
  console.log('\n--- SECTION 5: SQLite Storage & Atomic Rollback Preservation ---');

  await runCheck('ROLLBACK-01: Out-of-balance transaction leaves account balances completely unmodified', async () => {
    const db = await initDatabase(':memory:');
    const adapter = (db as any).adapter as NodeSQLiteAdapter;

    const accId = 'acc_cash_rollback';
    adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), 1)`,
      [accId, 'usr_1', 'Cash', 'ASSET', 'INR', 50000n]
    );

    // Attempt invalid transaction
    await assert.rejects(async () => {
      await postTransaction({
        id: 'tx_fail',
        user_id: 'usr_1',
        idempotency_key: 'idemp_fail',
        transaction_date: '2026-11-09',
        description: 'Failed Split',
        entries: [
          { account_id: accId, amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: accId, amount_minor: 999n, direction: 'CREDIT' }, // off by 1
        ],
      });
    });

    const accRow = adapter.queryOne<any>('SELECT balance_minor FROM accounts WHERE id = ?', [accId]);
    assert.equal(accRow.balance_minor, 50000n, 'Balance was corrupted by failed transaction!');
  });

  // =========================================================================
  // 6. Cockpit Layout & Venzer Timing Constraints
  // =========================================================================
  console.log('\n--- SECTION 6: Cockpit Layout & Venzer Timing Constraints ---');

  runCheck('LAYOUT-01: No transition classes exceeding 180ms across all apps/web components', () => {
    const webSrcDir = path.resolve(import.meta.dirname, '../../apps/web/src');
    const tsxFiles: string[] = [];

    function findTsx(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findTsx(full);
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          tsxFiles.push(full);
        }
      }
    }

    findTsx(webSrcDir);
    assert.ok(tsxFiles.length > 0);

    const slowTransitions = ['duration-200', 'duration-300', 'duration-500', 'duration-700', 'duration-1000'];
    for (const f of tsxFiles) {
      const content = fs.readFileSync(f, 'utf8');
      for (const slow of slowTransitions) {
        assert.ok(!content.includes(slow), `Found slow transition "${slow}" in ${f}`);
      }
    }
  });

  runCheck('BUILD-01:apps/web/.next build directory has zero corrupt chunks/server paths', () => {
    const corruptPath = path.resolve(import.meta.dirname, '../../apps/web/.next/server/chunks/server');
    assert.equal(fs.existsSync(corruptPath), false, 'Corrupt chunks/server path still exists!');
  });

  console.log('\n======================================================================');
  console.log(`TOTAL ADVERSARIAL CHECKS: ${totalChecks}`);
  console.log(`PASSED: ${passedChecks}`);
  console.log(`FAILED: ${failedChecks}`);
  console.log('======================================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runAdversarialOracle().catch((err) => {
  console.error('Fatal error during adversarial oracle run:', err);
  process.exit(1);
});
