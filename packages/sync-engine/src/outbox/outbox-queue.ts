import { generateUUID } from '../utils/uuid.ts';
import type { SQLiteStorageAdapter } from '../storage/adapter.ts';
import type { SyncMutation, SyncStatus } from '@finvault/db-types';

export const MAX_SYNC_RETRIES = 5;

export class OutboxQueueManager {
  private adapter: SQLiteStorageAdapter;

  constructor(adapter: SQLiteStorageAdapter) {
    this.adapter = adapter;
  }

  public async enqueue(
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
  ): Promise<string> {
    const id = mutation.id || generateUUID();
    const now = mutation.created_at || mutation.timestamp || new Date().toISOString();
    const tableName = mutation.table_name || mutation.entity_type || 'transactions';
    const recordId = mutation.record_id || mutation.entity_id || id;
    const status: SyncStatus = 'PENDING';

    await this.adapter.run(
      `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status, retry_count, entity_type, entity_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [id, tableName, recordId, mutation.operation, mutation.payload, now, status, tableName, recordId, now]
    );

    return id;
  }

  public async getPending(): Promise<SyncMutation[]> {
    const rows = await this.adapter.query<any>(
      `SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY COALESCE(created_at, timestamp) ASC`
    );
    return rows.map(row => ({
      id: row.id,
      table_name: row.table_name || row.entity_type,
      record_id: row.record_id || row.entity_id,
      operation: row.operation,
      payload: row.payload,
      status: row.status,
      retry_count: Number(row.retry_count),
      created_at: row.created_at || row.timestamp,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      timestamp: row.timestamp
    }));
  }

  public async markInFlight(id: string): Promise<void> {
    await this.adapter.run(
      `UPDATE sync_queue SET status = 'IN_FLIGHT' WHERE id = ?`,
      [id]
    );
  }

  public async markSynced(id: string): Promise<void> {
    await this.adapter.run(
      `UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?`,
      [id]
    );
  }

  public async markFailed(id: string, errorMessage?: string): Promise<void> {
    void errorMessage;
    const row = await this.adapter.queryOne<{ retry_count: number }>(
      `SELECT retry_count FROM sync_queue WHERE id = ?`,
      [id]
    );
    const newCount = (row ? Number(row.retry_count) : 0) + 1;
    const nextStatus: SyncStatus = newCount >= MAX_SYNC_RETRIES ? 'FAILED' : 'PENDING';

    await this.adapter.run(
      `UPDATE sync_queue SET status = ?, retry_count = ? WHERE id = ?`,
      [nextStatus, newCount, id]
    );
  }
}
