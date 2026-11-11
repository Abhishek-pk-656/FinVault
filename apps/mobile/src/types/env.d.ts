declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_SUPABASE_URL?: string;
      readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
      readonly [key: string]: string | undefined;
    }
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

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

export {};
