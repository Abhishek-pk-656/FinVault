import { NodeSQLiteAdapter } from './node-sqlite-adapter.ts';

export class MemorySQLiteAdapter extends NodeSQLiteAdapter {
  constructor() {
    super(':memory:');
  }
}
