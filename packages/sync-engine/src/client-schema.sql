-- FinVault Client SQLite Schema Parity & Mutation Outbox Queue
-- Target SQLite 3.35+ / SQLCipher (64-bit INTEGER minor units, ISO-8601 TEXT dates)

PRAGMA foreign_keys = ON;

-- 1. Accounts Table (Mirrored from Supabase accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
    currency TEXT NOT NULL DEFAULT 'INR',
    balance_minor INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
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
    is_reconciled INTEGER NOT NULL DEFAULT 0 CHECK (is_reconciled IN (0, 1)),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
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
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_iou_remaining_balance 
        CHECK (remaining_balance_minor >= 0 AND remaining_balance_minor <= principal_minor)
);

-- 5. Sinking Funds Table (Savings Goals)
CREATE TABLE IF NOT EXISTS sinking_funds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor > 0),
    allocated_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0),
    target_date TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- 6. Offline Mutation Queue Outbox (sync_queue)
-- Accommodates both standard sync-engine columns and test-harness compatibility aliases
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT,
    record_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL,
    created_at TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_FLIGHT', 'PROCESSING', 'FAILED', 'APPLIED', 'SYNCED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    entity_type TEXT,
    entity_id TEXT,
    timestamp TEXT
);

-- Bidirectional trigger ensuring seamless compatibility between table_name/record_id/created_at
-- and entity_type/entity_id/timestamp
CREATE TRIGGER IF NOT EXISTS trg_sync_queue_compat_sync
AFTER INSERT ON sync_queue
FOR EACH ROW
WHEN NEW.table_name IS NULL OR NEW.entity_type IS NULL OR NEW.record_id IS NULL OR NEW.entity_id IS NULL OR NEW.created_at IS NULL OR NEW.timestamp IS NULL
BEGIN
    UPDATE sync_queue
    SET
        table_name = COALESCE(NEW.table_name, NEW.entity_type),
        record_id = COALESCE(NEW.record_id, NEW.entity_id),
        created_at = COALESCE(NEW.created_at, NEW.timestamp, datetime('now')),
        entity_type = COALESCE(NEW.entity_type, NEW.table_name),
        entity_id = COALESCE(NEW.entity_id, NEW.record_id),
        timestamp = COALESCE(NEW.timestamp, NEW.created_at, datetime('now'))
    WHERE id = NEW.id;
END;

-- Performance & Lookup Indexes (Covering user_id, date, status, account_id, transaction_id)
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tx ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_iou_records_user ON iou_records(user_id);
CREATE INDEX IF NOT EXISTS idx_iou_records_status ON iou_records(status);
CREATE INDEX IF NOT EXISTS idx_iou_records_due_date ON iou_records(due_date);
CREATE INDEX IF NOT EXISTS idx_iou_records_user_status ON iou_records(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sinking_funds_user ON sinking_funds(user_id);
CREATE INDEX IF NOT EXISTS idx_sinking_funds_target_date ON sinking_funds(target_date);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
