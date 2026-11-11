import type { SQLiteStorageAdapter } from '../storage/adapter.ts';
import { AccountsOperations } from './accounts.ts';
import { TransactionsOperations } from './transactions.ts';
import { IOUsOperations } from './ious.ts';
import type { Account, Transaction, IOURecord, CreateTransactionDTO, NewTransactionPayload } from '@finvault/db-types';

export * from './accounts.ts';
export * from './transactions.ts';
export * from './ious.ts';

export class ClientLedgerOperations {
  private adapter: SQLiteStorageAdapter;
  private accountsOps: AccountsOperations;
  private txOps: TransactionsOperations;
  private iousOps: IOUsOperations;

  constructor(adapter: SQLiteStorageAdapter) {
    this.adapter = adapter;
    this.accountsOps = new AccountsOperations(adapter);
    this.txOps = new TransactionsOperations(adapter);
    this.iousOps = new IOUsOperations(adapter);
  }

  public getAdapter(): SQLiteStorageAdapter {
    return this.adapter;
  }

  public async getAccounts(userId?: string): Promise<Account[]> {
    return this.accountsOps.getAccounts(userId);
  }

  public async getAccountById(id: string): Promise<Account | null> {
    return this.accountsOps.getAccountById(id);
  }

  public async postTransaction(
    tx: NewTransactionPayload | CreateTransactionDTO,
    userId?: string
  ): Promise<Transaction> {
    return this.txOps.postTransaction(tx, userId);
  }

  public async settleIOU(
    iouId: string,
    amountMinor: bigint,
    accountId: string,
    userId?: string
  ): Promise<{ iou: IOURecord; transaction: Transaction }> {
    return this.iousOps.settleIOU(iouId, amountMinor, accountId, userId);
  }
}
