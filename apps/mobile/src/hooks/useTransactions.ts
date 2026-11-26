import { useState, useEffect, useCallback } from 'react';
import { useFinVaultDatabase } from '../providers/DatabaseProvider';
import { useAuth } from '../providers/AuthProvider';
import { useSyncStatus } from '../providers/SyncProvider';
import type { Transaction, NewTransactionPayload } from '@finvault/db-types';

export function useTransactions(explicitUserId?: string) {
  const { operations, adapter, isReady, isProvisioned } = useFinVaultDatabase();
  const { userId: authUserId } = useAuth();
  const { notifyLocalMutation, dataRevision } = useSyncStatus();
  const userId = explicitUserId ?? authUserId;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadTransactions = useCallback(async () => {
    if (!adapter || !isReady) return;
    setLoading(true);
    try {
      const rows = await adapter.query<any>(
        `SELECT * FROM transactions WHERE user_id = ? AND is_deleted = 0 ORDER BY transaction_date DESC, created_at DESC LIMIT 50`,
        [userId]
      );
      setTransactions(
        rows.map(r => ({
          ...r,
          is_reconciled: Boolean(r.is_reconciled),
          is_deleted: Boolean(r.is_deleted),
          version: BigInt(r.version ?? 1),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [adapter, isReady, userId]);

  const postOfflineTransaction = async (txPayload: NewTransactionPayload) => {
    if (!operations) throw new Error('Database not initialized');
    const start = performance.now();
    const created = await operations.postTransaction(txPayload, userId);
    const latency = performance.now() - start;
    if (latency > 50) {
      console.warn(`[FinVault Mobile] Offline transaction took ${latency.toFixed(2)}ms (SLA is 50ms)`);
    }
    await loadTransactions();
    await notifyLocalMutation();
    return created;
  };

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions, isProvisioned, dataRevision]);

  return { transactions, postOfflineTransaction, loading, refreshTransactions: loadTransactions };
}
