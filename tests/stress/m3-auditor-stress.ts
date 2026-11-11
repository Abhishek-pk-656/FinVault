import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  initDatabase,
  NodeSQLiteAdapter,
  OutboxQueueManager,
  postTransaction,
  settleIOU,
  executeDeltaSync,
  computeAccountBalanceDelta,
  validateTransactionBalance,
  shouldRemoteOverwriteLocal
} from '../../packages/sync-engine/src/index.ts';

async function runAuditorStressTest() {
  console.log('============================================================');
  console.log('AUDITOR M3 ADVERSARIAL STRESS TEST & INTEGRITY PROBE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  async function check(desc: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        await res;
      }
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${desc}:`, err.message);
      throw err;
    }
  }

  // Section 1: Edge Function validate-transaction Static & Logic Verification
  console.log('--- SECTION 1: Edge Function validate-transaction Verification ---');

  const validateCode = fs.readFileSync('supabase/functions/validate-transaction/index.ts', 'utf8');

  await check('1.1 Edge Function handles OPTIONS CORS preflight and POST method restriction', () => {
    assert.ok(validateCode.includes(`req.method === 'OPTIONS'`));
    assert.ok(validateCode.includes(`req.method !== 'POST'`));
    assert.ok(validateCode.includes(`'METHOD_NOT_ALLOWED'`));
  });

  await check('1.2 Edge Function strictly rejects floating-point and non-integer numbers', () => {
    assert.ok(validateCode.includes(`!Number.isInteger(e.amount_minor)`));
    assert.ok(validateCode.includes(`'FLOATING_POINT_PROHIBITED'`));
  });

  await check('1.3 Edge Function strictly validates integer digit string regex (/^-?\\d+$/)', () => {
    assert.ok(validateCode.includes(`/^-?\\d+$/`));
    assert.ok(validateCode.includes(`'INVALID_MINOR_UNIT_STRING'`));
  });

  await check('1.4 Edge Function validates debit == credit equality and reports exact delta', () => {
    assert.ok(validateCode.includes(`debits !== credits`));
    assert.ok(validateCode.includes(`'DOUBLE_ENTRY_IMBALANCE'`));
  });

  // Section 2: Edge Function sync-reconcile Verification
  console.log('\n--- SECTION 2: Edge Function sync-reconcile Verification ---');

  const syncReconcileCode = fs.readFileSync('supabase/functions/sync-reconcile/index.ts', 'utf8');

  await check('2.1 sync-reconcile enforces Authorization Bearer token header', () => {
    assert.ok(syncReconcileCode.includes(`req.headers.get('Authorization')`));
    assert.ok(syncReconcileCode.includes(`!authHeader.startsWith('Bearer ')`));
  });

  await check('2.2 sync-reconcile validates transaction mutations for zero-float and double-entry', () => {
    assert.ok(syncReconcileCode.includes(`BigInt(e.amount_minor)`));
    assert.ok(syncReconcileCode.includes(`debits !== credits`));
    assert.ok(syncReconcileCode.includes(`'Double-entry balance violation'`));
  });

  // Section 3: SQLite Storage & BigInt Boundary Limits
  console.log('\n--- SECTION 3: SQLite Storage & BigInt Boundary Limits ---');

  await check('3.1 Negative 64-bit signed integer boundary is preserved exactly in SQLite', () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    adapter.exec('CREATE TABLE test_int64 (id TEXT PRIMARY KEY, val INTEGER);');
    const minInt64 = -9223372036854775808n;
    adapter.run('INSERT INTO test_int64 VALUES (?, ?)', ['min', minInt64]);
    const row = adapter.queryOne<{ val: bigint }>('SELECT val FROM test_int64 WHERE id = ?', ['min']);
    assert.ok(row);
    assert.equal(typeof row.val, 'bigint');
    assert.equal(row.val, minInt64);
    adapter.close();
  });

  await check('3.2 Positive 64-bit signed integer boundary (Int64 Max) preserved exactly', () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    adapter.exec('CREATE TABLE test_int64_max (id TEXT PRIMARY KEY, val INTEGER);');
    const maxInt64 = 9223372036854775807n;
    adapter.run('INSERT INTO test_int64_max VALUES (?, ?)', ['max', maxInt64]);
    const row = adapter.queryOne<{ val: bigint }>('SELECT val FROM test_int64_max WHERE id = ?', ['max']);
    assert.ok(row);
    assert.equal(typeof row.val, 'bigint');
    assert.equal(row.val, maxInt64);
    adapter.close();
  });

  // Section 4: Delta Sync Determinism & LWW Corner Cases
  console.log('\n--- SECTION 4: Delta Sync Determinism & LWW Corner Cases ---');

  await check('4.1 LWW tie-break by ID is case-sensitive lexicographical and deterministic', () => {
    const rem = { id: 'uuid-b', version: 2n, updated_at: '2026-11-08T10:00:00Z' };
    const loc = { id: 'uuid-a', version: 2n, updated_at: '2026-11-08T10:00:00Z' };
    assert.equal(shouldRemoteOverwriteLocal(rem, loc), true);
    assert.equal(shouldRemoteOverwriteLocal(loc, rem), false);
  });

  await check('4.2 settleIOU with non-existent IOU throws expected error', async () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await assert.rejects(async () => {
      await settleIOU('non-existent-iou', 1000n, 'any-acc');
    }, /IOU not found: non-existent-iou/);
  });

  await check('4.3 OutboxQueueManager handles batch mutations with correct chronological ordering', async () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    const m1 = await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'transactions',
      record_id: 'tx1',
      payload: '{}',
      created_at: '2026-11-08T10:00:00Z'
    });

    const m2 = await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'transactions',
      record_id: 'tx2',
      payload: '{}',
      created_at: '2026-11-08T09:00:00Z' // Earlier timestamp
    });

    const pending = await outbox.getPending();
    assert.equal(pending.length, 2);
    // Earlier timestamp must come first
    assert.equal(pending[0].id, m2);
    assert.equal(pending[1].id, m1);
  });

  console.log('\n============================================================');
  console.log(`AUDITOR STRESS TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('============================================================');
}

runAuditorStressTest().catch(err => {
  console.error('Auditor Stress Test Failed:', err);
  process.exit(1);
});
