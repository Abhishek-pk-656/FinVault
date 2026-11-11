export interface QueryResult<T = unknown> {
  rows: T[];
}

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface SQLiteStorageAdapter {
  exec(sql: string): Promise<void> | void;
  run(sql: string, params?: unknown[]): Promise<RunResult> | RunResult;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> | T[];
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> | (T | null);
  transaction<T>(fn: () => Promise<T> | T): Promise<T> | T;
  close(): Promise<void> | void;
}

export interface DatabaseHandle {
  close: () => Promise<void> | void;
  execute: (sql: string, params?: unknown[]) => Promise<unknown[]> | unknown[];
  adapter: SQLiteStorageAdapter;
}
