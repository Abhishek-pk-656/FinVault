/**
 * Expo SQLite Storage Adapter for @finvault/sync-engine
 * 
 * Implements SQLiteStorageAdapter on React Native / Android using Expo SDK 51 SQLite.
 */

import * as SQLite from 'expo-sqlite';
import type { SQLiteStorageAdapter, RunResult } from '@finvault/sync-engine';

export class ExpoSQLiteAdapter implements SQLiteStorageAdapter {
  private db: SQLite.SQLiteDatabase;

  constructor(databaseName: string = 'finvault.db') {
    this.db = SQLite.openDatabaseSync(databaseName);
  }

  exec(sql: string): void {
    this.db.execSync(sql);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const result = this.db.runSync(sql, ...(params as SQLite.SQLiteBindParams));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowId,
    };
  }

  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.getAllSync<T>(sql, ...(params as SQLite.SQLiteBindParams));
  }

  queryOne<T = unknown>(sql: string, params: unknown[] = []): T | null {
    const row = this.db.getFirstSync<T>(sql, ...(params as SQLite.SQLiteBindParams));
    return row ?? null;
  }

  transaction<T>(fn: () => T): T {
    let result: T;
    this.db.withTransactionSync(() => {
      result = fn();
    });
    return result!;
  }

  close(): void {
    this.db.closeSync();
  }
}
