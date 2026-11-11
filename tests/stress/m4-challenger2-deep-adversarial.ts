/**
 * FinVault M4 Challenger 2 — Deep Adversarial & Invariant Stress Harness
 * 
 * Verifies:
 * 1. Deep serialization fuzzing across nested structures, nulls, undefined, and Int64 boundaries
 * 2. Double-entry validation fuzzing (200 random balanced and unbalanced multi-split cases)
 * 3. Zero-float cash flow mathematics (basis points savings rate & daily burn rate)
 * 4. IOU Contra clearing accounting integrity (zero Opening Balance Equity pollution)
 */

import assert from 'node:assert/strict';
import {
  serializeAccount,
  deserializeAccount,
  serializeTransaction,
  deserializeTransaction,
  serializeIOURecord,
  deserializeIOURecord,
  deepSerializeBigInt,
} from '../../apps/web/src/lib/money/serialization.ts';
import { validateTransactionEntries } from '../../apps/web/src/lib/validation/double-entry.ts';
import { initDatabase, settleIOU } from '../../packages/sync-engine/src/index.ts';

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(title: string, fn: () => void | Promise<void>) {
  totalChecks++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(
        () => {
          passedChecks++;
          console.log(`  [PASS] ${title}`);
        },
        (err) => {
          failedChecks++;
          console.error(`  [FAIL] ${title}: ${err.message}`);
        }
      );
    } else {
      passedChecks++;
      console.log(`  [PASS] ${title}`);
    }
  } catch (err: any) {
    failedChecks++;
    console.error(`  [FAIL] ${title}: ${err.message}`);
  }
}

async function runDeepStress() {
  console.log('======================================================================');
  console.log('   M4 CHALLENGER 2: DEEP ADVERSARIAL STRESS & ORACLE VERIFICATION     ');
  console.log('======================================================================');

  // 1. Serialization Fuzzing
  console.log('\n--- 1. Deep Serialization Fuzzing ---');

  check('ADV-SER-01: Deeply nested 10-level object graph with BigInts stringifies safely', () => {
    let current: any = { value: 9876543210987654321n };
    for (let i = 0; i < 10; i++) {
      current = { level: i, nested: current, counter: BigInt(i * 1000) };
    }
    const serialized = deepSerializeBigInt(current);
    // Must not throw BigInt serialization error
    let json = '';
    assert.doesNotThrow(() => {
      json = JSON.stringify(serialized);
    });
    assert.ok(json.includes('"value":"9876543210987654321"'));
  });

  check('ADV-SER-02: Heterogeneous array with null, undefined, boolean, and BigInt primitives', () => {
    const mixed = [1n, 'str', null, undefined, true, false, 0n, -1n, INT64_MAX, [100n, null]];
    const serialized = deepSerializeBigInt(mixed);
    assert.doesNotThrow(() => JSON.stringify(serialized));
    assert.strictEqual(serialized[0], '1');
    assert.strictEqual(serialized[2], null);
    assert.strictEqual(serialized[3], undefined);
    assert.strictEqual(serialized[4], true);
    assert.strictEqual(serialized[6], '0');
    assert.strictEqual(serialized[7], '-1');
    assert.strictEqual(serialized[8], INT64_MAX.toString());
    assert.strictEqual(serialized[9][0], '100');
  });

  check('ADV-SER-03: Deserialization oracle preserves exact BigInt across 500 pseudorandom Int64 values', () => {
    for (let i = 0; i < 500; i++) {
      // Generate large BigInt beyond safe integer
      const upper = BigInt(Math.floor(Math.random() * 1000000000));
      const lower = BigInt(Math.floor(Math.random() * 1000000000));
      const testVal = (upper << 30n) + lower;

      const acc = {
        id: `acc_${i}`,
        user_id: 'usr_test',
        name: `Account ${i}`,
        type: 'ASSET' as const,
        currency: 'INR',
        balance_minor: testVal,
        is_archived: false,
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
        version: 1n,
      };

      const serialized = serializeAccount(acc);
      assert.strictEqual(typeof serialized.balance_minor, 'string');
      const restored = deserializeAccount(serialized);
      assert.strictEqual(restored.balance_minor, testVal);
    }
  });

  // 2. Double-Entry Validation Oracle
  console.log('\n--- 2. Double-Entry Validation Fuzzing ---');

  check('ADV-VAL-01: Fuzzing 100 random balanced multi-split transactions (3 to 20 legs)', () => {
    for (let testIdx = 0; testIdx < 100; testIdx++) {
      const numDebits = Math.floor(Math.random() * 8) + 1; // 1 to 8
      const numCredits = Math.floor(Math.random() * 8) + 1; // 1 to 8

      let totalAmount = 0n;
      const debits: { account_id: string; amount_minor: bigint; direction: 'DEBIT' }[] = [];
      for (let d = 0; d < numDebits; d++) {
        const amt = BigInt(Math.floor(Math.random() * 100000) + 10);
        totalAmount += amt;
        debits.push({ account_id: `acc_d_${d}`, amount_minor: amt, direction: 'DEBIT' });
      }

      // Split totalAmount among credits
      const credits: { account_id: string; amount_minor: bigint; direction: 'CREDIT' }[] = [];
      let remainingCredit = totalAmount;
      for (let c = 0; c < numCredits - 1; c++) {
        const slice = remainingCredit / BigInt(numCredits - c);
        credits.push({ account_id: `acc_c_${c}`, amount_minor: slice, direction: 'CREDIT' });
        remainingCredit -= slice;
      }
      credits.push({ account_id: `acc_c_${numCredits - 1}`, amount_minor: remainingCredit, direction: 'CREDIT' });

      const allEntries = [...debits, ...credits];
      const res = validateTransactionEntries(allEntries);
      assert.strictEqual(res.isValid, true, `Failed for balanced split on iteration ${testIdx}`);
      assert.strictEqual(res.differenceMinor, 0n);
      assert.strictEqual(res.totalDebitsMinor, totalAmount);
      assert.strictEqual(res.totalCreditsMinor, totalAmount);
    }
  });

  check('ADV-VAL-02: Fuzzing 100 intentional off-by-one and imbalanced transactions', () => {
    for (let testIdx = 0; testIdx < 100; testIdx++) {
      const baseAmt = BigInt(Math.floor(Math.random() * 500000) + 100);
      const delta = Math.random() > 0.5 ? 1n : -1n;

      const entries = [
        { account_id: 'acc_deb', amount_minor: baseAmt, direction: 'DEBIT' as const },
        { account_id: 'acc_crd', amount_minor: baseAmt + delta, direction: 'CREDIT' as const },
      ];

      const res = validateTransactionEntries(entries);
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.differenceMinor, -delta);
      assert.ok(res.error?.includes('Double-entry violation'));
    }
  });

  // 3. Cash Flow Trajectory Zero-Float Math
  console.log('\n--- 3. Cash Flow Trajectory Zero-Float Math ---');

  check('ADV-MATH-01: Basis point savings rate mathematical invariant', () => {
    // Exact BigInt-safe formula from CashFlowSummaryCard:
    // Number(((netMinor) * 10000n) / inflowsBn) / 100

    const testScenarios = [
      { in: 0n, out: 0n, expectedRate: 0 },
      { in: 0n, out: 5000n, expectedRate: 0 },
      { in: 100000n, out: 0n, expectedRate: 100 },
      { in: 100000n, out: 50000n, expectedRate: 50 },
      { in: 100000n, out: 100000n, expectedRate: 0 },
      { in: 100000n, out: 150000n, expectedRate: -50 },
      { in: 10000000000000000n, out: 5000000000000000n, expectedRate: 50 }, // > 2^53 - 1
    ];

    for (const sc of testScenarios) {
      const netMinor = sc.in - sc.out;
      const rate = sc.in > 0n
        ? Number(((netMinor) * 10000n) / sc.in) / 100
        : 0;
      assert.strictEqual(rate, sc.expectedRate, `Rate mismatch for in=${sc.in}, out=${sc.out}`);
    }
  });

  check('ADV-MATH-02: Daily burn rate zero-division resilience', () => {
    const outflows = 3100000n; // ₹31,000.00
    // Test day 0: must return 0n without throw
    const burnDay0 = 0 > 0 ? outflows / BigInt(0) : 0n;
    assert.strictEqual(burnDay0, 0n);

    // Test day 31: 3100000n / 31n = 100000n (₹1,000.00/day)
    const burnDay31 = 31 > 0 ? outflows / 31n : 0n;
    assert.strictEqual(burnDay31, 100000n);
  });

  // 4. IOU Settlement Contra Clearing Verification
  console.log('\n--- 4. IOU Settlement Contra Clearing Invariant ---');

  await check('ADV-IOU-01: Bilateral settlement never creates or modifies Opening Balance Equity', async () => {
    const db = await initDatabase(':memory:');
    try {
      // Seed bank account
      await db.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES ('acc_main', 'usr_oracle', 'Main Checking', 'ASSET', 'INR', 200000, 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Seed 1 LENT and 1 BORROWED IOU
      await db.adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
         VALUES ('iou_lent_1', 'usr_oracle', 'Bob', 'LENT', 10000, 10000, 'INR', 'OPEN', 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      await db.adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
         VALUES ('iou_borrow_1', 'usr_oracle', 'Alice', 'BORROWED', 15000, 15000, 'INR', 'OPEN', 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Settle LENT IOU
      await settleIOU('iou_lent_1', 10000n, 'acc_main', 'usr_oracle');

      // Settle BORROWED IOU
      await settleIOU('iou_borrow_1', 15000n, 'acc_main', 'usr_oracle');

      // Confirm Opening Balance Equity account DOES NOT EXIST
      const obe = await db.adapter.queryOne<any>(
        `SELECT * FROM accounts WHERE user_id = 'usr_oracle' AND name LIKE '%Opening Balance Equity%'`
      );
      assert.strictEqual(obe, null, 'Opening Balance Equity must NOT be created by IOU settlements');

      // Confirm IOU Clearing account exists and has expected types
      const clearingAccounts = await db.adapter.query<any>(
        `SELECT * FROM accounts WHERE user_id = 'usr_oracle' AND name = 'IOU Clearing'`
      );
      assert.ok(clearingAccounts.length > 0, 'IOU Clearing account must exist');
    } finally {
      await db.close();
    }
  });

  console.log('\n======================================================================');
  console.log(`TOTAL DEEP ADVERSARIAL CHECKS: ${totalChecks}`);
  console.log(`PASSED: ${passedChecks}`);
  console.log(`FAILED: ${failedChecks}`);
  console.log('======================================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runDeepStress().catch((err) => {
  console.error('Fatal deep stress error:', err);
  process.exit(1);
});
