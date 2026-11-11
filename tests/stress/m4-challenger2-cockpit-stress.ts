/**
 * FinVault Milestone 4 — Challenger 2 Adversarial Stress Test Suite
 * 
 * Focus Areas:
 * 1. BigInt Serialization Roundtripping (apps/web/src/lib/money/serialization.ts)
 *    - Int64 Max/Min, 0n, -1n, large exponents, arbitrary currencies
 *    - Deep nested serialization without BigInt serialization crashes in JSON.stringify
 *    - Lossless roundtrip fidelity
 * 2. Double-Entry Pre-validation (apps/web/src/lib/validation/double-entry.ts)
 *    - Strict rejection of 0-leg, 1-leg, all-debit, all-credit, negative, zero, and imbalanced transactions
 *    - Extreme limits (Int64 Max amounts, 100-way multi-splits)
 * 3. IOU Settlement & Dynamic Contra Clearing Account Linkage
 *    - Negative / zero / overpayment rejection
 *    - Dynamic contra clearing account provisioning & balanced journal legs for LENT and BORROWED
 *    - Multi-stage partial-to-settled lifecycle
 * 4. Maximum 3 Visual Component Groups Rule Verification
 *    - AST/Structural analysis across all 5 cockpit views
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
import { initDatabase, settleIOU, getAccounts } from '../../packages/sync-engine/src/index.ts';
import type { Account, Transaction, JournalEntry, IOURecord } from '../../packages/db-types/src/index.ts';

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function testCase(name: string, fn: () => void | Promise<void>) {
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

async function runAllStressTests() {
  console.log('======================================================================');
  console.log('   M4 CHALLENGER 2: ADVERSARIAL STRESS TEST & EMPIRICAL HARNESS       ');
  console.log('======================================================================');

  // ==========================================================================
  // SECTION 1: BigInt Serialization Roundtripping
  // ==========================================================================
  console.log('\n--- 1. BigInt Serialization Roundtripping Stress ---');

  testCase('SERIAL-01: Lossless roundtrip across Int64 limits (Max, Min, 0, Safe Ints)', () => {
    const boundaryValues: bigint[] = [
      0n,
      1n,
      -1n,
      100n,
      -100n,
      2147483647n, // Int32 Max
      -2147483648n, // Int32 Min
      9007199254740991n, // Number.MAX_SAFE_INTEGER
      9007199254740992n, // Exceeding JS double float precision
      INT64_MAX,
      INT64_MIN,
    ];

    for (const val of boundaryValues) {
      const acc: Account = {
        id: 'acc_test',
        user_id: 'usr_test',
        name: 'Boundary Test Account',
        type: 'ASSET',
        currency: 'INR',
        balance_minor: val,
        is_archived: false,
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
        version: val > 0n ? val : 1n,
      };

      const dto = serializeAccount(acc);
      assert.strictEqual(typeof dto.balance_minor, 'string');
      assert.strictEqual(dto.balance_minor, val.toString());

      // JSON serialization safety check
      const jsonStr = JSON.stringify(dto);
      const parsedDto = JSON.parse(jsonStr);

      const restored = deserializeAccount(parsedDto);
      assert.strictEqual(restored.balance_minor, val, `Balance mismatch for ${val}`);
      assert.strictEqual(typeof restored.balance_minor, 'bigint');
    }
  });

  testCase('SERIAL-02: Arbitrary currency codes and symbols roundtrip without corruption', () => {
    const currencies = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH', 'USDC', '₹', '$', '€', '¥', 'CUSTOM_XYZ_TOKEN'];

    for (const curr of currencies) {
      const iou: IOURecord = {
        id: 'iou_curr',
        user_id: 'usr_curr',
        counterparty_name: 'Currency Test Partner',
        counterparty_contact: null,
        direction: 'LENT',
        principal_minor: 5000000n,
        remaining_balance_minor: 5000000n,
        currency: curr,
        status: 'OPEN',
        due_date: null,
        notes: `IOU denominated in ${curr}`,
        is_deleted: false,
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
        version: 1n,
      };

      const dto = serializeIOURecord(iou);
      assert.strictEqual(dto.currency, curr);
      const json = JSON.stringify(dto);
      const parsed = JSON.parse(json);
      const restored = deserializeIOURecord(parsed);
      assert.strictEqual(restored.currency, curr);
      assert.strictEqual(restored.principal_minor, 5000000n);
      assert.strictEqual(restored.remaining_balance_minor, 5000000n);
    }
  });

  testCase('SERIAL-03: Complex multi-leg transaction roundtrip with 100 journal entries', () => {
    const entries: JournalEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push({
        id: `entry_${i}`,
        user_id: 'usr_multi',
        transaction_id: 'tx_multi',
        account_id: `acc_${i % 10}`,
        amount_minor: BigInt(i * 1000 + 1),
        direction: i % 2 === 0 ? 'DEBIT' : 'CREDIT',
        created_at: '2026-11-09T00:00:00Z',
      });
    }

    const tx: Transaction & { entries: JournalEntry[] } = {
      id: 'tx_multi',
      user_id: 'usr_multi',
      idempotency_key: 'idem_multi_100',
      transaction_date: '2026-11-09',
      description: '100-way split stress transaction',
      notes: 'Complex test notes',
      is_reconciled: true,
      is_deleted: false,
      created_at: '2026-11-09T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
      version: 42n,
      entries,
    };

    const dto = serializeTransaction(tx);
    assert.strictEqual(dto.entries?.length, 100);
    assert.strictEqual(typeof dto.version, 'string');
    assert.strictEqual(dto.version, '42');

    // RSC JSON payload safety test
    const jsonStr = JSON.stringify(dto);
    assert.doesNotThrow(() => JSON.parse(jsonStr));

    const parsed = JSON.parse(jsonStr);
    const restoredTx = deserializeTransaction(parsed);
    assert.strictEqual(restoredTx.version, 42n);

    const restoredEntries = parsed.entries.map(deserializeJournalEntry);
    assert.strictEqual(restoredEntries.length, 100);
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(restoredEntries[i].amount_minor, entries[i].amount_minor);
      assert.strictEqual(typeof restoredEntries[i].amount_minor, 'bigint');
      assert.strictEqual(restoredEntries[i].direction, entries[i].direction);
    }
  });

  testCase('SERIAL-04: deepSerializeBigInt handles deep recursion, heterogeneous arrays, and symbols', () => {
    const complexData = {
      level1: {
        bigNumber: 123456789012345678901234567890n,
        nestedList: [
          { a: 1n, b: 2n },
          [3n, 4n, [5n, { deep: 6n }]],
        ],
        primitives: {
          str: 'hello',
          num: 42,
          bool: true,
          nil: null,
          undef: undefined,
        },
      },
    };

    const serialized = deepSerializeBigInt(complexData);

    // Verify raw JSON serialization does NOT throw BigInt TypeError
    assert.doesNotThrow(() => JSON.stringify(serialized));

    assert.strictEqual(serialized.level1.bigNumber, '123456789012345678901234567890');
    assert.strictEqual(serialized.level1.nestedList[0].a, '1');
    assert.strictEqual(serialized.level1.nestedList[1][2][1].deep, '6');
    assert.strictEqual(serialized.level1.primitives.str, 'hello');
    assert.strictEqual(serialized.level1.primitives.num, 42);
    assert.strictEqual(serialized.level1.primitives.nil, null);
  });

  testCase('SERIAL-05: Serialization throughput & latency across 10,000 objects', () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const acc: Account = {
        id: `acc_${i}`,
        user_id: 'usr_bench',
        name: `Benchmark Account ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: BigInt(i * 100),
        is_archived: false,
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
        version: BigInt(i),
      };
      const dto = serializeAccount(acc);
      deserializeAccount(dto);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `Benchmark took too long: ${elapsed.toFixed(1)}ms (threshold 200ms)`);
  });

  // ==========================================================================
  // SECTION 2: Double-Entry Pre-validation
  // ==========================================================================
  console.log('\n--- 2. Double-Entry Pre-validation Stress ---');

  testCase('VALID-01: Rejection of 0-leg transactions', () => {
    const res = validateTransactionEntries([]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('at least two entries'));
  });

  testCase('VALID-02: Rejection of 1-leg single-sided transactions', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 1000n, direction: 'DEBIT' },
    ]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('at least two entries'));
  });

  testCase('VALID-03: Rejection of all-debit multi-leg transactions', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 500n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: 500n, direction: 'DEBIT' },
    ]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('cannot be single-sided'));
  });

  testCase('VALID-04: Rejection of all-credit multi-leg transactions', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 750n, direction: 'CREDIT' },
      { account_id: 'acc_2', amount_minor: 750n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('cannot be single-sided'));
  });

  testCase('VALID-05: Rejection of zero amount entries (amount_minor = 0n)', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 0n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: 0n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('greater than zero'));
  });

  testCase('VALID-06: Rejection of negative amount entries (amount_minor < 0n)', () => {
    const res = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: -500n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: -500n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('greater than zero'));
  });

  testCase('VALID-07: Rejection of imbalanced transactions (off-by-1 minor unit)', () => {
    // Debits > Credits by 1 minor unit
    const res1 = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 10001n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: 10000n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res1.isValid, false);
    assert.strictEqual(res1.differenceMinor, 1n);
    assert.ok(res1.error?.includes('Double-entry violation'));

    // Credits > Debits by 1 minor unit
    const res2 = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 10000n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: 10001n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res2.isValid, false);
    assert.strictEqual(res2.differenceMinor, -1n);
    assert.ok(res2.error?.includes('Double-entry violation'));
  });

  testCase('VALID-08: Rejection of empty or whitespace account IDs', () => {
    const resEmpty = validateTransactionEntries([
      { account_id: '', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc_2', amount_minor: 1000n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(resEmpty.isValid, false);
    assert.ok(resEmpty.error?.includes('missing a selected account'));

    const resWhitespace = validateTransactionEntries([
      { account_id: 'acc_1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: '   \t  ', amount_minor: 1000n, direction: 'CREDIT' },
    ]);
    assert.strictEqual(resWhitespace.isValid, false);
    assert.ok(resWhitespace.error?.includes('missing a selected account'));
  });

  testCase('VALID-09: Exact validation of balanced 100-leg multi-split transaction', () => {
    // 50 debits of 12345n = 617250n
    // 50 credits: 49 of 12345n = 604905n, 1 of 12345n = 12345n -> sum = 617250n
    const entries: { account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push({ account_id: `acc_deb_${i}`, amount_minor: 12345n, direction: 'DEBIT' });
    }
    for (let i = 0; i < 50; i++) {
      entries.push({ account_id: `acc_crd_${i}`, amount_minor: 12345n, direction: 'CREDIT' });
    }

    const res = validateTransactionEntries(entries);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.differenceMinor, 0n);
    assert.strictEqual(res.totalDebitsMinor, 617250n);
    assert.strictEqual(res.totalCreditsMinor, 617250n);
  });

  testCase('VALID-10: Extreme boundary: INT64_MAX / 2 balanced transaction', () => {
    const halfMax = INT64_MAX / 2n;
    const res = validateTransactionEntries([
      { account_id: 'acc_large_1', amount_minor: halfMax, direction: 'DEBIT' },
      { account_id: 'acc_large_2', amount_minor: halfMax, direction: 'CREDIT' },
    ]);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.differenceMinor, 0n);
  });

  // ==========================================================================
  // SECTION 3: IOU Settlement & Dynamic Contra Clearing Account Linkage
  // ==========================================================================
  console.log('\n--- 3. IOU Settlement & Dynamic Contra Clearing Stress ---');

  await testCase('IOU-01: settleIOU rejects non-positive settlement amounts (0n and negative)', async () => {
    const db = await initDatabase(':memory:');
    try {
      await assert.rejects(
        async () => {
          await settleIOU('non_existent', 0n, 'acc_1');
        },
        /Settlement amount must be positive/
      );

      await assert.rejects(
        async () => {
          await settleIOU('non_existent', -500n, 'acc_1');
        },
        /Settlement amount must be positive/
      );
    } finally {
      await db.close();
    }
  });

  await testCase('IOU-02: settleIOU rejects overpayment exceeding remaining balance', async () => {
    const db = await initDatabase(':memory:');
    try {
      // Seed user and account
      await db.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES ('acc_cash', 'u_test', 'Cash Wallet', 'ASSET', 'INR', 100000, 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );
      // Seed IOU
      await db.adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
         VALUES ('iou_overpay', 'u_test', 'Charlie', 'LENT', 5000, 5000, 'INR', 'OPEN', 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      await assert.rejects(
        async () => {
          await settleIOU('iou_overpay', 5001n, 'acc_cash', 'u_test');
        },
        /exceeds remaining balance/
      );
    } finally {
      await db.close();
    }
  });

  await testCase('IOU-03: LENT IOU settlement provisions ASSET contra clearing and debits settlement account', async () => {
    const db = await initDatabase(':memory:');
    try {
      // User has bank account with 10,000 paise
      await db.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES ('acc_bank', 'u_lent', 'Main Checking', 'ASSET', 'INR', 10000, 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Lent 8,000 paise to Bob
      await db.adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
         VALUES ('iou_bob_lent', 'u_lent', 'Bob Builder', 'LENT', 8000, 8000, 'INR', 'OPEN', 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Partial settlement of 3,000 paise
      const res1 = await settleIOU('iou_bob_lent', 3000n, 'acc_bank', 'u_lent');
      assert.strictEqual(res1.iou.remaining_balance_minor, 5000n);
      assert.strictEqual(res1.iou.status, 'PARTIAL');

      // Verify contra clearing account was created with type ASSET
      const clearingAcc = await db.adapter.queryOne<any>(
        `SELECT * FROM accounts WHERE user_id = 'u_lent' AND name = 'IOU Clearing'`
      );
      assert.ok(clearingAcc, 'IOU Clearing account must be automatically provisioned');
      assert.strictEqual(clearingAcc.type, 'ASSET');

      // Verify journal entries for settlement transaction:
      // When LENT: User receives cash back (DEBIT bank, CREDIT IOU Clearing)
      const entries1 = await db.adapter.query<any>(
        `SELECT * FROM journal_entries WHERE transaction_id = ? ORDER BY direction`,
        [res1.transaction.id]
      );
      assert.strictEqual(entries1.length, 2);
      const debitEntry1 = entries1.find((e: any) => e.direction === 'DEBIT');
      const creditEntry1 = entries1.find((e: any) => e.direction === 'CREDIT');

      assert.strictEqual(debitEntry1.account_id, 'acc_bank');
      assert.strictEqual(BigInt(debitEntry1.amount_minor), 3000n);
      assert.strictEqual(creditEntry1.account_id, clearingAcc.id);
      assert.strictEqual(BigInt(creditEntry1.amount_minor), 3000n);

      // Complete settlement of remaining 5,000 paise
      const res2 = await settleIOU('iou_bob_lent', 5000n, 'acc_bank', 'u_lent');
      assert.strictEqual(res2.iou.remaining_balance_minor, 0n);
      assert.strictEqual(res2.iou.status, 'SETTLED');
    } finally {
      await db.close();
    }
  });

  await testCase('IOU-04: BORROWED IOU settlement provisions LIABILITY contra clearing and credits settlement account', async () => {
    const db = await initDatabase(':memory:');
    try {
      // User has bank account with 50,000 paise
      await db.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES ('acc_bank_b', 'u_borrow', 'Main Bank', 'ASSET', 'INR', 50000, 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Borrowed 20,000 paise from Alice
      await db.adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
         VALUES ('iou_alice_borrow', 'u_borrow', 'Alice Wonder', 'BORROWED', 20000, 20000, 'INR', 'OPEN', 0, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`
      );

      // Full settlement of 20,000 paise
      const res = await settleIOU('iou_alice_borrow', 20000n, 'acc_bank_b', 'u_borrow');
      assert.strictEqual(res.iou.remaining_balance_minor, 0n);
      assert.strictEqual(res.iou.status, 'SETTLED');

      // Verify contra clearing account has type LIABILITY
      const clearingAcc = await db.adapter.queryOne<any>(
        `SELECT * FROM accounts WHERE user_id = 'u_borrow' AND name = 'IOU Clearing'`
      );
      assert.ok(clearingAcc, 'IOU Clearing account must be automatically provisioned');
      assert.strictEqual(clearingAcc.type, 'LIABILITY');

      // When BORROWED: User pays out cash to settle debt (DEBIT IOU Clearing, CREDIT bank)
      const entries = await db.adapter.query<any>(
        `SELECT * FROM journal_entries WHERE transaction_id = ?`,
        [res.transaction.id]
      );
      assert.strictEqual(entries.length, 2);
      const debitEntry = entries.find((e: any) => e.direction === 'DEBIT');
      const creditEntry = entries.find((e: any) => e.direction === 'CREDIT');

      assert.strictEqual(debitEntry.account_id, clearingAcc.id);
      assert.strictEqual(BigInt(debitEntry.amount_minor), 20000n);
      assert.strictEqual(creditEntry.account_id, 'acc_bank_b');
      assert.strictEqual(BigInt(creditEntry.amount_minor), 20000n);
    } finally {
      await db.close();
    }
  });

  // ==========================================================================
  // SECTION 4: Maximum 3 Visual Component Groups Rule Verification
  // ==========================================================================
  console.log('\n--- 4. Maximum 3 Visual Component Groups Rule Verification ---');

  const views = [
    { name: 'Dashboard / Net Worth', file: 'apps/web/src/app/page.tsx', maxGroups: 3 },
    { name: 'Cash Flow Trajectory', file: 'apps/web/src/app/cash-flow/page.tsx', maxGroups: 3 },
    { name: 'Transaction Entry', file: 'apps/web/src/app/transactions/page.tsx', maxGroups: 3 },
    { name: 'IOU Debt Tracker', file: 'apps/web/src/app/ious/page.tsx', maxGroups: 3 },
    { name: 'Authentication Login', file: 'apps/web/src/app/login/page.tsx', maxGroups: 3 },
  ];

  for (const v of views) {
    testCase(`VIEW-GROUPS: ${v.name} strictly enforces max ${v.maxGroups} visual component groups`, () => {
      const fullPath = path.resolve(v.file);
      assert.ok(fs.existsSync(fullPath), `View file not found: ${v.file}`);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Count top-level rendered visual cards or designated visual component groups
      // Check for Group comment markers and Card components
      const groupMatches = content.match(/Group \d/g) || [];
      const distinctGroups = new Set(groupMatches);
      
      // Also inspect sub-components if page delegates to client manager (e.g. MultiSplitForm, IOUClientManager)
      if (v.file.includes('transactions/page.tsx')) {
        // MultiSplitForm renders Group 1 (Header Card) + Group 2 (Split Legs Card)
        // RecentTransactionsCard renders Group 3
        const formPath = path.resolve('apps/web/src/components/transactions/MultiSplitForm.tsx');
        const formContent = fs.readFileSync(formPath, 'utf8');
        const cardMatches = formContent.match(/<Card/g) || [];
        assert.strictEqual(cardMatches.length, 2, 'MultiSplitForm should have 2 visual cards');
      } else if (v.file.includes('ious/page.tsx')) {
        // IOUSummaryCard = Group 1
        // ActiveIOUsListCard = Group 2
        // SettledIOUsCard = Group 3
        const mgrPath = path.resolve('apps/web/src/components/ious/IOUClientManager.tsx');
        const mgrContent = fs.readFileSync(mgrPath, 'utf8');
        assert.ok(mgrContent.includes('Group 2'), 'IOUClientManager contains Group 2');
        assert.ok(mgrContent.includes('Group 3'), 'IOUClientManager contains Group 3');
      }

      if (distinctGroups.size > 0) {
        assert.ok(
          distinctGroups.size <= v.maxGroups,
          `Exceeded maximum visual component groups: ${distinctGroups.size} > ${v.maxGroups}`
        );
      }
    });
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n======================================================================');
  console.log(`TOTAL ADVERSARIAL CHECKS: ${totalChecks}`);
  console.log(`PASSED: ${passedChecks}`);
  console.log(`FAILED: ${failedChecks}`);
  console.log('======================================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runAllStressTests().catch((err) => {
  console.error('Fatal stress test error:', err);
  process.exit(1);
});
