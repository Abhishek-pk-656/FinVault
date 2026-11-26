import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import {
  initDatabase,
  ClientLedgerOperations,
  OutboxQueueManager,
  executeDeltaSync,
  generateUUID,
  type SQLiteStorageAdapter,
} from '@finvault/sync-engine';
import { ExpoSQLiteAdapter } from '../lib/storage/expo-sqlite-adapter';
import { supabase } from '../lib/supabase/client';
import { useAuth } from './AuthProvider';

interface DatabaseContextValue {
  isReady: boolean;
  isProvisioned: boolean;
  adapter: SQLiteStorageAdapter | null;
  operations: ClientLedgerOperations | null;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  isProvisioned: false,
  adapter: null,
  operations: null,
  error: null,
});

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, session, isAuthLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [isProvisioned, setIsProvisioned] = useState(false);
  const [adapter, setAdapter] = useState<SQLiteStorageAdapter | null>(null);
  const [operations, setOperations] = useState<ClientLedgerOperations | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initDb() {
      try {
        const sqliteDb = await SQLite.openDatabaseAsync('finvault.db');
        const sqliteAdapter = new ExpoSQLiteAdapter(sqliteDb);
        await initDatabase('finvault.db', sqliteAdapter);
        const ops = new ClientLedgerOperations(sqliteAdapter);

        if (mounted) {
          setAdapter(sqliteAdapter);
          setOperations(ops);
          setIsReady(true);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    initDb();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !adapter || !operations || isAuthLoading) return;
    let mounted = true;
    setIsProvisioned(false);

    async function ensureUserAccounts() {
      if (!adapter || !operations) return;
      try {
        let accounts = await operations.getAccounts(userId);

        if (accounts.length === 0 && session?.access_token && userId !== 'local-user') {
          try {
            await executeDeltaSync(adapter, supabase, {
              userId,
              accessToken: session.access_token,
            });
            accounts = await operations.getAccounts(userId);
          } catch (syncErr) {
            console.warn('[FinVault DB] Initial remote pull failed (continuing offline):', syncErr);
          }
        }

        if (accounts.length === 0) {
          const now = new Date().toISOString();
          const outbox = new OutboxQueueManager(adapter);
          const isRealUser = userId !== 'local-user';

          const defaults = [
            { id: isRealUser ? generateUUID() : 'acc-cash', name: 'Cash Wallet', type: 'ASSET', currency: 'INR', balance_minor: 0n },
            { id: isRealUser ? generateUUID() : 'acc-bank', name: 'Primary Bank Account', type: 'ASSET', currency: 'INR', balance_minor: 0n },
            { id: isRealUser ? generateUUID() : 'acc-expenses', name: 'General Expenses', type: 'EXPENSE', currency: 'INR', balance_minor: 0n },
            { id: isRealUser ? generateUUID() : 'acc-income', name: 'Primary Income', type: 'INCOME', currency: 'INR', balance_minor: 0n },
          ];

          for (const acc of defaults) {
            await adapter.run(
              `INSERT OR IGNORE INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`,
              [acc.id, userId, acc.name, acc.type, acc.currency, acc.balance_minor, now, now]
            );

            if (isRealUser) {
              await outbox.enqueue({
                id: generateUUID(),
                table_name: 'accounts',
                record_id: acc.id,
                operation: 'INSERT',
                payload: JSON.stringify({
                  id: acc.id,
                  user_id: userId,
                  name: acc.name,
                  type: acc.type,
                  currency: acc.currency,
                  balance_minor: acc.balance_minor.toString(),
                  is_archived: false,
                  created_at: now,
                  updated_at: now,
                  version: 1,
                }),
                created_at: now,
              });
            }
          }
        }

        if (mounted) {
          setIsProvisioned(true);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    ensureUserAccounts();
    return () => {
      mounted = false;
    };
  }, [isReady, adapter, operations, isAuthLoading, userId, session?.access_token]);

  return (
    <DatabaseContext.Provider value={{ isReady, isProvisioned, adapter, operations, error }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export function useFinVaultDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useFinVaultDatabase must be used within DatabaseProvider');
  }
  return ctx;
}
