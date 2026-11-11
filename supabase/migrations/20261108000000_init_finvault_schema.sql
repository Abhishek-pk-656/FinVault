-- FinVault Initial Schema & Invariant Enforcement
-- Generated for Supabase PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Enum Definitions
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE iou_direction AS ENUM ('LENT', 'BORROWED');
CREATE TYPE iou_status AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF');
CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'RECONCILE', 'SETTLE');

-- 1. Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    type account_type NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    balance_minor BIGINT NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_accounts_user_id UNIQUE (user_id, id)
);

-- 2. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idempotency_key UUID UNIQUE NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    notes TEXT,
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

-- 3. Journal Entries Table (Strict Double-Entry Components)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    direction entry_direction NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_journal_entries_account 
        FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE RESTRICT
);

-- 4. IOU Records Table
CREATE TABLE IF NOT EXISTS iou_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    counterparty_name VARCHAR(120) NOT NULL,
    counterparty_contact VARCHAR(80),
    direction iou_direction NOT NULL,
    principal_minor BIGINT NOT NULL CHECK (principal_minor > 0),
    remaining_balance_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status iou_status NOT NULL DEFAULT 'OPEN',
    due_date DATE,
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT chk_iou_remaining_balance 
        CHECK (remaining_balance_minor >= 0 AND remaining_balance_minor <= principal_minor)
);

-- 5. Sinking Funds Table
CREATE TABLE IF NOT EXISTS sinking_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0),
    allocated_amount_minor BIGINT NOT NULL DEFAULT 0,
    target_date DATE,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT chk_sinking_funds_allocated
        CHECK (allocated_amount_minor >= 0)
);

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action audit_action NOT NULL,
    old_state JSONB,
    new_state JSONB,
    client_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- Performance & Lookup Indexes
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_accounts_user_type ON accounts(user_id, type);
CREATE INDEX IF NOT EXISTS idx_accounts_user_archived ON accounts(user_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_updated ON transactions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tx ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_acc ON journal_entries(user_id, account_id);

CREATE INDEX IF NOT EXISTS idx_iou_records_user_status ON iou_records(user_id, status);
CREATE INDEX IF NOT EXISTS idx_iou_records_user_due ON iou_records(user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_sinking_funds_user_completed ON sinking_funds(user_id, is_completed);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_entity ON audit_logs(user_id, entity_type, entity_id);

-- ====================================================================
-- Granular Row Level Security (RLS) Policies
-- ====================================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE iou_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sinking_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Granular RLS Policies for Accounts
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (auth.uid() = user_id);

-- Granular RLS Policies for Transactions
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Granular RLS Policies for Journal Entries
CREATE POLICY "journal_entries_select" ON journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "journal_entries_insert" ON journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "journal_entries_update" ON journal_entries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "journal_entries_delete" ON journal_entries FOR DELETE USING (auth.uid() = user_id);

-- Granular RLS Policies for IOU Records
CREATE POLICY "iou_records_select" ON iou_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "iou_records_insert" ON iou_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "iou_records_update" ON iou_records FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "iou_records_delete" ON iou_records FOR DELETE USING (auth.uid() = user_id);

-- Granular RLS Policies for Sinking Funds
CREATE POLICY "sinking_funds_select" ON sinking_funds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sinking_funds_insert" ON sinking_funds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sinking_funds_update" ON sinking_funds FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sinking_funds_delete" ON sinking_funds FOR DELETE USING (auth.uid() = user_id);

-- Granular RLS Policies for Audit Logs (Append-Only)
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- Database Functions & Triggers
-- ====================================================================

-- Double-Entry Deferred Constraint Trigger Function
CREATE OR REPLACE FUNCTION verify_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    target_tx_id UUID;
    total_debits NUMERIC(38, 0);
    total_credits NUMERIC(38, 0);
    entry_count INT;
BEGIN
    target_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE 0 END), 0),
        COUNT(*)
    INTO total_debits, total_credits, entry_count
    FROM journal_entries
    WHERE transaction_id = target_tx_id;

    -- If all journal entries were deleted as part of transaction removal, allow
    IF entry_count = 0 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Enforce at least one debit and one credit
    IF total_debits = 0 OR total_credits = 0 THEN
        RAISE EXCEPTION 'Transaction % violates double-entry invariant: missing debit or credit leg (debits: %, credits: %)',
            target_tx_id, total_debits, total_credits
            USING ERRCODE = 'check_violation';
    END IF;

    -- Enforce debit == credit equality
    IF total_debits <> total_credits THEN
        RAISE EXCEPTION 'Transaction % violates double-entry invariant: sum(debits) = % != sum(credits) = % (difference: %)',
            target_tx_id, total_debits, total_credits, (total_debits - total_credits)
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- Bind as a DEFERRED constraint trigger
DROP TRIGGER IF EXISTS trg_verify_transaction_balance ON journal_entries;
CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_transaction_balance();

-- Account Balance Maintenance Trigger Function
CREATE OR REPLACE FUNCTION update_account_balance_on_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_type account_type;
    v_delta BIGINT;
    v_old_type account_type;
    v_new_type account_type;
    v_old_delta BIGINT;
    v_new_delta BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT type INTO v_type FROM accounts WHERE id = NEW.account_id FOR UPDATE;
        IF v_type IS NULL THEN
            RAISE EXCEPTION 'Account % not found or inaccessible', NEW.account_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_type IN ('ASSET', 'EXPENSE') THEN
            v_delta := CASE WHEN NEW.direction = 'DEBIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        ELSE
            v_delta := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        END IF;
        
        UPDATE accounts 
        SET balance_minor = balance_minor + v_delta, 
            updated_at = NOW(),
            version = version + 1
        WHERE id = NEW.account_id;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT type INTO v_type FROM accounts WHERE id = OLD.account_id FOR UPDATE;
        IF v_type IS NULL THEN
            RAISE EXCEPTION 'Account % not found or inaccessible', OLD.account_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_type IN ('ASSET', 'EXPENSE') THEN
            v_delta := CASE WHEN OLD.direction = 'DEBIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        ELSE
            v_delta := CASE WHEN OLD.direction = 'CREDIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        END IF;
        
        UPDATE accounts 
        SET balance_minor = balance_minor + v_delta, 
            updated_at = NOW(),
            version = version + 1
        WHERE id = OLD.account_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Guard against reassigning immutable keys
        IF OLD.id <> NEW.id THEN
            RAISE EXCEPTION 'Cannot update primary key id of journal entry'
                USING ERRCODE = 'check_violation';
        END IF;

        IF OLD.user_id <> NEW.user_id THEN
            RAISE EXCEPTION 'Cannot reassign journal entry to a different user'
                USING ERRCODE = 'check_violation';
        END IF;

        IF OLD.transaction_id <> NEW.transaction_id THEN
            RAISE EXCEPTION 'Cannot reassign journal entry to a different transaction'
                USING ERRCODE = 'check_violation';
        END IF;

        -- Revert OLD entry impact
        SELECT type INTO v_old_type FROM accounts WHERE id = OLD.account_id FOR UPDATE;
        IF v_old_type IN ('ASSET', 'EXPENSE') THEN
            v_old_delta := CASE WHEN OLD.direction = 'DEBIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        ELSE
            v_old_delta := CASE WHEN OLD.direction = 'CREDIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        END IF;

        -- Apply NEW entry impact
        SELECT type INTO v_new_type FROM accounts WHERE id = NEW.account_id FOR UPDATE;
        IF v_new_type IS NULL THEN
            RAISE EXCEPTION 'Account % not found or inaccessible', NEW.account_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_new_type IN ('ASSET', 'EXPENSE') THEN
            v_new_delta := CASE WHEN NEW.direction = 'DEBIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        ELSE
            v_new_delta := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        END IF;

        -- Apply updates
        IF OLD.account_id = NEW.account_id THEN
            UPDATE accounts 
            SET balance_minor = balance_minor + (v_old_delta + v_new_delta), 
                updated_at = NOW(),
                version = version + 1
            WHERE id = NEW.account_id;
        ELSE
            UPDATE accounts 
            SET balance_minor = balance_minor + v_old_delta, 
                updated_at = NOW(),
                version = version + 1
            WHERE id = OLD.account_id;

            UPDATE accounts 
            SET balance_minor = balance_minor + v_new_delta, 
                updated_at = NOW(),
                version = version + 1
            WHERE id = NEW.account_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_update_account_balance ON journal_entries;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION update_account_balance_on_journal();

-- User Bootstrap Account Provisioning Trigger
CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO accounts (user_id, name, type, currency, balance_minor)
    VALUES
        (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
        (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
        (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
        (NEW.id, 'Primary Income', 'INCOME', 'INR', 0),
        (NEW.id, 'Opening Balance Equity', 'EQUITY', 'INR', 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_provisioning();

-- Atomic Transaction RPC (post_transaction)
CREATE OR REPLACE FUNCTION post_transaction(
    p_user_id UUID DEFAULT auth.uid(),
    p_idempotency_key UUID DEFAULT gen_random_uuid(),
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_description VARCHAR(255) DEFAULT '',
    p_notes TEXT DEFAULT NULL,
    p_entries JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_tx_id UUID;
    v_entry JSONB;
BEGIN
    -- Determine target user and guard against tenant impersonation
    v_user_id := COALESCE(p_user_id, auth.uid());
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF auth.uid() IS NOT NULL AND auth.uid() <> v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: cannot post transactions for other users'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate minimum entries
    IF p_entries IS NULL OR jsonb_array_length(p_entries) < 2 THEN
        RAISE EXCEPTION 'A transaction must contain at least two journal entries'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cross-tenant verification: all referenced accounts must belong to authenticated user
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM accounts 
            WHERE id = (v_entry->>'account_id')::UUID 
              AND user_id = v_user_id
        ) THEN
            RAISE EXCEPTION 'Cross-tenant foreign key violation: account % does not belong to user %',
                (v_entry->>'account_id')::UUID, v_user_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END LOOP;

    INSERT INTO transactions (user_id, idempotency_key, transaction_date, description, notes)
    VALUES (v_user_id, p_idempotency_key, p_transaction_date, p_description, p_notes)
    RETURNING id INTO v_tx_id;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO journal_entries (user_id, transaction_id, account_id, amount_minor, direction)
        VALUES (
            v_user_id,
            v_tx_id,
            (v_entry->>'account_id')::UUID,
            (v_entry->>'amount_minor')::BIGINT,
            (v_entry->>'direction')::entry_direction
        );
    END LOOP;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
