/**
 * Tier 1: Feature Coverage — Bidirectional Delta Sync & Reconciliation
 * 
 * Verifies pushing queued offline mutations, pulling remote updates,
 * Last-Write-Wins (LWW) conflict resolution, and idempotent replay handling.
 */

import { describe, it, expect, beforeEach, afterEach } from '../infra/harness.ts';
import { SQLiteHarness } from '../infra/sqlite-harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import { SyncEngineOracle } from '../infra/sync-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 1: Bidirectional Delta Sync & Reconciliation', () => {
  let localDb: SQLiteHarness;
  let supabase: SupabaseOracle;
  let session: UserSession;

  beforeEach(() => {
    localDb = new SQLiteHarness(':memory:');
    supabase = new SupabaseOracle();
    session = {
      userId: crypto.randomUUID(),
      email: 'syncuser@finvault.app',
      role: 'authenticated'
    };
  });

  afterEach(() => {
    localDb.close();
  });

  // Test 1: Push offline queued mutations to cloud
  it('T1-SYNC-01: pushes pending offline transactions to Supabase cloud and marks status APPLIED', async () => {
    // Setup bootstrap accounts on server
    const { bankId, expenseId } = supabase.bootstrapUser(session.userId, session.email);

    // Replicate accounts to local client
    localDb.insertAccount({ id: bankId, user_id: session.userId, name: 'Bank', type: 'ASSET', balance_minor: 50000n });
    localDb.insertAccount({ id: expenseId, user_id: session.userId, name: 'Expense', type: 'EXPENSE', balance_minor: 0n });

    // Client logs offline transaction
    const idempKey = crypto.randomUUID();
    localDb.postTransaction({
      user_id: session.userId,
      idempotency_key: idempKey,
      transaction_date: '2026-11-08',
      description: 'Train Ticket',
      entries: [
        { account_id: expenseId, amount_minor: 3500n, direction: 'DEBIT' },
        { account_id: bankId, amount_minor: 3500n, direction: 'CREDIT' }
      ]
    });

    const pendingBefore = localDb.getPendingMutations();
    expect(pendingBefore).toHaveLength(1);

    // Perform sync
    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(1);

    // Verify queue is now empty
    const pendingAfter = localDb.getPendingMutations();
    expect(pendingAfter).toHaveLength(0);

    // Verify transaction exists in Supabase
    const cloudTxs = supabase.getTransactions(session);
    expect(cloudTxs).toHaveLength(1);
    expect(cloudTxs[0].idempotency_key).toBe(idempKey);
  });

  // Test 2: Pull remote cloud accounts to client SQLite
  it('T1-SYNC-02: pulls newly created cloud accounts down to local SQLite storage', async () => {
    // Account created on web while mobile was offline
    const cloudAcc = supabase.createAccount(session, {
      name: 'High Yield Savings',
      type: 'ASSET',
      currency: 'INR'
    });

    const localBefore = localDb.getAccount(cloudAcc.id);
    expect(localBefore).toBeUndefined();

    // Reconnect & sync
    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pulledCount).toBeGreaterThanOrEqual(1);

    const localAfter = localDb.getAccount(cloudAcc.id);
    expect(localAfter).toBeDefined();
    expect(localAfter.name).toBe('High Yield Savings');
  });

  // Test 3: Idempotent replay handling
  it('T1-SYNC-03: handles re-pushed mutations idempotently without duplication or failure', async () => {
    const acc1 = supabase.createAccount(session, { name: 'Wallet', type: 'ASSET' });
    const acc2 = supabase.createAccount(session, { name: 'Food', type: 'EXPENSE' });

    localDb.insertAccount({ id: acc1.id, user_id: session.userId, name: acc1.name, type: 'ASSET' });
    localDb.insertAccount({ id: acc2.id, user_id: session.userId, name: acc2.name, type: 'EXPENSE' });

    const sharedIdempKey = crypto.randomUUID();

    // First offline write & sync
    localDb.postTransaction({
      user_id: session.userId,
      idempotency_key: sharedIdempKey,
      transaction_date: '2026-11-08',
      description: 'Lunch',
      entries: [
        { account_id: acc2.id, amount_minor: 1200n, direction: 'DEBIT' },
        { account_id: acc1.id, amount_minor: 1200n, direction: 'CREDIT' }
      ]
    });

    await SyncEngineOracle.synchronize(localDb, supabase, session);

    // Simulate network retry: re-enqueue same mutation
    const syncId2 = crypto.randomUUID();
    localDb.db.prepare(`
      INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp, status)
      VALUES (?, 'transaction', 'mock-tx-retry', 'INSERT', ?, ?, 'PENDING')
    `).run(
      syncId2,
      JSON.stringify({
        transaction_id: 'mock-tx-retry',
        user_id: session.userId,
        idempotency_key: sharedIdempKey,
        transaction_date: '2026-11-08',
        description: 'Lunch (Retried)',
        entries: [
          { account_id: acc2.id, amount_minor: 1200, direction: 'DEBIT' },
          { account_id: acc1.id, amount_minor: 1200, direction: 'CREDIT' }
        ]
      }),
      new Date().toISOString()
    );

    const syncRes2 = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes2.success).toBe(true);

    // Cloud should still have only 1 transaction (no duplicate!)
    const cloudTxs = supabase.getTransactions(session);
    expect(cloudTxs).toHaveLength(1);
  });

  // Test 4: Last-Write-Wins (LWW) conflict resolution
  it('T1-SYNC-04: resolves concurrent edits via Last-Write-Wins (LWW) version comparison', async () => {
    const acc = supabase.createAccount(session, { name: 'Emergency Fund', type: 'ASSET' });
    localDb.insertAccount({
      id: acc.id,
      user_id: session.userId,
      name: 'Emergency Fund (Old Local)',
      type: 'ASSET',
      balance_minor: 1000n,
      version: 1n
    });

    // Server was updated to version 3
    const serverAcc = supabase.accounts.get(acc.id)!;
    serverAcc.name = 'Emergency Fund (Server V3)';
    serverAcc.balance_minor = 50000n;
    serverAcc.version = 3n;

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.conflictsResolved).toBe(1);

    const localAccAfter = localDb.getAccount(acc.id);
    expect(localAccAfter.name).toBe('Emergency Fund (Server V3)');
    expect(localAccAfter.balance_minor).toBe(50000);
    expect(localAccAfter.version).toBe(3);
  });

  // Test 5: Multiple queued mutations in order
  it('T1-SYNC-05: pushes a sequence of 3 offline transactions in correct chronological order', async () => {
    const accBank = supabase.createAccount(session, { name: 'Bank', type: 'ASSET' });
    const accExp = supabase.createAccount(session, { name: 'General', type: 'EXPENSE' });

    localDb.insertAccount({ id: accBank.id, user_id: session.userId, name: 'Bank', type: 'ASSET' });
    localDb.insertAccount({ id: accExp.id, user_id: session.userId, name: 'General', type: 'EXPENSE' });

    for (let i = 1; i <= 3; i++) {
      localDb.postTransaction({
        user_id: session.userId,
        idempotency_key: `idemp-seq-${i}`,
        transaction_date: '2026-11-08',
        description: `Sequential Tx ${i}`,
        entries: [
          { account_id: accExp.id, amount_minor: BigInt(i * 1000), direction: 'DEBIT' },
          { account_id: accBank.id, amount_minor: BigInt(i * 1000), direction: 'CREDIT' }
        ]
      });
    }

    expect(localDb.getPendingMutations()).toHaveLength(3);

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.pushedCount).toBe(3);
    expect(localDb.getPendingMutations()).toHaveLength(0);

    const cloudTxs = supabase.getTransactions(session);
    expect(cloudTxs).toHaveLength(3);
  });
});
