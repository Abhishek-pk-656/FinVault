import { useSyncStatus } from '../providers/SyncProvider';

export function useBackgroundSync(_userId?: string, _onSynced?: () => void) {
  const { isSyncing, pendingCount, lastSyncResult, lastSyncTime, syncError, triggerSync } =
    useSyncStatus();
  return {
    isSyncing,
    pendingCount,
    lastSyncResult,
    lastSyncTime,
    syncError,
    triggerSync,
  };
}
