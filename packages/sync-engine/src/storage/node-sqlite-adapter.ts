import { DatabaseSync } from 'node:sqlite';
import type { SQLiteStorageAdapter, RunResult } from './adapter.ts';

export class NodeSQLiteAdapter implements SQLiteStorageAdapter {
  public db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, params: unknown[] = []): RunResult {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid
    };
  }

  public query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.setReadBigInts(true);
    return stmt.all(...params) as T[];
  }

  public queryOne<T = unknown>(sql: string, params: unknown[] = []): T | null {
    const stmt = this.db.prepare(sql);
    stmt.setReadBigInts(true);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  public transaction<T>(fn: () => Promise<T> | T): Promise<T> | T {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then(res => {
            this.db.exec('COMMIT');
            return res;
          })
          .catch(err => {
            this.db.exec('ROLLBACK');
            throw err;
          });
      }
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public close(): void {
    this.db.close();
  }
}
