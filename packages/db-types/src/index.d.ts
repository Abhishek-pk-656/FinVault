/**
 * FinVault Shared Database Types
 * Invariant: All monetary amounts are stored as BIGINT minor units (paise/cents).
 * No floating point currency numbers are permitted.
 */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type EntryDirection = 'DEBIT' | 'CREDIT';
export type IOUDirection = 'LENT' | 'BORROWED';
export type IOUStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF';
export interface Account {
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
export interface Transaction {
    id: string;
    user_id: string;
    idempotency_key: string;
    transaction_date: string;
    description: string;
    notes?: string | null;
    is_reconciled: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    version: bigint;
}
export interface JournalEntry {
    id: string;
    user_id: string;
    transaction_id: string;
    account_id: string;
    amount_minor: bigint;
    direction: EntryDirection;
    created_at: string;
}
export interface IOURecord {
    id: string;
    user_id: string;
    counterparty_name: string;
    counterparty_contact?: string | null;
    direction: IOUDirection;
    principal_minor: bigint;
    remaining_balance_minor: bigint;
    currency: string;
    status: IOUStatus;
    due_date?: string | null;
    notes?: string | null;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    version: bigint;
}
export interface SinkingFund {
    id: string;
    user_id: string;
    name: string;
    target_amount_minor: bigint;
    allocated_amount_minor: bigint;
    target_date?: string | null;
    currency: string;
    is_completed: boolean;
    created_at: string;
    updated_at: string;
    version: bigint;
}
export interface NewJournalEntryPayload {
    account_id: string;
    amount_minor: bigint;
    direction: EntryDirection;
}
export interface NewTransactionPayload {
    idempotency_key: string;
    transaction_date: string;
    description: string;
    notes?: string;
    entries: NewJournalEntryPayload[];
}
export interface NewIOUPayload {
    counterparty_name: string;
    counterparty_contact?: string;
    direction: IOUDirection;
    principal_minor: bigint;
    currency?: string;
    due_date?: string;
    notes?: string;
}
//# sourceMappingURL=index.d.ts.map