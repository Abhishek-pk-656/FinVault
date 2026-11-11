declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      setReadBigInts(enabled: boolean): void;
    };
    close(): void;
  }
}

declare module 'node:crypto' {
  export function randomUUID(): string;
}
