import { generateUUID } from '../utils/uuid.ts';
import type { SQLiteStorageAdapter } from '../storage/adapter.ts';
import { OutboxQueueManager } from '../outbox/outbox-queue.ts';
import { TransactionsOperations } from './transactions.ts';
import type { IOURecord, Transaction } from '@finvault/db-types';

export class IOUsOperations {
  private adapter: SQLiteStorageAdapter;
  private outbox: OutboxQueueManager;
  private txOps: TransactionsOperations;

  constructor(adapter: SQLiteStorageAdapter) {
    this.adapter = adapter;
    this.outbox = new OutboxQueueManager(adapter);
    this.txOps = new TransactionsOperations(adapter);
  }

  public async settleIOU(
    iouId: string,
    amountMinor: bigint,
    accountId: string,
    userId: string = 'local-user'
  ): Promise<{ iou: IOURecord; transaction: Transaction }> {
    if (amountMinor <= 0n) {
      throw new Error(`Settlement amount must be positive: ${amountMinor}`);
    }

    const iou = await this.adapter.queryOne<any>(
      `SELECT * FROM iou_records WHERE id = ?`,
      [iouId]
    );
    if (!iou) {
      throw new Error(`IOU not found: ${iouId}`);
    }

    const remBal = BigInt(iou.remaining_balance_minor);
    if (amountMinor > remBal) {
      throw new Error(`Settlement amount (${amountMinor}) exceeds remaining balance (${remBal})`);
    }

    const settlementAcc = await this.adapter.queryOne<any>(
      `SELECT * FROM accounts WHERE id = ?`,
      [accountId]
    );
    if (!settlementAcc) {
      throw new Error(`Settlement account not found: ${accountId}`);
    }

    // Locate or create contra clearing account
    let clearingAcc = await this.adapter.queryOne<any>(
      `SELECT * FROM accounts WHERE user_id = ? AND name = 'IOU Clearing' AND is_archived = 0`,
      [userId]
    );

    if (!clearingAcc) {
      const clearingId = generateUUID();
      const clearingType = iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY';
      const now = new Date().toISOString();
      await this.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES (?, ?, 'IOU Clearing', ?, ?, 0, 0, ?, ?, 1)`,
        [clearingId, userId, clearingType, iou.currency || 'INR', now, now]
      );
      clearingAcc = { id: clearingId };
    }

    // Construct balanced settlement entries
    const entries = iou.direction === 'LENT'
      ? [
          { account_id: accountId, amount_minor: amountMinor, direction: 'DEBIT' as const },
          { account_id: clearingAcc.id, amount_minor: amountMinor, direction: 'CREDIT' as const }
        ]
      : [
          { account_id: clearingAcc.id, amount_minor: amountMinor, direction: 'DEBIT' as const },
          { account_id: accountId, amount_minor: amountMinor, direction: 'CREDIT' as const }
        ];

    // Atomically post the settlement transaction
    const tx = await this.txOps.postTransaction({
      idempotency_key: generateUUID(),
      transaction_date: new Date().toISOString().slice(0, 10),
      description: `IOU Settlement: ${iou.counterparty_name} (${iou.direction})`,
      entries
    }, userId);

    const newBal = remBal - amountMinor;
    const newStatus = newBal === 0n ? 'SETTLED' : 'PARTIAL';
    const now = new Date().toISOString();
    const newVersion = (BigInt(iou.version ?? 1)) + 1n;

    await this.adapter.run(
      `UPDATE iou_records
       SET remaining_balance_minor = ?, status = ?, updated_at = ?, version = version + 1
       WHERE id = ?`,
      [newBal, newStatus, now, iouId]
    );

    // Enqueue IOU update mutation
    await this.outbox.enqueue({
      id: generateUUID(),
      table_name: 'iou_records',
      record_id: iouId,
      operation: 'UPDATE',
      payload: JSON.stringify({
        id: iouId,
        remaining_balance_minor: newBal.toString(),
        status: newStatus,
        updated_at: now,
        version: newVersion.toString()
      }),
      created_at: now
    });

    const updatedIOU: IOURecord = {
      id: iou.id,
      user_id: iou.user_id,
      counterparty_name: iou.counterparty_name,
      counterparty_contact: iou.counterparty_contact ?? null,
      direction: iou.direction,
      principal_minor: BigInt(iou.principal_minor),
      remaining_balance_minor: newBal,
      currency: iou.currency,
      status: newStatus,
      due_date: iou.due_date ?? null,
      notes: iou.notes ?? null,
      is_deleted: Boolean(iou.is_deleted),
      created_at: iou.created_at,
      updated_at: now,
      version: newVersion
    };

    return {
      iou: updatedIOU,
      transaction: tx
    };
  }
}
