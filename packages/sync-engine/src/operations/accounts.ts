import type { SQLiteStorageAdapter } from '../storage/adapter.ts';
import type { Account } from '@finvault/db-types';

export class AccountsOperations {
  private adapter: SQLiteStorageAdapter;

  constructor(adapter: SQLiteStorageAdapter) {
    this.adapter = adapter;
  }

  public async getAccounts(userId?: string): Promise<Account[]> {
    let sql = `SELECT * FROM accounts WHERE is_archived = 0`;
    const params: unknown[] = [];
    if (userId) {
      sql += ` AND user_id = ?`;
      params.push(userId);
    }
    const rows = await this.adapter.query<any>(sql, params);
    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      type: r.type,
      currency: r.currency,
      balance_minor: BigInt(r.balance_minor),
      is_archived: Boolean(r.is_archived),
      created_at: r.created_at,
      updated_at: r.updated_at,
      version: BigInt(r.version ?? 1)
    }));
  }

  public async getAccountById(id: string): Promise<Account | null> {
    const row = await this.adapter.queryOne<any>(`SELECT * FROM accounts WHERE id = ?`, [id]);
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      type: row.type,
      currency: row.currency,
      balance_minor: BigInt(row.balance_minor),
      is_archived: Boolean(row.is_archived),
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version ?? 1)
    };
  }
}
