/**
 * Client SQLite Test Harness
 * 
 * Provides an in-memory or file-backed SQLite database matching FinVault's
 * client schema (packages/sync-engine) with full transaction support,
 * mutation outbox queue (sync_queue), and balance triggers.
 */

import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';

export class SQLiteHarness {
  public db: DatabaseSync;

  constructor(memoryPath: string = ':memory:') {
    this.db = new DatabaseSync(memoryPath);
    this.initSchema();
  }

  public initSchema(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
        currency TEXT NOT NULL DEFAULT 'INR',
        balance_minor INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        transaction_date TEXT NOT NULL,
        description TEXT NOT NULL,
        notes TEXT,
        is_reconciled INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS iou_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        counterparty_name TEXT NOT NULL,
        counterparty_contact TEXT,
        direction TEXT NOT NULL CHECK (direction IN ('LENT', 'BORROWED')),
        principal_minor INTEGER NOT NULL CHECK (principal_minor > 0),
        remaining_balance_minor INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF')),
        due_date TEXT,
        notes TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sinking_funds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor > 0),
        allocated_amount_minor INTEGER NOT NULL DEFAULT 0,
        target_date TEXT,
        currency TEXT NOT NULL DEFAULT 'INR',
        is_completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED', 'APPLIED'))
      );
    `);
  }

  public insertAccount(acc: {
    id?: string;
    user_id: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    currency?: string;
    balance_minor?: bigint | number;
    version?: bigint | number;
  }): string {
    const id = acc.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      acc.user_id,
      acc.name,
      acc.type,
      acc.currency ?? 'INR',
      acc.balance_minor !== undefined ? Number(acc.balance_minor) : 0,
      now,
      now,
      acc.version !== undefined ? Number(acc.version) : 1
    );
    return id;
  }

  public getAccount(id: string): any {
    return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  }

  public listAccounts(userId: string): any[] {
    return this.db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_archived = 0').all(userId);
  }

  /**
   * Posts an atomic multi-split transaction with journal entries and enqueues to sync_queue
   */
  public postTransaction(params: {
    user_id: string;
    idempotency_key: string;
    transaction_date: string;
    description: string;
    notes?: string;
    entries: Array<{
      account_id: string;
      amount_minor: bigint | number;
      direction: 'DEBIT' | 'CREDIT';
    }>;
  }): { transactionId: string } {
    // Validate balance before writing
    let debits = 0n;
    let credits = 0n;
    for (const e of params.entries) {
      const amt = BigInt(e.amount_minor);
      if (amt <= 0n) {
        throw new Error(`Amount must be positive: ${amt}`);
      }
      if (e.direction === 'DEBIT') debits += amt;
      else credits += amt;
    }
    if (debits !== credits) {
      throw new Error(`Transaction out of balance: debits (${debits}) != credits (${credits})`);
    }

    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.exec('BEGIN TRANSACTION');
    try {
      // Insert transaction header
      this.db.prepare(`
        INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, notes, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(txId, params.user_id, params.idempotency_key, params.transaction_date, params.description, params.notes || null, now, now);

      // Insert journal entries and update balances
      for (const entry of params.entries) {
        const entryId = crypto.randomUUID();
        const amtNum = Number(entry.amount_minor);

        this.db.prepare(`
          INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(entryId, params.user_id, txId, entry.account_id, amtNum, entry.direction, now);

        // Fetch account to know type
        const acc: any = this.db.prepare('SELECT type, balance_minor FROM accounts WHERE id = ?').get(entry.account_id);
        if (!acc) throw new Error(`Account not found: ${entry.account_id}`);

        let delta = 0;
        if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
          delta = entry.direction === 'DEBIT' ? amtNum : -amtNum;
        } else {
          delta = entry.direction === 'CREDIT' ? amtNum : -amtNum;
        }

        this.db.prepare('UPDATE accounts SET balance_minor = balance_minor + ?, updated_at = ? WHERE id = ?')
          .run(delta, now, entry.account_id);
      }

      // Enqueue mutation to sync_queue
      const syncId = crypto.randomUUID();
      const payload = JSON.stringify({
        transaction_id: txId,
        user_id: params.user_id,
        idempotency_key: params.idempotency_key,
        transaction_date: params.transaction_date,
        description: params.description,
        entries: params.entries.map(e => ({
          account_id: e.account_id,
          amount_minor: Number(e.amount_minor),
          direction: e.direction
        }))
      });

      this.db.prepare(`
        INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, timestamp, status)
        VALUES (?, 'transaction', ?, 'INSERT', ?, ?, 'PENDING')
      `).run(syncId, txId, payload, now);

      this.db.exec('COMMIT');
      return { transactionId: txId };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public getPendingMutations(): any[] {
    return this.db.prepare("SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY timestamp ASC").all();
  }

  public markMutationApplied(id: string): void {
    this.db.prepare("UPDATE sync_queue SET status = 'APPLIED' WHERE id = ?").run(id);
  }

  public close(): void {
    this.db.close();
  }
}
