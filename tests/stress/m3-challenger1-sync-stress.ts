/**
 * FinVault Milestone 3 Adversarial Stress Test Suite
 * Agent: Challenger 1 (challenger_m3_1)
 *
 * Empirically stress-tests packages/sync-engine on:
 * 1. Outbox Queue Progression & Concurrency under rapid/high-volume batch mutations (100+ mutations, retry progression to DLQ)
 * 2. Delta Sync Push Replay & Deduplication with pre-existing idempotency keys (Mode A & Mode B)
 * 3. Delta Sync Pull Last-Write-Wins (LWW): exact tie-breaking, remote overwrite, stale remote ignored, 100-account batch
 * 4. Extreme 64-bit BigInt amounts (> 2^53 - 1, up to Int64 Max: 9,223,372,036,854,775,807n) through postTransaction, getAccounts, and NodeSQLiteAdapter
 * 5. Corrupted payload isolation, 1-paise discrepancy rejection at Int64 boundary, and IOU BigInt settlements
 */

import * as crypto from 'node:crypto';
import {
  initDatabase,
  getAccounts,
  postTransaction,
  settleIOU,
  enqueueMutation,
  executeDeltaSync,
  NodeSQLiteAdapter,
  OutboxQueueManager,
  MAX_SYNC_RETRIES,
  computeAccountBalanceDelta,
  validateTransactionBalance,
  shouldRemoteOverwriteLocal,
  CLIENT_SQLITE_SCHEMA
} from '../../packages/sync-engine/src/index.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}${details ? ': ' + details : ''}`);
  }
}

async function runAllStressTests(): Promise<void> {
  console.log('============================================================');
  console.log('CHALLENGER 1: FINVAULT M3 ADVERSARIAL STRESS TEST HARNESS');
  console.log('============================================================\n');

  // =========================================================================
  // SECTION 1: OUTBOX QUEUE PROGRESSION & CONCURRENCY UNDER RAPID MUTATIONS
  // =========================================================================
  console.log('--- SECTION 1: Outbox Queue Progression & Concurrency Stress ---');

  // 1.1 Rapid Enqueue of 100 Mutations
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    const tables = ['transactions', 'accounts', 'iou_records', 'sinking_funds'];
    const mutationIds: string[] = [];

    for (let i = 0; i < 100; i++) {
      const table = tables[i % tables.length]!;
      const id = await outbox.enqueue({
        operation: i % 2 === 0 ? 'INSERT' : 'UPDATE',
        table_name: table,
        record_id: `rec_${i}`,
        payload: JSON.stringify({ index: i, table, timestamp: Date.now() }),
        created_at: new Date(Date.now() + i * 10).toISOString()
      });
      mutationIds.push(id);
    }

    assert(mutationIds.length === 100, '1.1.1 100 mutations generated and enqueued');

    const pending = await outbox.getPending();
    assert(pending.length === 100, '1.1.2 getPending() returns all 100 mutations');

    // Verify strict chronological ordering
    let isChronological = true;
    for (let i = 1; i < pending.length; i++) {
      const prevTime = pending[i - 1]!.created_at || '';
      const currTime = pending[i]!.created_at || '';
      if (prevTime > currTime) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, '1.1.3 getPending() preserves strict chronological order');

    // All must be PENDING with retry_count = 0
    const allPendingZero = pending.every(p => p.status === 'PENDING' && p.retry_count === 0);
    assert(allPendingZero, '1.1.4 All 100 mutations initialized with status PENDING and retry_count 0');

    adapter.close();
  }

  // 1.2 Concurrent / Parallel Enqueue via Promise.all
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    const promises = Array.from({ length: 60 }, (_, i) =>
      outbox.enqueue({
        operation: 'INSERT',
        table_name: 'transactions',
        record_id: `tx_parallel_${i}`,
        payload: JSON.stringify({ tx: i }),
        created_at: new Date(Date.now() + (i % 5)).toISOString()
      })
    );

    const results = await Promise.all(promises);
    assert(results.length === 60, '1.2.1 60 concurrent mutations enqueued without lock contention or write drops');

    const pending = await outbox.getPending();
    assert(pending.length === 60, '1.2.2 getPending() accurately retrieves all 60 concurrent entries');

    adapter.close();
  }

  // 1.3 Outbox Queue Progression & FIFO Batch Draining (100 items)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    for (let i = 0; i < 100; i++) {
      await outbox.enqueue({
        operation: 'INSERT',
        table_name: 'accounts',
        record_id: `acc_drain_${i}`,
        payload: JSON.stringify({ accountIndex: i })
      });
    }

    const pendingBefore = await outbox.getPending();
    assert(pendingBefore.length === 100, '1.3.1 Queue populated with 100 items for draining test');

    // Simulate batch worker processing FIFO
    for (const item of pendingBefore) {
      await outbox.markInFlight(item.id);
      // Verify row is IN_FLIGHT
      const rowInFlight = adapter.queryOne<{ status: string }>('SELECT status FROM sync_queue WHERE id = ?', [item.id]);
      if (rowInFlight?.status !== 'IN_FLIGHT') {
        throw new Error(`Item ${item.id} failed to transition to IN_FLIGHT`);
      }
      await outbox.markSynced(item.id);
    }

    const pendingAfter = await outbox.getPending();
    assert(pendingAfter.length === 0, '1.3.2 All 100 mutations transitioned from PENDING -> IN_FLIGHT -> SYNCED, draining queue');

    const syncedCount = adapter.queryOne<{ count: bigint | number }>('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['SYNCED']);
    assert(Number(syncedCount?.count) === 100, '1.3.3 Exactly 100 records marked SYNCED in SQLite');

    adapter.close();
  }

  // 1.4 Adversarial Retry Progression & Dead-Letter Queue (DLQ)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    // Enqueue 20 mutations destined to fail
    const failingIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = await outbox.enqueue({
        operation: 'INSERT',
        table_name: 'transactions',
        record_id: `failing_tx_${i}`,
        payload: '{"corrupted": true}'
      });
      failingIds.push(id);
    }

    // Step through 4 retries: status stays PENDING, retry_count increments
    for (let attempt = 1; attempt < MAX_SYNC_RETRIES; attempt++) {
      for (const id of failingIds) {
        await outbox.markFailed(id, `Transient failure attempt ${attempt}`);
      }

      const pending = await outbox.getPending();
      assert(pending.length === 20, `1.4.${attempt} Attempt ${attempt}: All 20 items remain PENDING for retry`);
      const allRetryCountMatch = pending.every(p => p.retry_count === attempt);
      assert(allRetryCountMatch, `1.4.${attempt}b Attempt ${attempt}: All 20 items have retry_count === ${attempt}`);
    }

    // 5th failure: MAX_SYNC_RETRIES reached -> transitions to FAILED (Dead-Letter)
    for (const id of failingIds) {
      await outbox.markFailed(id, 'Final threshold reached');
    }

    const pendingFinal = await outbox.getPending();
    assert(pendingFinal.length === 0, '1.4.5 On 5th retry, all 20 items transition to FAILED and are excluded from getPending()');

    const failedCount = adapter.queryOne<{ count: bigint | number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ? AND retry_count = ?',
      ['FAILED', MAX_SYNC_RETRIES]
    );
    assert(Number(failedCount?.count) === 20, '1.4.6 SQLite sync_queue records all 20 items in DLQ state (FAILED, retry_count=5)');

    adapter.close();
  }

  // 1.5 Mixed Success & Failure Queue Ingestion (50 Items)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    for (let i = 0; i < 50; i++) {
      await outbox.enqueue({
        operation: 'INSERT',
        table_name: 'transactions',
        record_id: `mixed_tx_${i}`,
        payload: JSON.stringify({ index: i })
      });
    }

    const batch = await outbox.getPending();
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i]!;
      if (i % 2 === 0) {
        // Even indices succeed immediately
        await outbox.markInFlight(item.id);
        await outbox.markSynced(item.id);
      } else {
        // Odd indices fail up to DLQ
        for (let r = 0; r < MAX_SYNC_RETRIES; r++) {
          await outbox.markFailed(item.id, `Simulated network drop ${r}`);
        }
      }
    }

    const remainingPending = await outbox.getPending();
    assert(remainingPending.length === 0, '1.5.1 Mixed batch drains completely with 0 remaining PENDING items');

    const synced = adapter.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['SYNCED']);
    const failed = adapter.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['FAILED']);
    assert(Number(synced?.count) === 25, '1.5.2 Exactly 25 successful mutations marked SYNCED');
    assert(Number(failed?.count) === 25, '1.5.3 Exactly 25 failed mutations cleanly transitioned to FAILED');

    adapter.close();
  }

  // 1.6 Graceful Handling of Unknown Mutation Transitions
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    let threw = false;
    try {
      await outbox.markInFlight('non-existent-uuid-1');
      await outbox.markSynced('non-existent-uuid-2');
      await outbox.markFailed('non-existent-uuid-3', 'Err');
    } catch {
      threw = true;
    }
    assert(!threw, '1.6.1 Unknown mutation IDs transition gracefully without throwing unhandled exceptions');

    adapter.close();
  }

  console.log();

  // =========================================================================
  // SECTION 2: DELTA SYNC PUSH REPLAY & IDEMPOTENCY KEY DEDUPLICATION
  // =========================================================================
  console.log('--- SECTION 2: Delta Sync Push Replay & Idempotency Deduplication ---');

  // 2.1 Batch Push with 50 Mutations (25 Pre-existing Replays, 25 New) - Mode A
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_cash_s2', 'u_s2', 'Cash', 'ASSET', 'INR', 1000000, '2026-11-09', '2026-11-09'),
              ('acc_exp_s2', 'u_s2', 'Expense', 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);

    const allKeys: string[] = [];
    for (let i = 0; i < 50; i++) {
      const key = `idemp_stress_${i}_${crypto.randomUUID()}`;
      allKeys.push(key);
      await txOps.postTransaction({
        idempotency_key: key,
        transaction_date: '2026-11-09',
        description: `Stress Tx ${i}`,
        entries: [
          { account_id: 'acc_exp_s2', amount_minor: 100n, direction: 'DEBIT' },
          { account_id: 'acc_cash_s2', amount_minor: 100n, direction: 'CREDIT' }
        ]
      }, 'u_s2');
    }

    // Remote mock harness has first 25 keys ALREADY registered (replay scenario)
    const serverExistingKeys = new Set<string>(allKeys.slice(0, 25));
    const serverPostedList: any[] = [];

    const mockServerHarness = {
      idempotencyKeys: serverExistingKeys,
      postTransaction(_session: any, params: any) {
        serverPostedList.push(params);
        serverExistingKeys.add(params.idempotencyKey);
      },
      getAccounts() {
        return [];
      }
    };

    const syncResult = await executeDeltaSync(adapter, mockServerHarness, { userId: 'u_s2' });

    assert(syncResult.success === true, '2.1.1 executeDeltaSync succeeded on 50-item mixed batch');
    assert(syncResult.pushed === 50, '2.1.2 Exactly 50 mutations pushed/acknowledged');
    assert(serverPostedList.length === 25, '2.1.3 Exactly 25 new transactions posted; 25 replays skipped without duplication');

    // Local outbox queue must be 100% drained
    const outbox = new OutboxQueueManager(adapter);
    const pending = await outbox.getPending();
    assert(pending.length === 0, '2.1.4 Local outbox queue completely drained (0 PENDING)');

    const syncedRows = adapter.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['SYNCED']
    );
    assert(Number(syncedRows?.count) === 50, '2.1.5 All 50 local mutations marked SYNCED');

    adapter.close();
  }

  // 2.2 Delta Sync Push Replay - Mode B (Production Supabase Client Simulation)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_b_src', 'u_b', 'Source', 'ASSET', 'INR', 500000, '2026-11-09', '2026-11-09'),
              ('acc_b_dst', 'u_b', 'Dest', 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);

    const generatedKeys: string[] = [];
    for (let i = 0; i < 30; i++) {
      const key = `mode_b_key_${i}_${crypto.randomUUID()}`;
      generatedKeys.push(key);
      await txOps.postTransaction({
        idempotency_key: key,
        transaction_date: '2026-11-09',
        description: `Mode B Tx ${i}`,
        entries: [
          { account_id: 'acc_b_dst', amount_minor: 50n, direction: 'DEBIT' },
          { account_id: 'acc_b_src', amount_minor: 50n, direction: 'CREDIT' }
        ]
      }, 'u_b');
    }

    // Simulate Supabase JS client where 15 keys already exist on server
    const serverStoredTxs = new Map<string, any>();
    for (let i = 0; i < 15; i++) {
      serverStoredTxs.set(generatedKeys[i]!, { id: `remote_tx_${i}`, idempotency_key: generatedKeys[i]! });
    }

    const rpcCalls: any[] = [];
    const mockSupabaseJs = {
      from(table: string) {
        if (table === 'transactions') {
          return {
            select(_cols: string) {
              return {
                eq(field: string, val: string) {
                  return {
                    maybeSingle: async () => {
                      if (field === 'idempotency_key' && serverStoredTxs.has(val)) {
                        return { data: serverStoredTxs.get(val), error: null };
                      }
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        }
        if (table === 'accounts') {
          return {
            select(_cols: string) {
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
        return {};
      },
      rpc(fnName: string, params: any) {
        rpcCalls.push({ fnName, params });
        serverStoredTxs.set(params.p_idempotency_key, { id: `rpc_tx_${rpcCalls.length}`, idempotency_key: params.p_idempotency_key });
        return Promise.resolve({ data: { success: true }, error: null });
      }
    };

    const result = await executeDeltaSync(adapter, mockSupabaseJs, { userId: 'u_b' });

    assert(result.success === true, '2.2.1 Mode B executeDeltaSync executed cleanly');
    assert(result.pushed === 30, '2.2.2 All 30 mutations acknowledged');
    assert(rpcCalls.length === 15, '2.2.3 RPC post_transaction invoked ONLY for the 15 non-existent transactions');

    const outbox = new OutboxQueueManager(adapter);
    const pending = await outbox.getPending();
    assert(pending.length === 0, '2.2.4 All 30 mutations marked SYNCED in local SQLite');

    adapter.close();
  }

  // 2.3 Double Replay Idempotency (Immediate Second Sync)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_d1', 'u_d', 'Account 1', 'ASSET', 'INR', 1000, '2026-11-09', '2026-11-09'),
              ('acc_d2', 'u_d', 'Account 2', 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    await txOps.postTransaction({
      idempotency_key: 'double_sync_key',
      transaction_date: '2026-11-09',
      description: 'Single Tx',
      entries: [
        { account_id: 'acc_d2', amount_minor: 100n, direction: 'DEBIT' },
        { account_id: 'acc_d1', amount_minor: 100n, direction: 'CREDIT' }
      ]
    }, 'u_d');

    let postCount = 0;
    const harness = {
      idempotencyKeys: new Set<string>(),
      postTransaction(_session: any, params: any) {
        postCount++;
        this.idempotencyKeys.add(params.idempotencyKey);
      },
      getAccounts: () => []
    };

    // First Sync
    const res1 = await executeDeltaSync(adapter, harness, { userId: 'u_d' });
    assert(res1.pushed === 1, '2.3.1 First sync pushes 1 transaction');
    assert(postCount === 1, '2.3.2 Server receives exactly 1 postTransaction');

    // Immediate Second Sync
    const res2 = await executeDeltaSync(adapter, harness, { userId: 'u_d' });
    assert(res2.pushed === 0, '2.3.3 Second sync pushes 0 transactions (outbox clean)');
    assert(postCount === 1, '2.3.4 Server received 0 additional posts on second sync');
    assert(res2.success === true, '2.3.5 Second sync reports success: true');

    adapter.close();
  }

  // 2.4 Middle-Batch Network Interruption & Resumption
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_n_src', 'u_net', 'Bank', 'ASSET', 'INR', 100000, '2026-11-09', '2026-11-09'),
              ('acc_n_dst', 'u_net', 'Exp', 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    for (let i = 0; i < 20; i++) {
      await txOps.postTransaction({
        idempotency_key: `net_drop_${i}`,
        transaction_date: '2026-11-09',
        description: `Tx ${i}`,
        entries: [
          { account_id: 'acc_n_dst', amount_minor: 10n, direction: 'DEBIT' },
          { account_id: 'acc_n_src', amount_minor: 10n, direction: 'CREDIT' }
        ]
      }, 'u_net');
    }

    // Server that crashes on transaction 11
    let callsReceived = 0;
    const failingServer = {
      idempotencyKeys: new Set<string>(),
      postTransaction(_session: any, params: any) {
        callsReceived++;
        if (callsReceived > 10) {
          throw new Error('Connection reset by peer at mutation 11');
        }
        this.idempotencyKeys.add(params.idempotencyKey);
      },
      getAccounts: () => []
    };

    const resFail = await executeDeltaSync(adapter, failingServer, { userId: 'u_net' });
    assert(resFail.success === false, '2.4.1 Interrupted sync reports success: false');
    assert(resFail.pushed === 10, '2.4.2 First 10 transactions successfully pushed and committed');
    assert(resFail.errors.length === 10, '2.4.3 Remaining 10 transactions captured push error');

    // Verify first 10 marked SYNCED, item 11 marked PENDING with retry_count 1
    const outbox = new OutboxQueueManager(adapter);
    const pendingAfterCrash = await outbox.getPending();
    assert(pendingAfterCrash.length === 10, '2.4.4 Exactly 10 items remain PENDING in outbox for resumption');
    assert(pendingAfterCrash[0]!.retry_count === 1, '2.4.5 Item 11 has retry_count === 1');

    // Second sync: Network recovered!
    const recoveredServer = {
      idempotencyKeys: failingServer.idempotencyKeys, // already has first 10 keys
      postTransaction(_session: any, params: any) {
        this.idempotencyKeys.add(params.idempotencyKey);
      },
      getAccounts: () => []
    };

    const resRecovered = await executeDeltaSync(adapter, recoveredServer, { userId: 'u_net' });
    assert(resRecovered.success === true, '2.4.6 Second sync after recovery succeeds');
    assert(resRecovered.pushed === 10, '2.4.7 Exactly the remaining 10 items pushed');

    const pendingFinal = await outbox.getPending();
    assert(pendingFinal.length === 0, '2.4.8 Queue completely cleared after recovery sync');

    adapter.close();
  }

  console.log();

  // =========================================================================
  // SECTION 3: DELTA SYNC PULL LAST-WRITE-WINS (LWW) CONFLICT RESOLUTION
  // =========================================================================
  console.log('--- SECTION 3: Delta Sync Pull Last-Write-Wins (LWW) Resolution ---');

  // 3.1 Exhaustive LWW Deterministic Matrix Tests
  {
    // Test 1: Version strictly higher (remote > local) -> true
    assert(
      shouldRemoteOverwriteLocal({ id: 'a', version: 5n }, { id: 'a', version: 4n }) === true,
      '3.1.1 Higher remote version (5 > 4) overwrites local'
    );

    // Test 2: Version strictly lower (remote < local) -> false
    assert(
      shouldRemoteOverwriteLocal({ id: 'a', version: 3n }, { id: 'a', version: 4n }) === false,
      '3.1.2 Stale remote version (3 < 4) ignored'
    );

    // Test 3: Same version, remote timestamp newer -> true
    assert(
      shouldRemoteOverwriteLocal(
        { id: 'a', version: 2n, updated_at: '2026-11-09T10:00:00.000Z' },
        { id: 'a', version: 2n, updated_at: '2026-11-09T09:00:00.000Z' }
      ) === true,
      '3.1.3 Same version: remote newer timestamp wins'
    );

    // Test 4: Same version, local timestamp newer -> false
    assert(
      shouldRemoteOverwriteLocal(
        { id: 'a', version: 2n, updated_at: '2026-11-09T08:00:00.000Z' },
        { id: 'a', version: 2n, updated_at: '2026-11-09T09:00:00.000Z' }
      ) === false,
      '3.1.4 Same version: local newer timestamp preserved'
    );

    // Test 5: Same version, identical timestamp: deterministic ID comparison
    assert(
      shouldRemoteOverwriteLocal(
        { id: 'uuid-b', version: 1n, updated_at: '2026-11-09T10:00:00Z' },
        { id: 'uuid-a', version: 1n, updated_at: '2026-11-09T10:00:00Z' }
      ) === true,
      '3.1.5 Tie-break by ID: remote "uuid-b" >= local "uuid-a" wins'
    );

    assert(
      shouldRemoteOverwriteLocal(
        { id: 'uuid-a', version: 1n, updated_at: '2026-11-09T10:00:00Z' },
        { id: 'uuid-b', version: 1n, updated_at: '2026-11-09T10:00:00Z' }
      ) === false,
      '3.1.6 Tie-break by ID: remote "uuid-a" < local "uuid-b" loses'
    );

    // Test 6: Identical ID, version, and timestamp: returns true (idempotent overwrite)
    assert(
      shouldRemoteOverwriteLocal(
        { id: 'uuid-x', version: 1n, updated_at: '2026-11-09T10:00:00Z' },
        { id: 'uuid-x', version: 1n, updated_at: '2026-11-09T10:00:00Z' }
      ) === true,
      '3.1.7 Identical ID, version & timestamp: evaluates true deterministically'
    );

    // Test 7: Null/Undefined versions and timestamps fallback gracefully to 1n and ''
    assert(
      shouldRemoteOverwriteLocal(
        { id: 'u1' },
        { id: 'u1' }
      ) === true,
      '3.1.8 Missing version and timestamp defaults handled without crashing'
    );
  }

  // 3.2 High-Volume 100-Account Pull Stress Test
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    // Seed local SQLite with 75 accounts:
    // 0..24: Version 1 (will be updated by higher remote Version 3)
    // 25..49: Version 4 (will be preserved against stale remote Version 1)
    // 50..64: Version 2, updated_at 08:00 (will be overwritten by remote Version 2, updated_at 12:00)
    // 65..74: Version 2, updated_at 14:00 (will be preserved against remote Version 2, updated_at 10:00)
    for (let i = 0; i < 25; i++) {
      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, 'u_lww_100', ?, 'ASSET', 'INR', 1000, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 1)`,
        [`acc_group1_${i}`, `Local Group 1 Old ${i}`]
      );
    }
    for (let i = 25; i < 50; i++) {
      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, 'u_lww_100', ?, 'ASSET', 'INR', 4000, '2026-11-09T00:00:00Z', '2026-11-09T00:00:00Z', 4)`,
        [`acc_group2_${i}`, `Local Group 2 High ${i}`]
      );
    }
    for (let i = 50; i < 65; i++) {
      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, 'u_lww_100', ?, 'ASSET', 'INR', 2000, '2026-11-09T00:00:00Z', '2026-11-09T08:00:00Z', 2)`,
        [`acc_group3_${i}`, `Local Group 3 OldTS ${i}`]
      );
    }
    for (let i = 65; i < 75; i++) {
      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, 'u_lww_100', ?, 'ASSET', 'INR', 2000, '2026-11-09T00:00:00Z', '2026-11-09T14:00:00Z', 2)`,
        [`acc_group4_${i}`, `Local Group 4 NewTS ${i}`]
      );
    }

    // Remote server returns 100 accounts:
    // Group 1 (25 items): Higher Version (v3) -> Remote Overwrites Local
    // Group 2 (25 items): Stale Version (v1) -> Stale Remote Ignored
    // Group 3 (15 items): Same Version (v2), Newer TS (12:00 > 08:00) -> Remote Overwrites Local
    // Group 4 (10 items): Same Version (v2), Older TS (10:00 < 14:00) -> Stale Remote Ignored
    // Group 5 (25 items): Brand New Remote Accounts -> Inserted Locally
    const remoteAccounts: any[] = [];

    for (let i = 0; i < 25; i++) {
      remoteAccounts.push({
        id: `acc_group1_${i}`,
        user_id: 'u_lww_100',
        name: `Remote Group 1 New ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: 99999n,
        version: 3n,
        updated_at: '2026-11-09T05:00:00Z'
      });
    }

    for (let i = 25; i < 50; i++) {
      remoteAccounts.push({
        id: `acc_group2_${i}`,
        user_id: 'u_lww_100',
        name: `Stale Remote ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: 11111n,
        version: 1n, // Stale! Local has v4
        updated_at: '2026-11-09T01:00:00Z'
      });
    }

    for (let i = 50; i < 65; i++) {
      remoteAccounts.push({
        id: `acc_group3_${i}`,
        user_id: 'u_lww_100',
        name: `Remote Group 3 NewerTS ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: 33333n,
        version: 2n,
        updated_at: '2026-11-09T12:00:00Z' // Newer than local 08:00
      });
    }

    for (let i = 65; i < 75; i++) {
      remoteAccounts.push({
        id: `acc_group4_${i}`,
        user_id: 'u_lww_100',
        name: `Stale TS Remote ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: 44444n,
        version: 2n,
        updated_at: '2026-11-09T10:00:00Z' // Older than local 14:00
      });
    }

    for (let i = 0; i < 25; i++) {
      remoteAccounts.push({
        id: `acc_group5_new_${i}`,
        user_id: 'u_lww_100',
        name: `Brand New Cloud Acc ${i}`,
        type: 'ASSET',
        currency: 'INR',
        balance_minor: 55555n,
        version: 1n,
        updated_at: '2026-11-09T12:00:00Z'
      });
    }

    const mockPullHarness = {
      getAccounts() {
        return remoteAccounts;
      }
    };

    const pullResult = await executeDeltaSync(adapter, mockPullHarness, { userId: 'u_lww_100' });

    assert(pullResult.success === true, '3.2.1 Delta sync pull succeeded on 100-account heterogeneous batch');
    // Pulled = 25 (brand new) + 25 (Group 1 higher ver) + 15 (Group 3 newer TS) = 65
    assert(pullResult.pulled === 65, '3.2.2 Exactly 65 accounts applied locally (25 new + 40 overwrites)');
    // Conflicts resolved = 25 (Group 1) + 15 (Group 3) = 40
    assert(pullResult.conflictsResolved === 40, '3.2.3 Exactly 40 LWW conflicts resolved via overwriting');

    // Deep check individual account states
    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const allAccounts = await accountsOps.getAccounts('u_lww_100');

    // Total accounts: 75 original + 25 brand new = 100
    assert(allAccounts.length === 100, '3.2.4 Database contains exactly 100 accounts after pull');

    // Verify Group 1: all updated to Remote New and version 3
    const group1Verified = allAccounts.filter(a => a.id.startsWith('acc_group1_')).every(
      a => a.name.startsWith('Remote Group 1 New') && a.version === 3n && a.balance_minor === 99999n
    );
    assert(group1Verified, '3.2.5 All Group 1 accounts overwritten with remote version 3 and balance 99999');

    // Verify Group 2: all preserved local High and version 4 (stale remote ignored)
    const group2Verified = allAccounts.filter(a => a.id.startsWith('acc_group2_')).every(
      a => a.name.startsWith('Local Group 2 High') && a.version === 4n && a.balance_minor === 4000n
    );
    assert(group2Verified, '3.2.6 All Group 2 accounts preserved local state (stale remote version 1 ignored)');

    // Verify Group 3: all updated with newer timestamp
    const group3Verified = allAccounts.filter(a => a.id.startsWith('acc_group3_')).every(
      a => a.name.startsWith('Remote Group 3 NewerTS') && a.balance_minor === 33333n
    );
    assert(group3Verified, '3.2.7 All Group 3 accounts overwritten due to newer remote timestamp');

    // Verify Group 4: all preserved due to newer local timestamp
    const group4Verified = allAccounts.filter(a => a.id.startsWith('acc_group4_')).every(
      a => a.name.startsWith('Local Group 4 NewTS') && a.balance_minor === 2000n
    );
    assert(group4Verified, '3.2.8 All Group 4 accounts preserved due to newer local timestamp');

    // Verify Group 5: brand new accounts inserted cleanly
    const group5Verified = allAccounts.filter(a => a.id.startsWith('acc_group5_new_')).every(
      a => a.name.startsWith('Brand New Cloud Acc') && a.version === 1n && a.balance_minor === 55555n
    );
    assert(group5Verified, '3.2.9 All 25 brand new accounts inserted with correct schema fields and balance');

    adapter.close();
  }

  console.log();

  // =========================================================================
  // SECTION 4: EXTREME 64-BIT BIGINT AMOUNTS (> 2^53 - 1 UP TO INT64 MAX)
  // =========================================================================
  console.log('--- SECTION 4: Extreme 64-bit BigInt Amounts (> 2^53 - 1, Int64 Max) ---');

  const MAX_SAFE = 9007199254740991n; // 2^53 - 1
  const BEYOND_SAFE = 9007199254740992n; // 2^53
  const QUAD_BILLION = 4611686018427387904n; // 2^62
  const INT64_MAX_MINUS_1 = 9223372036854775806n;
  const INT64_MAX = 9223372036854775807n; // 2^63 - 1
  const INT64_MIN = -9223372036854775808n; // -2^63

  // 4.1 NodeSQLiteAdapter Precision Across Full Int64 Boundary Spectrum
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    adapter.exec('CREATE TABLE bigint_stress (id TEXT PRIMARY KEY, amount INTEGER);');

    const boundaryCases: Array<{ label: string; val: bigint }> = [
      { label: '0n', val: 0n },
      { label: '1n (1 paise)', val: 1n },
      { label: 'Number.MAX_SAFE_INTEGER (2^53 - 1)', val: MAX_SAFE },
      { label: '2^53 (beyond IEEE-754 precision)', val: BEYOND_SAFE },
      { label: '2^53 + 7 (detects float rounding loss)', val: MAX_SAFE + 8n },
      { label: '10^16 (10 Quadrillion paise)', val: 10000000000000000n },
      { label: '2^62', val: QUAD_BILLION },
      { label: 'Int64 Max - 1', val: INT64_MAX_MINUS_1 },
      { label: 'Int64 Max (9,223,372,036,854,775,807n)', val: INT64_MAX },
      { label: 'Int64 Min (-9,223,372,036,854,775,808n)', val: INT64_MIN }
    ];

    for (const b of boundaryCases) {
      adapter.run('INSERT INTO bigint_stress (id, amount) VALUES (?, ?)', [b.label, b.val]);
      const row = adapter.queryOne<{ id: string; amount: bigint }>('SELECT * FROM bigint_stress WHERE id = ?', [b.label]);

      assert(row !== null, `4.1 Inserted and retrieved ${b.label}`);
      assert(typeof row?.amount === 'bigint', `4.1.${b.label} amount is native JavaScript bigint`);
      assert(row?.amount === b.val, `4.1.${b.label} exact lossless match: ${row?.amount} === ${b.val}`);
    }

    adapter.close();
  }

  // 4.2 postTransaction with Int64 Max (9,223,372,036,854,775,807n)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_max_asset', 'u_max', 'Vault Asset', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('acc_max_equity', 'u_max', 'Vault Equity', 'EQUITY', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    const tx = await txOps.postTransaction({
      idempotency_key: 'max_int64_tx_key',
      transaction_date: '2026-11-09',
      description: 'Capital at Int64 Max',
      entries: [
        { account_id: 'acc_max_asset', amount_minor: INT64_MAX, direction: 'DEBIT' },
        { account_id: 'acc_max_equity', amount_minor: INT64_MAX, direction: 'CREDIT' }
      ]
    }, 'u_max');

    assert(Boolean(tx.id), '4.2.1 Transaction at Int64 Max posted successfully');

    // Verify journal entries store exact Int64 Max
    const journalEntries = adapter.query<{ account_id: string; amount_minor: bigint; direction: string }>(
      'SELECT account_id, amount_minor, direction FROM journal_entries WHERE transaction_id = ?',
      [tx.id]
    );
    assert(journalEntries.length === 2, '4.2.2 Exactly 2 journal entries stored');
    assert(journalEntries[0]!.amount_minor === INT64_MAX, '4.2.3 Entry 1 amount_minor is exact INT64_MAX');
    assert(journalEntries[1]!.amount_minor === INT64_MAX, '4.2.4 Entry 2 amount_minor is exact INT64_MAX');

    // Verify account balances updated to INT64_MAX
    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const accounts = await accountsOps.getAccounts('u_max');
    const asset = accounts.find(a => a.id === 'acc_max_asset')!;
    const equity = accounts.find(a => a.id === 'acc_max_equity')!;

    assert(typeof asset.balance_minor === 'bigint', '4.2.5 Asset balance is native bigint');
    assert(asset.balance_minor === INT64_MAX, `4.2.6 Asset balance is exact INT64_MAX (${asset.balance_minor})`);
    assert(typeof equity.balance_minor === 'bigint', '4.2.7 Equity balance is native bigint');
    assert(equity.balance_minor === INT64_MAX, `4.2.8 Equity balance is exact INT64_MAX (${equity.balance_minor})`);

    // Verify sync_queue JSON payload preserves string representation without float conversion
    const outbox = new OutboxQueueManager(adapter);
    const pending = await outbox.getPending();
    assert(pending.length === 1, '4.2.9 Transaction payload enqueued to outbox');
    const payload = JSON.parse(pending[0]!.payload);
    assert(payload.entries[0].amount_minor === INT64_MAX.toString(), '4.2.10 Payload entry 1 amount_minor serialized losslessly as decimal string');
    assert(BigInt(payload.entries[0].amount_minor) === INT64_MAX, '4.2.11 Payload string parses back to exact INT64_MAX BigInt');

    adapter.close();
  }

  // 4.3 Multi-Split Balanced Transaction Exceeding 2^53 - 1
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('split_a1', 'u_split', 'Split Asset 1', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('split_a2', 'u_split', 'Split Asset 2', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('split_a3', 'u_split', 'Split Asset 3', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('split_eq', 'u_split', 'Split Equity Total', 'EQUITY', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    // 3 Debits summing exactly to INT64_MAX:
    // Debit 1: 3,000,000,000,000,000,000n
    // Debit 2: 3,000,000,000,000,000,000n
    // Debit 3: 3,223,372,036,854,775,807n
    // Total Credits: 9,223,372,036,854,775,807n
    const d1 = 3000000000000000000n;
    const d2 = 3000000000000000000n;
    const d3 = 3223372036854775807n;
    const totalCredit = d1 + d2 + d3; // 9,223,372,036,854,775,807n = INT64_MAX

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    const tx = await txOps.postTransaction({
      idempotency_key: 'multi_split_huge_key',
      transaction_date: '2026-11-09',
      description: '4-Way Split at Int64 Boundary',
      entries: [
        { account_id: 'split_a1', amount_minor: d1, direction: 'DEBIT' },
        { account_id: 'split_a2', amount_minor: d2, direction: 'DEBIT' },
        { account_id: 'split_a3', amount_minor: d3, direction: 'DEBIT' },
        { account_id: 'split_eq', amount_minor: totalCredit, direction: 'CREDIT' }
      ]
    }, 'u_split');

    assert(Boolean(tx.id), '4.3.1 Multi-split transaction summing to INT64_MAX posted cleanly');

    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const accounts = await accountsOps.getAccounts('u_split');
    assert(accounts.find(a => a.id === 'split_a1')!.balance_minor === d1, '4.3.2 Split Account 1 balance matches d1');
    assert(accounts.find(a => a.id === 'split_a2')!.balance_minor === d2, '4.3.3 Split Account 2 balance matches d2');
    assert(accounts.find(a => a.id === 'split_a3')!.balance_minor === d3, '4.3.4 Split Account 3 balance matches d3');
    assert(accounts.find(a => a.id === 'split_eq')!.balance_minor === totalCredit, '4.3.5 Equity Account balance matches totalCredit (INT64_MAX)');

    adapter.close();
  }

  // 4.4 1-Paise Discrepancy Rejection at Int64 Boundary
  {
    const d1 = 3000000000000000000n;
    const d2 = 3000000000000000000n;
    const d3 = 3223372036854775807n;
    const offByOneCredit = d1 + d2 + d3 - 1n; // 1 paise short of INT64_MAX

    let threw = false;
    let errMsg = '';
    try {
      validateTransactionBalance([
        { amount_minor: d1, direction: 'DEBIT' },
        { amount_minor: d2, direction: 'DEBIT' },
        { amount_minor: d3, direction: 'DEBIT' },
        { amount_minor: offByOneCredit, direction: 'CREDIT' }
      ]);
    } catch (e: any) {
      threw = true;
      errMsg = e.message;
    }

    assert(threw, '4.4.1 validateTransactionBalance strictly rejects 1-paise discrepancy at Int64 boundary');
    assert(errMsg.includes('Double-entry invariant violated'), '4.4.2 Error explicitly identifies double-entry violation');
  }

  // 4.5 Extreme BigInt Sync Push & Server Acknowledgment
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_sync_huge_1', 'u_hsync', 'Cash', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('acc_sync_huge_2', 'u_hsync', 'Loan', 'LIABILITY', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    await txOps.postTransaction({
      idempotency_key: 'huge_sync_tx_001',
      transaction_date: '2026-11-09',
      description: 'Massive Loan Drawdown',
      entries: [
        { account_id: 'acc_sync_huge_1', amount_minor: INT64_MAX, direction: 'DEBIT' },
        { account_id: 'acc_sync_huge_2', amount_minor: INT64_MAX, direction: 'CREDIT' }
      ]
    }, 'u_hsync');

    let serverReceivedAmt: bigint = 0n;
    const serverHarness = {
      idempotencyKeys: new Set<string>(),
      postTransaction(_session: any, params: any) {
        serverReceivedAmt = params.entries[0].amountMinor;
        this.idempotencyKeys.add(params.idempotencyKey);
      },
      getAccounts: () => []
    };

    const syncRes = await executeDeltaSync(adapter, serverHarness, { userId: 'u_hsync' });
    assert(syncRes.success === true, '4.5.1 Delta sync push of INT64_MAX transaction succeeded');
    assert(typeof serverReceivedAmt === 'bigint', '4.5.2 Remote server received amountMinor as native bigint');
    assert(serverReceivedAmt === INT64_MAX, '4.5.3 Remote server received exact INT64_MAX (no float rounding)');

    adapter.close();
  }

  // 4.6 settleIOU with BigInt (> 2^53 - 1)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    const hugePrincipal = 900719925474099200n; // > 2^53 - 1
    const partialSettlement = 400000000000000000n;
    const remainingExpected = hugePrincipal - partialSettlement; // 500719925474099200n

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_iou_cash', 'u_iou_big', 'Main Bank', 'ASSET', 'INR', ?, '2026-11-09', '2026-11-09')`,
      [1000000000000000000n]
    );

    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_big_1', 'u_iou_big', 'Enterprise Lender', 'LENT', ?, ?, 'INR', 'OPEN', 0, '2026-11-09', '2026-11-09', 1)`,
      [hugePrincipal, hugePrincipal]
    );

    const iouOps = new (await import('../../packages/sync-engine/src/operations/ious.ts')).IOUsOperations(adapter);

    // Partial settlement
    const partRes = await iouOps.settleIOU('iou_big_1', partialSettlement, 'acc_iou_cash', 'u_iou_big');
    assert(partRes.iou.status === 'PARTIAL', '4.6.1 IOU status updated to PARTIAL');
    assert(partRes.iou.remaining_balance_minor === remainingExpected, `4.6.2 IOU remaining balance matches ${remainingExpected}`);

    // Full remaining settlement
    const fullRes = await iouOps.settleIOU('iou_big_1', remainingExpected, 'acc_iou_cash', 'u_iou_big');
    assert(fullRes.iou.status === 'SETTLED', '4.6.3 IOU status updated to SETTLED');
    assert(fullRes.iou.remaining_balance_minor === 0n, '4.6.4 IOU remaining balance exact 0n');

    adapter.close();
  }

  // 4.7 settleIOU Overpayment Rejection at Extreme Boundaries
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_chk_bank', 'u_chk', 'Bank', 'ASSET', 'INR', ?, '2026-11-09', '2026-11-09')`,
      [1000000000000000000n]
    );

    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_over_1', 'u_chk', 'Dave', 'LENT', ?, ?, 'INR', 'OPEN', 0, '2026-11-09', '2026-11-09', 1)`,
      [500000000000000000n, 500000000000000000n]
    );

    const iouOps = new (await import('../../packages/sync-engine/src/operations/ious.ts')).IOUsOperations(adapter);

    let overpaid = false;
    try {
      // Settle 1 paise more than remaining debt
      await iouOps.settleIOU('iou_over_1', 500000000000000001n, 'acc_chk_bank', 'u_chk');
    } catch (e: any) {
      overpaid = true;
      assert(e.message.includes('exceeds remaining balance'), '4.7.1 Overpayment error specifies remaining balance violation');
    }
    assert(overpaid, '4.7.2 settleIOU strictly rejects 1-paise overpayment at BigInt boundary');

    adapter.close();
  }

  console.log();

  // =========================================================================
  // SECTION 5: RESILIENCE & CORRUPTED QUEUE ISOLATION
  // =========================================================================
  console.log('--- SECTION 5: Resilience & Corrupted Queue Isolation ---');

  // 5.1 Multiple Corrupted Queue Items Interleaved with Valid Items
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_iso_cash', 'u_iso', 'Cash', 'ASSET', 'INR', 50000, '2026-11-09', '2026-11-09'),
              ('acc_iso_exp', 'u_iso', 'Exp', 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09')`
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);

    // Enqueue Valid Tx 1
    await txOps.postTransaction({
      idempotency_key: 'iso_valid_1',
      transaction_date: '2026-11-09',
      description: 'Valid Tx 1',
      entries: [
        { account_id: 'acc_iso_exp', amount_minor: 100n, direction: 'DEBIT' },
        { account_id: 'acc_iso_cash', amount_minor: 100n, direction: 'CREDIT' }
      ]
    }, 'u_iso');

    // Enqueue Corrupted Mutation
    const outbox = new OutboxQueueManager(adapter);
    await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'transactions',
      record_id: 'tx_corrupt_1',
      payload: '{ broken-invalid-json-content: true ',
      created_at: new Date(Date.now() + 100).toISOString()
    });

    // Enqueue Valid Tx 2
    await txOps.postTransaction({
      idempotency_key: 'iso_valid_2',
      transaction_date: '2026-11-09',
      description: 'Valid Tx 2',
      entries: [
        { account_id: 'acc_iso_exp', amount_minor: 200n, direction: 'DEBIT' },
        { account_id: 'acc_iso_cash', amount_minor: 200n, direction: 'CREDIT' }
      ]
    }, 'u_iso');

    const postedDescriptions: string[] = [];
    const serverHarness = {
      idempotencyKeys: new Set<string>(),
      postTransaction(_session: any, params: any) {
        postedDescriptions.push(params.description);
        this.idempotencyKeys.add(params.idempotencyKey);
      },
      getAccounts: () => []
    };

    const syncRes = await executeDeltaSync(adapter, serverHarness, { userId: 'u_iso' });

    assert(syncRes.success === false, '5.1.1 Sync result success is false due to 1 corrupted item');
    assert(syncRes.pushed === 2, '5.1.2 Exactly the 2 valid transactions were pushed and acknowledged');
    assert(syncRes.errors.length === 1, '5.1.3 Exactly 1 error reported for corrupted payload');
    assert(syncRes.errors[0]!.includes('Corrupted JSON payload'), '5.1.4 Error message identifies corrupted JSON payload');
    assert(postedDescriptions.length === 2, '5.1.5 Server received both Valid Tx 1 and Valid Tx 2');

    // The 2 valid mutations are marked SYNCED
    const syncedCount = adapter.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE status = ?',
      ['SYNCED']
    );
    assert(Number(syncedCount?.count) === 2, '5.1.6 2 valid mutations marked SYNCED');

    // The corrupted mutation remains PENDING with retry_count = 1
    const pending = await outbox.getPending();
    assert(pending.length === 1, '5.1.7 Corrupted item remains PENDING for retry');
    assert(pending[0]!.record_id === 'tx_corrupt_1', '5.1.8 Pending item is the corrupted item');
    assert(pending[0]!.retry_count === 1, '5.1.9 Corrupted item retry_count incremented to 1');

    adapter.close();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n============================================================');
  console.log('CHALLENGER 1 STRESS TEST RESULTS');
  console.log('============================================================');
  console.log(`Total Invariant Checks: ${totalTests}`);
  console.log(`Passed:                 ${passedTests}`);
  console.log(`Failed:                 ${failedTests}`);
  console.log(`Success Rate:           ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllStressTests().catch(err => {
  console.error('Fatal unhandled error during stress test execution:', err);
  process.exit(1);
});
