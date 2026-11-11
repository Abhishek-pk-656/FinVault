/**
 * FinVault Sync Engine Oracle & Reconciliation Validator
 * 
 * Implements bidirectional delta sync protocol between SQLite client storage
 * and Supabase cloud PostgreSQL backend with Last-Write-Wins (LWW) conflict
 * resolution and idempotency tracking.
 */

import { SQLiteHarness } from './sqlite-harness.ts';
import { SupabaseOracle } from './supabase-oracle.ts';
import type { UserSession } from './supabase-oracle.ts';

export interface SyncResult {
  pushedCount: number;
  pulledCount: number;
  conflictsResolved: number;
  success: boolean;
  errors: string[];
}

export class SyncEngineOracle {
  /**
   * Performs full bidirectional sync between local SQLite and Supabase
   */
  public static async synchronize(
    localHarness: SQLiteHarness,
    supabase: SupabaseOracle,
    session: UserSession,
    lastSyncTimestamp?: string
  ): Promise<SyncResult> {
    const result: SyncResult = {
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
      success: true,
      errors: []
    };

    // Step 1: Push offline queued mutations
    const pending = localHarness.getPendingMutations();

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload);

        if (item.entity_type === 'transaction' && item.operation === 'INSERT') {
          // Check if already applied on server via idempotency key
          if (supabase.idempotencyKeys.has(payload.idempotency_key)) {
            // Already synced (idempotent replay)
            localHarness.markMutationApplied(item.id);
            result.pushedCount++;
            continue;
          }

          // Apply to server
          supabase.postTransaction(session, {
            idempotencyKey: payload.idempotency_key,
            transactionDate: payload.transaction_date,
            description: payload.description,
            entries: payload.entries.map((e: any) => ({
              accountId: e.account_id,
              amountMinor: BigInt(e.amount_minor),
              direction: e.direction
            }))
          });

          localHarness.markMutationApplied(item.id);
          result.pushedCount++;
        }
      } catch (err: any) {
        result.success = false;
        result.errors.push(`Failed to push mutation ${item.id}: ${err.message}`);
      }
    }

    // Step 2: Pull cloud updates to client SQLite
    try {
      const serverAccounts = supabase.getAccounts(session);
      for (const serverAcc of serverAccounts) {
        const localAcc = localHarness.getAccount(serverAcc.id);
        if (!localAcc) {
          // Insert new remote account locally
          localHarness.insertAccount({
            id: serverAcc.id,
            user_id: serverAcc.user_id,
            name: serverAcc.name,
            type: serverAcc.type,
            currency: serverAcc.currency,
            balance_minor: serverAcc.balance_minor,
            version: serverAcc.version
          });
          result.pulledCount++;
        } else {
          // LWW conflict resolution: compare versions and timestamps
          if (BigInt(serverAcc.version) > BigInt(localAcc.version)) {
            localHarness.db.prepare(`
              UPDATE accounts
              SET name = ?, balance_minor = ?, updated_at = ?, version = ?
              WHERE id = ?
            `).run(
              serverAcc.name,
              Number(serverAcc.balance_minor),
              serverAcc.updated_at,
              Number(serverAcc.version),
              serverAcc.id
            );
            result.pulledCount++;
            result.conflictsResolved++;
          }
        }
      }
    } catch (err: any) {
      result.success = false;
      result.errors.push(`Failed to pull remote changes: ${err.message}`);
    }

    return result;
  }
}
