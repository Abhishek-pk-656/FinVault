/**
 * FinVault Client SQLite Schema DDL
 * Exported DDL string matching Supabase PostgreSQL 16 schema parity
 */

export const CLIENT_SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

-- 1. Accounts Table (Mirrored from Supabase accounts)
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

-- 2. Transactions Table (Mirrored from Supabase transactions)
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

-- 3. Journal Entries Table (Strict Double-Entry Components)
CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    created_at TEXT NOT NULL
);

-- 4. IOU Records Table (Peer Lending)
CREATE TABLE IF NOT EXISTS iou_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    counterparty_name TEXT NOT NULL,
    counterparty_contact TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('LENT', 'BORROWED')),
    principal_minor INTEGER NOT NULL CHECK (principal_minor > 0),
    remaining_balance_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF')),
    due_date TEXT,
    notes TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- 5. Sinking Funds Table (Savings Goals)
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

-- 6. Offline Mutation Queue Outbox (sync_queue)
-- Accommodates sync engine mutations and offline replay
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_FLIGHT', 'PROCESSING', 'FAILED', 'APPLIED', 'SYNCED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    entity_type TEXT,
    entity_id TEXT,
    timestamp TEXT
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tx ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_iou_records_user ON iou_records(user_id);
CREATE INDEX IF NOT EXISTS idx_sinking_funds_user ON sinking_funds(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
`.trim();

export const SCHEMA_SQL = CLIENT_SQLITE_SCHEMA;
