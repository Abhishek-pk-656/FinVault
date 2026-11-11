import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import {
  initDatabase,
  ClientLedgerOperations,
  type SQLiteStorageAdapter,
} from '@finvault/sync-engine';
import { ExpoSQLiteAdapter } from '../lib/storage/expo-sqlite-adapter';

interface DatabaseContextValue {
  isReady: boolean;
  adapter: SQLiteStorageAdapter | null;
  operations: ClientLedgerOperations | null;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  adapter: null,
  operations: null,
  error: null,
});

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [adapter, setAdapter] = useState<SQLiteStorageAdapter | null>(null);
  const [operations, setOperations] = useState<ClientLedgerOperations | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const sqliteDb = await SQLite.openDatabaseAsync('finvault.db');
        const sqliteAdapter = new ExpoSQLiteAdapter(sqliteDb);
        await initDatabase('finvault.db', sqliteAdapter);
        const ops = new ClientLedgerOperations(sqliteAdapter);

        // Bootstrap default accounts if fresh database
        const accounts = await ops.getAccounts('local-user');
        if (accounts.length === 0) {
          const now = new Date().toISOString();
          const defaultAccounts = [
            { id: 'acc-cash', name: 'Cash', type: 'ASSET', currency: 'INR', balance_minor: 0n },
            { id: 'acc-bank', name: 'Bank Checking', type: 'ASSET', currency: 'INR', balance_minor: 0n },
            { id: 'acc-expenses', name: 'General Expense', type: 'EXPENSE', currency: 'INR', balance_minor: 0n },
            { id: 'acc-income', name: 'Primary Income', type: 'INCOME', currency: 'INR', balance_minor: 0n },
          ];
          for (const acc of defaultAccounts) {
            await sqliteAdapter.run(
              `INSERT OR IGNORE INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
               VALUES (?, 'local-user', ?, ?, ?, ?, 0, ?, ?, 1)`,
              [acc.id, acc.name, acc.type, acc.currency, acc.balance_minor, now, now]
            );
          }
        }

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

    init();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DatabaseContext.Provider value={{ isReady, adapter, operations, error }}>
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
