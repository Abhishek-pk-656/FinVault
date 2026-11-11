import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { syncWithRemote, type SyncResult } from '@finvault/sync-engine';
import { useFinVaultDatabase } from '../providers/DatabaseProvider';
import { supabase } from '../lib/supabase/client';

export function useBackgroundSync(userId: string = 'local-user', onSynced?: () => void) {
  const { adapter, isReady } = useFinVaultDatabase();
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const triggerSync = useCallback(async () => {
    if (!adapter || !isReady || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSyncing(true);

    try {
      const res = await syncWithRemote(supabase, {
        userId,
        lastSyncTimestamp: lastSyncTime ?? undefined,
      });
      setLastSyncResult(res);
      setLastSyncTime(new Date().toISOString());
      if (res.pushed > 0 || res.pulled > 0) {
        onSynced?.();
      }
    } catch (err: unknown) {
      console.warn('[FinVault Sync] Background sync failed:', err);
    } finally {
      inFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [adapter, isReady, userId, lastSyncTime, onSynced]);

  // Sync on App Foregrounding
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        triggerSync();
      }
    });
    return () => sub.remove();
  }, [triggerSync]);

  // Periodic fallback sync every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      triggerSync();
    }, 60000);
    return () => clearInterval(timer);
  }, [triggerSync]);

  return { isSyncing, lastSyncResult, lastSyncTime, triggerSync };
}
