/**
 * Expo SQLite Storage Adapter for @finvault/sync-engine
 * 
 * Conforms to SQLiteStorageAdapter interface, enabling offline-first
 * persistence on Android (and iOS) using Expo SDK 51 SQLite.
 */
import type * as SQLite from 'expo-sqlite';
import type { SQLiteStorageAdapter, RunResult } from '@finvault/sync-engine';

export class ExpoSQLiteAdapter implements SQLiteStorageAdapter {
  private db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  private normalizeParams(params: unknown[] = []): (string | number | null)[] {
    return params.map(p => {
      if (typeof p === 'bigint') {
        if (p <= BigInt(Number.MAX_SAFE_INTEGER) && p >= BigInt(Number.MIN_SAFE_INTEGER)) {
          return Number(p);
        }
        return p.toString();
      }
      if (p === undefined) return null;
      return p as string | number | null;
    });
  }

  public async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  public async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const normalized = this.normalizeParams(params);
    const result = await this.db.runAsync(sql, normalized as any);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowId,
    };
  }

  public async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalized = this.normalizeParams(params);
    return await this.db.getAllAsync<T>(sql, normalized as any);
  }

  public async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const normalized = this.normalizeParams(params);
    const row = await this.db.getFirstAsync<T>(sql, normalized as any);
    return row ?? null;
  }

  public async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.db.execAsync('BEGIN TRANSACTION;');
    try {
      const result = await fn();
      await this.db.execAsync('COMMIT;');
      return result;
    } catch (err) {
      await this.db.execAsync('ROLLBACK;');
      throw err;
    }
  }

  public async close(): Promise<void> {
    await this.db.closeAsync();
  }
}
