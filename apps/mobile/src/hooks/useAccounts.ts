import { useState, useEffect, useCallback } from 'react';
import { useFinVaultDatabase } from '../providers/DatabaseProvider';
import type { Account } from '@finvault/db-types';

export function useAccounts(userId: string = 'local-user') {
  const { operations, isReady } = useFinVaultDatabase();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [netWorthMinor, setNetWorthMinor] = useState<bigint>(0n);
  const [safeToSpendMinor, setSafeToSpendMinor] = useState<bigint>(0n);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAccounts = useCallback(async () => {
    if (!operations || !isReady) return;
    setLoading(true);
    try {
      const accList = await operations.getAccounts(userId);
      setAccounts(accList);

      let assets = 0n;
      let liabilities = 0n;
      let liquid = 0n;

      for (const acc of accList) {
        if (acc.type === 'ASSET') {
          assets += acc.balance_minor;
          const nameLower = acc.name.toLowerCase();
          if (nameLower.includes('cash') || nameLower.includes('bank') || nameLower.includes('checking')) {
            liquid += acc.balance_minor;
          }
        } else if (acc.type === 'LIABILITY') {
          liabilities += acc.balance_minor;
        }
      }

      setNetWorthMinor(assets - liabilities);
      setSafeToSpendMinor(liquid > 0n ? liquid : 0n);
    } finally {
      setLoading(false);
    }
  }, [operations, isReady, userId]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  return { accounts, netWorthMinor, safeToSpendMinor, loading, refreshAccounts };
}
