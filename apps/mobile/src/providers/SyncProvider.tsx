import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { executeDeltaSync, OutboxQueueManager, type SyncResult } from '@finvault/sync-engine';
import { useFinVaultDatabase } from './DatabaseProvider';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase/client';

interface SyncContextValue {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  lastSyncTime: string | null;
  syncError: string | null;
  dataRevision: number;
  triggerSync: () => Promise<SyncResult | null>;
  refreshPendingCount: () => Promise<void>;
  notifyLocalMutation: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { adapter, isReady, isProvisioned } = useFinVaultDatabase();
  const { userId, session } = useAuth();
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState<number>(0);
  const inFlightRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    if (!adapter || !isReady) return;
    try {
      const outbox = new OutboxQueueManager(adapter);
      const count = await outbox.getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.warn('[FinVault Sync] Failed to count sync_queue:', err);
    }
  }, [adapter, isReady]);

  const notifyLocalMutation = useCallback(async () => {
    await refreshPendingCount();
    setDataRevision((prev) => prev + 1);
  }, [refreshPendingCount]);

  const triggerSync = useCallback(async (): Promise<SyncResult | null> => {
    if (!adapter || !isReady || inFlightRef.current) return null;

    if (!session?.access_token) {
      await refreshPendingCount();
      setSyncError('Sign in required to sync with cloud');
      return null;
    }

    inFlightRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const res = await executeDeltaSync(adapter, supabase, {
        userId,
        accessToken: session.access_token,
        lastSyncTimestamp: lastSyncTime ?? undefined,
      });

      setLastSyncResult(res);
      if (res.success) {
        setLastSyncTime(new Date().toISOString());
        setSyncError(null);
      } else if (res.errors.length > 0) {
        setSyncError(res.errors[0] ?? 'Sync completed with errors');
      }

      await refreshPendingCount();
      if (res.pushed > 0 || res.pulled > 0) {
        setDataRevision((prev) => prev + 1);
      }
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Background sync failed';
      setSyncError(msg);
      console.warn('[FinVault Sync] Sync failed:', msg);
      await refreshPendingCount();
      return null;
    } finally {
      inFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [adapter, isReady, userId, session?.access_token, lastSyncTime, refreshPendingCount]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount, userId]);

  useEffect(() => {
    if (adapter && isReady && isProvisioned && session?.access_token) {
      void triggerSync();
    }
  }, [adapter, isReady, isProvisioned, session?.access_token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active' && session?.access_token) {
        void triggerSync();
      }
    });
    return () => sub.remove();
  }, [triggerSync, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    const timer = setInterval(() => {
      void triggerSync();
    }, 60000);
    return () => clearInterval(timer);
  }, [triggerSync, session?.access_token]);

  return (
    <SyncContext.Provider
      value={{
        isSyncing,
        pendingCount,
        lastSyncResult,
        lastSyncTime,
        syncError,
        dataRevision,
        triggerSync,
        refreshPendingCount,
        notifyLocalMutation,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export function useSyncStatus(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSyncStatus must be used within SyncProvider');
  }
  return ctx;
}
