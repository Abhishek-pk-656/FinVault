/**
 * Supabase PostgreSQL Reference Oracle & RLS Engine
 * 
 * Accurately models Supabase PostgreSQL 16 semantics including:
 * - Row Level Security (RLS) policies (auth.uid() = user_id)
 * - Cross-tenant foreign key isolation
 * - Deferred double-entry integrity constraint triggers
 * - Account balance maintenance triggers
 * - User signup bootstrap trigger
 * - Optimistic concurrency versions and soft-delete tombstones
 */

import * as crypto from 'node:crypto';
import { LedgerOracle } from './ledger-oracle.ts';
import type { AccountType, EntryDirection } from './ledger-oracle.ts';

export interface UserSession {
  userId: string;
  email: string;
  role: 'authenticated' | 'anon';
}

export interface SupabaseAccount {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance_minor: bigint;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface SupabaseTransaction {
  id: string;
  user_id: string;
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string;
  is_reconciled: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface SupabaseJournalEntry {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount_minor: bigint;
  direction: EntryDirection;
  created_at: string;
}

export interface SupabaseIOU {
  id: string;
  user_id: string;
  counterparty_name: string;
  counterparty_contact?: string;
  direction: 'LENT' | 'BORROWED';
  principal_minor: bigint;
  remaining_balance_minor: bigint;
  currency: string;
  status: 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF';
  due_date?: string;
  notes?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface SupabaseSinkingFund {
  id: string;
  user_id: string;
  name: string;
  target_amount_minor: bigint;
  allocated_amount_minor: bigint;
  target_date?: string;
  currency: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export class SupabaseOracle {
  public accounts: Map<string, SupabaseAccount> = new Map();
  public transactions: Map<string, SupabaseTransaction> = new Map();
  public journalEntries: Map<string, SupabaseJournalEntry> = new Map();
  public ious: Map<string, SupabaseIOU> = new Map();
  public sinkingFunds: Map<string, SupabaseSinkingFund> = new Map();
  public idempotencyKeys: Set<string> = new Set();

  /**
   * User Bootstrap Trigger (trg_on_auth_user_created)
   */
  public bootstrapUser(userId: string, email: string): { cashId: string; bankId: string; expenseId: string; incomeId: string } {
    const now = new Date().toISOString();
    const cashId = crypto.randomUUID();
    const bankId = crypto.randomUUID();
    const expenseId = crypto.randomUUID();
    const incomeId = crypto.randomUUID();

    this.accounts.set(cashId, {
      id: cashId,
      user_id: userId,
      name: 'Cash on Hand',
      type: 'ASSET',
      currency: 'INR',
      balance_minor: 0n,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1n
    });

    this.accounts.set(bankId, {
      id: bankId,
      user_id: userId,
      name: 'Main Bank Account',
      type: 'ASSET',
      currency: 'INR',
      balance_minor: 0n,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1n
    });

    this.accounts.set(expenseId, {
      id: expenseId,
      user_id: userId,
      name: 'General Expenses',
      type: 'EXPENSE',
      currency: 'INR',
      balance_minor: 0n,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1n
    });

    this.accounts.set(incomeId, {
      id: incomeId,
      user_id: userId,
      name: 'Primary Income',
      type: 'INCOME',
      currency: 'INR',
      balance_minor: 0n,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1n
    });

    return { cashId, bankId, expenseId, incomeId };
  }

  // --- RLS-Enforced Operations ---

  public getAccounts(session: UserSession): SupabaseAccount[] {
    if (session.role === 'anon') return [];
    return Array.from(this.accounts.values()).filter(a => a.user_id === session.userId && !a.is_archived);
  }

  public getAccountById(session: UserSession, accountId: string): SupabaseAccount | null {
    if (session.role === 'anon') return null;
    const acc = this.accounts.get(accountId);
    if (!acc || acc.user_id !== session.userId) return null;
    return acc;
  }

  public createAccount(session: UserSession, data: { name: string; type: AccountType; currency?: string }): SupabaseAccount {
    if (session.role === 'anon') throw new Error('RLS policy violation: anonymous users cannot create accounts');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const acc: SupabaseAccount = {
      id,
      user_id: session.userId,
      name: data.name,
      type: data.type,
      currency: data.currency ?? 'INR',
      balance_minor: 0n,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1n
    };
    this.accounts.set(id, acc);
    return acc;
  }

  /**
   * Atomic Transaction RPC (post_transaction) with RLS and trigger enforcement
   */
  public postTransaction(
    session: UserSession,
    params: {
      idempotencyKey: string;
      transactionDate: string;
      description: string;
      notes?: string;
      entries: Array<{
        accountId: string;
        amountMinor: bigint;
        direction: EntryDirection;
      }>;
    }
  ): { transaction: SupabaseTransaction; entries: SupabaseJournalEntry[] } {
    if (session.role === 'anon') throw new Error('RLS policy violation: anonymous users cannot post transactions');

    // Idempotency check
    if (this.idempotencyKeys.has(params.idempotencyKey)) {
      throw new Error(`Idempotency conflict: transaction with key ${params.idempotencyKey} already exists`);
    }

    // Server-side Deferred Constraint Trigger: trg_verify_transaction_balance
    const validationEntries = params.entries.map(e => ({
      id: 'pending',
      userId: session.userId,
      transactionId: 'pending',
      accountId: e.accountId,
      amountMinor: e.amountMinor,
      direction: e.direction
    }));

    const valResult = LedgerOracle.validateTransaction(validationEntries);
    if (!valResult.isValid) {
      throw new Error(`Server-side deferred constraint violation: ${valResult.errorMessage}`);
    }

    // Verify cross-tenant account isolation: all accounts must belong to session.userId
    for (const e of params.entries) {
      const acc = this.accounts.get(e.accountId);
      if (!acc) {
        throw new Error(`Foreign key violation: account ${e.accountId} does not exist`);
      }
      if (acc.user_id !== session.userId) {
        throw new Error(`Cross-tenant foreign key violation: account ${e.accountId} belongs to another user`);
      }
    }

    // Atomic execution
    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    const tx: SupabaseTransaction = {
      id: txId,
      user_id: session.userId,
      idempotency_key: params.idempotencyKey,
      transaction_date: params.transactionDate,
      description: params.description,
      notes: params.notes,
      is_reconciled: false,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      version: 1n
    };

    const savedEntries: SupabaseJournalEntry[] = [];

    // trg_update_account_balance trigger
    for (const e of params.entries) {
      const entryId = crypto.randomUUID();
      const entry: SupabaseJournalEntry = {
        id: entryId,
        user_id: session.userId,
        transaction_id: txId,
        account_id: e.accountId,
        amount_minor: e.amountMinor,
        direction: e.direction,
        created_at: now
      };
      this.journalEntries.set(entryId, entry);
      savedEntries.push(entry);

      const acc = this.accounts.get(e.accountId)!;
      const delta = LedgerOracle.calculateBalanceDelta(acc.type, e.direction, e.amountMinor);
      acc.balance_minor += delta;
      acc.updated_at = now;
      acc.version += 1n;
    }

    this.transactions.set(txId, tx);
    this.idempotencyKeys.add(params.idempotencyKey);

    return { transaction: tx, entries: savedEntries };
  }

  public getTransactions(session: UserSession): SupabaseTransaction[] {
    if (session.role === 'anon') return [];
    return Array.from(this.transactions.values()).filter(t => t.user_id === session.userId && !t.is_deleted);
  }

  public getJournalEntries(session: UserSession, transactionId?: string): SupabaseJournalEntry[] {
    if (session.role === 'anon') return [];
    return Array.from(this.journalEntries.values()).filter(e => {
      if (e.user_id !== session.userId) return false;
      if (transactionId && e.transaction_id !== transactionId) return false;
      return true;
    });
  }

  // --- IOU Records ---

  public createIOU(
    session: UserSession,
    data: {
      counterpartyName: string;
      counterpartyContact?: string;
      direction: 'LENT' | 'BORROWED';
      principalMinor: bigint;
      currency?: string;
      dueDate?: string;
      notes?: string;
    }
  ): SupabaseIOU {
    if (session.role === 'anon') throw new Error('RLS policy violation');
    if (data.principalMinor <= 0n) throw new Error('Principal must be strictly positive');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const iou: SupabaseIOU = {
      id,
      user_id: session.userId,
      counterparty_name: data.counterpartyName,
      counterparty_contact: data.counterpartyContact,
      direction: data.direction,
      principal_minor: data.principalMinor,
      remaining_balance_minor: data.principalMinor,
      currency: data.currency ?? 'INR',
      status: 'OPEN',
      due_date: data.dueDate,
      notes: data.notes,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      version: 1n
    };

    this.ious.set(id, iou);
    return iou;
  }

  public settleIOU(
    session: UserSession,
    iouId: string,
    settlementAmountMinor: bigint,
    settlementAccountId: string
  ): { iou: SupabaseIOU; transaction: SupabaseTransaction } {
    if (session.role === 'anon') throw new Error('RLS policy violation');
    const iou = this.ious.get(iouId);
    if (!iou || iou.user_id !== session.userId) {
      throw new Error('IOU not found or access denied by RLS');
    }
    if (settlementAmountMinor <= 0n) {
      throw new Error('Settlement amount must be > 0n');
    }
    if (settlementAmountMinor > iou.remaining_balance_minor) {
      throw new Error(`Settlement amount (${settlementAmountMinor}n) exceeds remaining balance (${iou.remaining_balance_minor}n)`);
    }

    const account = this.accounts.get(settlementAccountId);
    if (!account || account.user_id !== session.userId) {
      throw new Error('Settlement account not found or access denied by RLS');
    }

    // Determine journal entry direction based on IOU direction
    // If LENT: money is coming back into asset account (DEBIT Asset, CREDIT Income/IOU clearing)
    // If BORROWED: money is leaving asset account to repay (DEBIT Liability/IOU clearing, CREDIT Asset)
    const idempotencyKey = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create contra account for IOU clearing if not existing
    let clearingAcc = Array.from(this.accounts.values()).find(a => a.user_id === session.userId && a.name === 'IOU Clearing');
    if (!clearingAcc) {
      clearingAcc = this.createAccount(session, {
        name: 'IOU Clearing',
        type: iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY',
        currency: iou.currency
      });
    }

    const entries = iou.direction === 'LENT'
      ? [
          { accountId: settlementAccountId, amountMinor: settlementAmountMinor, direction: 'DEBIT' as EntryDirection },
          { accountId: clearingAcc.id, amountMinor: settlementAmountMinor, direction: 'CREDIT' as EntryDirection }
        ]
      : [
          { accountId: clearingAcc.id, amountMinor: settlementAmountMinor, direction: 'DEBIT' as EntryDirection },
          { accountId: settlementAccountId, amountMinor: settlementAmountMinor, direction: 'CREDIT' as EntryDirection }
        ];

    const { transaction } = this.postTransaction(session, {
      idempotencyKey,
      transactionDate: now.slice(0, 10),
      description: `IOU Settlement: ${iou.counterparty_name} (${iou.direction})`,
      entries
    });

    iou.remaining_balance_minor -= settlementAmountMinor;
    iou.status = iou.remaining_balance_minor === 0n ? 'SETTLED' : 'PARTIAL';
    iou.updated_at = now;
    iou.version += 1n;

    return { iou, transaction };
  }

  public getIOUs(session: UserSession): SupabaseIOU[] {
    if (session.role === 'anon') return [];
    return Array.from(this.ious.values()).filter(i => i.user_id === session.userId && !i.is_deleted);
  }

  // --- Sinking Funds ---

  public createSinkingFund(
    session: UserSession,
    data: { name: string; targetAmountMinor: bigint; currency?: string; targetDate?: string }
  ): SupabaseSinkingFund {
    if (session.role === 'anon') throw new Error('RLS policy violation');
    if (data.targetAmountMinor <= 0n) throw new Error('Target amount must be > 0n');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fund: SupabaseSinkingFund = {
      id,
      user_id: session.userId,
      name: data.name,
      target_amount_minor: data.targetAmountMinor,
      allocated_amount_minor: 0n,
      target_date: data.targetDate,
      currency: data.currency ?? 'INR',
      is_completed: false,
      created_at: now,
      updated_at: now,
      version: 1n
    };

    this.sinkingFunds.set(id, fund);
    return fund;
  }

  public getSinkingFunds(session: UserSession): SupabaseSinkingFund[] {
    if (session.role === 'anon') return [];
    return Array.from(this.sinkingFunds.values()).filter(f => f.user_id === session.userId);
  }
}
