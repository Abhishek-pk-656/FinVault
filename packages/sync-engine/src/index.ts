import { NodeSQLiteAdapter } from './storage/node-sqlite-adapter.ts';
import type { DatabaseHandle, SQLiteStorageAdapter } from './storage/adapter.ts';
import { OutboxQueueManager } from './outbox/outbox-queue.ts';
import { executeDeltaSync, type SyncResult, type SyncOptions } from './sync/delta-sync.ts';
import { ClientLedgerOperations } from './operations/index.ts';
import { CLIENT_SQLITE_SCHEMA } from './schema.ts';
import type {
  Account,
  Transaction,
  IOURecord,
  CreateTransactionDTO,
  NewTransactionPayload,
  SyncMutation
} from '@finvault/db-types';

export * from './schema.ts';
export * from './storage/adapter.ts';
export * from './storage/node-sqlite-adapter.ts';
export * from './storage/memory-sqlite-adapter.ts';
export * from './outbox/outbox-queue.ts';
export * from './sync/delta-sync.ts';
export * from './sync/lww-resolver.ts';
export * from './operations/index.ts';
export * from './utils/balance.ts';

// Supabase client type shim for compilation independence
export interface SupabaseClientLike {
  from?: (table: string) => any;
  rpc?: (fn: string, params?: any) => any;
  auth?: any;
  [key: string]: any;
}

export type SupabaseClient = SupabaseClientLike;

// Re-export SyncMutation from db-types
export type { SyncMutation };

// Global singleton handles for default zero-config usage
let activeAdapter: SQLiteStorageAdapter | null = null;
let activeOperations: ClientLedgerOperations | null = null;

export async function initDatabase(
  dbPath: string = ':memory:',
  customAdapter?: SQLiteStorageAdapter
): Promise<DatabaseHandle> {
  const adapter = customAdapter || new NodeSQLiteAdapter(dbPath);
  await adapter.exec('PRAGMA foreign_keys = ON;');
  await adapter.exec(CLIENT_SQLITE_SCHEMA);

  activeAdapter = adapter;
  activeOperations = new ClientLedgerOperations(adapter);

  return {
    close: async () => adapter.close(),
    execute: async (sql: string, params: unknown[] = []) => {
      const trimmed = sql.trim().toUpperCase();
      if (params.length === 0 && !trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA')) {
        adapter.exec(sql);
        return [];
      }
      return adapter.query(sql, params);
    },
    adapter
  };
}

function getOperations(): ClientLedgerOperations {
  if (!activeOperations || !activeAdapter) {
    // Lazily initialize in-memory SQLite if caller didn't call initDatabase
    const adapter = new NodeSQLiteAdapter(':memory:');
    adapter.exec('PRAGMA foreign_keys = ON;');
    adapter.exec(CLIENT_SQLITE_SCHEMA);
    activeAdapter = adapter;
    activeOperations = new ClientLedgerOperations(adapter);
  }
  return activeOperations;
}

export async function getAccounts(userId?: string): Promise<Account[]> {
  return getOperations().getAccounts(userId);
}

export async function postTransaction(
  tx: NewTransactionPayload | CreateTransactionDTO,
  userId?: string
): Promise<Transaction> {
  return getOperations().postTransaction(tx, userId);
}

export async function settleIOU(
  iouId: string,
  amountMinor: bigint,
  accountId: string,
  userId?: string
): Promise<{ iou: IOURecord; transaction: Transaction }> {
  return getOperations().settleIOU(iouId, amountMinor, accountId, userId);
}

export async function enqueueMutation(
  mutation: Partial<SyncMutation> & {
    payload: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name?: string | null;
    record_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    created_at?: string | null;
    timestamp?: string | null;
  }
): Promise<void> {
  if (!activeAdapter) {
    getOperations(); // ensure initialized
  }
  const outbox = new OutboxQueueManager(activeAdapter!);
  await outbox.enqueue(mutation);
}

export async function syncWithRemote(
  supabaseClient: any,
  options?: SyncOptions
): Promise<SyncResult> {
  if (!activeAdapter) {
    getOperations(); // ensure initialized
  }
  return executeDeltaSync(activeAdapter!, supabaseClient, options);
}
