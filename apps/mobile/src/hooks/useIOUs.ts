import { useState, useEffect, useCallback } from 'react';
import { useFinVaultDatabase } from '../providers/DatabaseProvider';
import type { IOURecord } from '@finvault/db-types';

export function useIOUs(userId: string = 'local-user') {
  const { operations, adapter, isReady } = useFinVaultDatabase();
  const [ious, setIous] = useState<IOURecord[]>([]);
  const [lentMinor, setLentMinor] = useState<bigint>(0n);
  const [borrowedMinor, setBorrowedMinor] = useState<bigint>(0n);
  const [loading, setLoading] = useState<boolean>(true);

  const loadIOUs = useCallback(async () => {
    if (!adapter || !isReady) return;
    setLoading(true);
    try {
      const rows = await adapter.query<any>(
        `SELECT * FROM iou_records WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
        [userId]
      );
      const parsed: IOURecord[] = rows.map(r => ({
        ...r,
        principal_minor: BigInt(r.principal_minor),
        remaining_balance_minor: BigInt(r.remaining_balance_minor),
        is_deleted: Boolean(r.is_deleted),
        version: BigInt(r.version ?? 1),
      }));
      setIous(parsed);

      let lent = 0n;
      let borrowed = 0n;
      for (const item of parsed) {
        if (item.status !== 'SETTLED' && item.status !== 'WRITTEN_OFF') {
          if (item.direction === 'LENT') {
            lent += item.remaining_balance_minor;
          } else {
            borrowed += item.remaining_balance_minor;
          }
        }
      }
      setLentMinor(lent);
      setBorrowedMinor(borrowed);
    } finally {
      setLoading(false);
    }
  }, [adapter, isReady, userId]);

  const settleDebt = async (iouId: string, amountMinor: bigint, accountId: string) => {
    if (!operations) throw new Error('Database not initialized');
    const res = await operations.settleIOU(iouId, amountMinor, accountId, userId);
    await loadIOUs();
    return res;
  };

  useEffect(() => {
    loadIOUs();
  }, [loadIOUs]);

  return { ious, lentMinor, borrowedMinor, loading, settleDebt, refreshIOUs: loadIOUs };
}
