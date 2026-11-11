/**
 * Tier 2: Boundary & Corner Cases — SQLite & Sync Reconciliation
 * 
 * Verifies corrupted payload handling, stale version ignoring (LWW),
 * empty queue sync, multiple offline account multi-splits, and idempotency collisions.
 */

import { describe, it, expect, beforeEach, afterEach } from '../infra/harness.ts';
import { SQLiteHarness } from '../infra/sqlite-harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import { SyncEngineOracle } from '../infra/sync-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 2: SQLite & Sync Reconciliation Corner Cases', () => {
  let localDb: SQLiteHarness;
  let supabase: SupabaseOracle;
  let session: UserSession;

  beforeEach(() => {
    localDb = new SQLiteHarness(':memory:');
    supabase = new SupabaseOracle();
    session = {
      userId: crypto.randomUUID(),
      email: 'corner-sync@test.local',
      role: 'authenticated'
    };
  });

  afterEach(() => {
    localDb.close();
  });

  // Edge 1: Corrupted queue payload recovery
  it('T2-SYNC-01: captures corrupted payload error cleanly without crashing the sync engine', async () => {
    // Manually inject a corrupted JSON payload into sync_queue
    const badId = crypto.randomUUID();
    localDb.db.prepare(`
      INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp, status)
      VALUES (?, 'transaction', 'tx-bad', 'INSERT', '{ corrupted-unparseable-json', ?, 'PENDING')
    `).run(badId, new Date().toISOString());

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(false);
    expect(syncRes.errors).toHaveLength(1);
    expect(syncRes.errors[0]).toContain(`Failed to push mutation ${badId}`);

    // Corrupted item remains PENDING for retry or DLQ inspection
    const pending = localDb.getPendingMutations();
    expect(pending).toHaveLength(1);
  });

  // Edge 2: Stale remote version ignored (LWW)
  it('T2-SYNC-02: preserves newer local version when remote delta has older version (LWW)', async () => {
    const accId = crypto.randomUUID();
    // Local has version 5
    localDb.insertAccount({
      id: accId,
      user_id: session.userId,
      name: 'Local Newest Name',
      type: 'ASSET',
      balance_minor: 99999n,
      version: 5n
    });

    // Cloud has older version 2
    supabase.accounts.set(accId, {
      id: accId,
      user_id: session.userId,
      name: 'Cloud Stale Name',
      type: 'ASSET',
      currency: 'INR',
      balance_minor: 1000n,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 2n
    });

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.conflictsResolved).toBe(0); // Not overwritten

    const localAcc = localDb.getAccount(accId);
    expect(localAcc.name).toBe('Local Newest Name');
    expect(localAcc.version).toBe(5);
  });

  // Edge 3: Empty queue sync
  it('T2-SYNC-03: handles zero pending mutations gracefully with zero pushed and zero errors', async () => {
    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(0);
    expect(syncRes.pulledCount).toBe(0);
    expect(syncRes.errors).toHaveLength(0);
  });

  // Edge 4: Replay with duplicate idempotency key on server rejects without crash
  it('T2-SYNC-04: safely identifies pre-existing idempotency key on server and marks local queue applied', async () => {
    const accBank = supabase.createAccount(session, { name: 'Bank', type: 'ASSET' });
    const accExp = supabase.createAccount(session, { name: 'Expense', type: 'EXPENSE' });

    localDb.insertAccount({ id: accBank.id, user_id: session.userId, name: 'Bank', type: 'ASSET' });
    localDb.insertAccount({ id: accExp.id, user_id: session.userId, name: 'Expense', type: 'EXPENSE' });

    const key = crypto.randomUUID();

    // Already on server
    supabase.postTransaction(session, {
      idempotencyKey: key,
      transactionDate: '2026-11-08',
      description: 'Pre-existing Cloud Tx',
      entries: [
        { accountId: accExp.id, amountMinor: 5000n, direction: 'DEBIT' },
        { accountId: accBank.id, amountMinor: 5000n, direction: 'CREDIT' }
      ]
    });

    // Mobile queue has the same key (e.g. from previous aborted ack)
    const queueId = crypto.randomUUID();
    localDb.db.prepare(`
      INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp, status)
      VALUES (?, 'transaction', 'local-tx-dup', 'INSERT', ?, ?, 'PENDING')
    `).run(
      queueId,
      JSON.stringify({
        transaction_id: 'local-tx-dup',
        user_id: session.userId,
        idempotency_key: key,
        transaction_date: '2026-11-08',
        description: 'Local duplicate Tx',
        entries: [
          { account_id: accExp.id, amount_minor: 5000, direction: 'DEBIT' },
          { account_id: accBank.id, amount_minor: 5000, direction: 'CREDIT' }
        ]
      }),
      new Date().toISOString()
    );

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(1);

    // Queue is cleared
    expect(localDb.getPendingMutations()).toHaveLength(0);
    // Cloud still has exactly 1 transaction
    expect(supabase.getTransactions(session)).toHaveLength(1);
  });

  // Edge 5: Offline 5-split transaction sync
  it('T2-SYNC-05: synchronizes complex 5-split transaction preserving balances between SQLite and Cloud', async () => {
    const accChecking = supabase.createAccount(session, { name: 'Checking', type: 'ASSET' });
    const accGroceries = supabase.createAccount(session, { name: 'Groceries', type: 'EXPENSE' });
    const accFuel = supabase.createAccount(session, { name: 'Fuel', type: 'EXPENSE' });
    const accDining = supabase.createAccount(session, { name: 'Dining', type: 'EXPENSE' });

    localDb.insertAccount({ id: accChecking.id, user_id: session.userId, name: 'Checking', type: 'ASSET', balance_minor: 500000n });
    localDb.insertAccount({ id: accGroceries.id, user_id: session.userId, name: 'Groceries', type: 'EXPENSE', balance_minor: 0n });
    localDb.insertAccount({ id: accFuel.id, user_id: session.userId, name: 'Fuel', type: 'EXPENSE', balance_minor: 0n });
    localDb.insertAccount({ id: accDining.id, user_id: session.userId, name: 'Dining', type: 'EXPENSE', balance_minor: 0n });

    localDb.postTransaction({
      user_id: session.userId,
      idempotency_key: crypto.randomUUID(),
      transaction_date: '2026-11-08',
      description: 'Supermarket + Gas Station Split',
      entries: [
        { account_id: accGroceries.id, amount_minor: 45000n, direction: 'DEBIT' },
        { account_id: accFuel.id, amount_minor: 30000n, direction: 'DEBIT' },
        { account_id: accDining.id, amount_minor: 25000n, direction: 'DEBIT' },
        { account_id: accChecking.id, amount_minor: 100000n, direction: 'CREDIT' }
      ]
    });

    const syncRes = await SyncEngineOracle.synchronize(localDb, supabase, session);
    expect(syncRes.success).toBe(true);
    expect(syncRes.pushedCount).toBe(1);

    // Verify cloud accounts match local balances
    const cloudChecking = supabase.accounts.get(accChecking.id)!;
    const cloudGroceries = supabase.accounts.get(accGroceries.id)!;
    const cloudFuel = supabase.accounts.get(accFuel.id)!;
    const cloudDining = supabase.accounts.get(accDining.id)!;

    expect(cloudChecking.balance_minor).toBe(-100000n);
    expect(cloudGroceries.balance_minor).toBe(45000n);
    expect(cloudFuel.balance_minor).toBe(30000n);
    expect(cloudDining.balance_minor).toBe(25000n);
  });
});
