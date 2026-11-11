import { generateUUID } from '../utils/uuid.ts';
import type { SQLiteStorageAdapter } from '../storage/adapter.ts';
import { OutboxQueueManager } from '../outbox/outbox-queue.ts';
import { computeAccountBalanceDelta, validateTransactionBalance } from '../utils/balance.ts';
import type { Transaction, CreateTransactionDTO, NewTransactionPayload } from '@finvault/db-types';

export class TransactionsOperations {
  private adapter: SQLiteStorageAdapter;
  private outbox: OutboxQueueManager;

  constructor(adapter: SQLiteStorageAdapter) {
    this.adapter = adapter;
    this.outbox = new OutboxQueueManager(adapter);
  }

  public async postTransaction(
    tx: NewTransactionPayload | CreateTransactionDTO,
    userId: string = 'local-user'
  ): Promise<Transaction> {
    // 1. Double-Entry Validation before touching SQLite
    validateTransactionBalance(tx.entries);

    const txId = generateUUID();
    const now = new Date().toISOString();

    // 2. Atomic SQLite execution
    await this.adapter.transaction(async () => {
      // Insert transaction header
      await this.adapter.run(
        `INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, notes, is_reconciled, is_deleted, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 1)`,
        [txId, userId, tx.idempotency_key, tx.transaction_date, tx.description, tx.notes ?? null, now, now]
      );

      // Insert journal entries and dynamically update account balances
      for (const entry of tx.entries) {
        const entryId = generateUUID();
        const amt = BigInt(entry.amount_minor);

        await this.adapter.run(
          `INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [entryId, userId, txId, entry.account_id, amt, entry.direction, now]
        );

        const acc = await this.adapter.queryOne<any>(
          `SELECT type, balance_minor FROM accounts WHERE id = ?`,
          [entry.account_id]
        );
        if (!acc) {
          throw new Error(`Account not found: ${entry.account_id}`);
        }

        const delta = computeAccountBalanceDelta(acc.type, entry.direction, amt);
        await this.adapter.run(
          `UPDATE accounts SET balance_minor = balance_minor + ?, updated_at = ? WHERE id = ?`,
          [delta, now, entry.account_id]
        );
      }

      // Enqueue mutation payload into sync_queue
      const payload = JSON.stringify({
        transaction_id: txId,
        user_id: userId,
        idempotency_key: tx.idempotency_key,
        transaction_date: tx.transaction_date,
        description: tx.description,
        notes: tx.notes ?? null,
        entries: tx.entries.map(e => ({
          account_id: e.account_id,
          amount_minor: e.amount_minor.toString(),
          direction: e.direction
        }))
      });

      await this.outbox.enqueue({
        id: generateUUID(),
        table_name: 'transactions',
        record_id: txId,
        operation: 'INSERT',
        payload,
        created_at: now
      });
    });

    return {
      id: txId,
      user_id: userId,
      idempotency_key: tx.idempotency_key,
      transaction_date: tx.transaction_date,
      description: tx.description,
      notes: tx.notes ?? null,
      is_reconciled: false,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      version: 1n
    };
  }
}
