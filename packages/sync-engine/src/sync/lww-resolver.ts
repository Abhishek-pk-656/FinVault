export interface VersionedEntity {
  id: string;
  version?: bigint | number;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Deterministic Last-Write-Wins (LWW) resolver.
 * Returns true if remote record should overwrite local record.
 * Returns false if local record is newer (or stale remote delta should be discarded).
 */
export function shouldRemoteOverwriteLocal(
  remote: VersionedEntity,
  local: VersionedEntity
): boolean {
  const remoteVersion = BigInt(remote.version ?? 1);
  const localVersion = BigInt(local.version ?? 1);

  if (remoteVersion > localVersion) {
    return true;
  }
  if (remoteVersion < localVersion) {
    return false;
  }

  // Same version: tie-break by updated_at timestamp
  const remoteTime = remote.updated_at ?? '';
  const localTime = local.updated_at ?? '';

  if (remoteTime > localTime) {
    return true;
  }
  if (remoteTime < localTime) {
    return false;
  }

  // Identical version and timestamp: deterministic tie-break by ID
  return String(remote.id) >= String(local.id);
}
