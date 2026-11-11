-- FinVault Security Hardening, User Profiles & Milestone 3 RPC Additions
-- Migration: 20261108000001_security_hardening_and_iou_settlement.sql

-- ====================================================================
-- 1. Public Profiles Table & User Provisioning Trigger
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    avatar_url TEXT,
    default_currency CHAR(3) NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select') THEN
        CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert') THEN
        CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update') THEN
        CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_delete') THEN
        CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (auth.uid() = id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
RETURNS TRIGGER AS $$
DECLARE
    v_name VARCHAR(120);
    v_avatar TEXT;
BEGIN
    -- Extract display name and avatar from Google OAuth raw metadata
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    v_avatar := NEW.raw_user_meta_data->>'avatar_url';

    -- Provision Profile
    INSERT INTO public.profiles (id, email, display_name, avatar_url, default_currency)
    VALUES (NEW.id, NEW.email, v_name, v_avatar, 'INR')
    ON CONFLICT (id) DO NOTHING;

    -- Provision Default Chart of Accounts
    INSERT INTO public.accounts (user_id, name, type, currency, balance_minor)
    VALUES
        (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
        (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
        (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
        (NEW.id, 'Primary Income', 'INCOME', 'INR', 0),
        (NEW.id, 'Opening Balance Equity', 'EQUITY', 'INR', 0)
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ====================================================================
-- 2. Security Hardening for post_transaction RPC
-- ====================================================================

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
    -- 1. Explicitly reject anonymous callers
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated: anonymous callers cannot post transactions'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Determine target user: authenticated user cannot spoof other tenants
    IF auth.role() = 'service_role' THEN
        v_user_id := COALESCE(p_user_id, auth.uid());
    ELSE
        v_user_id := auth.uid();
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF auth.uid() IS NOT NULL AND auth.uid() <> v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: cannot post transactions for other users'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 3. Validate minimum entries
    IF p_entries IS NULL OR jsonb_array_length(p_entries) < 2 THEN
        RAISE EXCEPTION 'A transaction must contain at least two journal entries'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Cross-tenant verification: all accounts must belong to target user
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

    -- 5. Insert transaction header
    INSERT INTO transactions (user_id, idempotency_key, transaction_date, description, notes)
    VALUES (v_user_id, p_idempotency_key, p_transaction_date, p_description, p_notes)
    RETURNING id INTO v_tx_id;

    -- 6. Insert balanced journal entries
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

-- Revoke default public execution rights and grant only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION post_transaction(UUID, UUID, DATE, VARCHAR, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION post_transaction(UUID, UUID, DATE, VARCHAR, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION post_transaction(UUID, UUID, DATE, VARCHAR, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION post_transaction(UUID, UUID, DATE, VARCHAR, TEXT, JSONB) TO service_role;

-- ====================================================================
-- 3. Atomic IOU Settlement RPC (settle_iou)
-- ====================================================================

CREATE OR REPLACE FUNCTION settle_iou(
    p_iou_id UUID,
    p_settlement_amount_minor BIGINT,
    p_account_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_iou iou_records%ROWTYPE;
    v_acc accounts%ROWTYPE;
    v_clearing_id UUID;
    v_tx_id UUID;
    v_new_remaining BIGINT;
    v_new_status iou_status;
    v_now TIMESTAMPTZ := NOW();
    v_idempotency_key UUID := gen_random_uuid();
    v_entries JSONB;
BEGIN
    -- 1. Authentication check
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated: anonymous callers cannot settle IOUs'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Lock & fetch target IOU record
    SELECT * INTO v_iou FROM iou_records
    WHERE id = p_iou_id AND user_id = v_user_id AND is_deleted = FALSE
    FOR UPDATE;

    IF v_iou.id IS NULL THEN
        RAISE EXCEPTION 'IOU not found or access denied by RLS'
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3. Validate settlement amount
    IF p_settlement_amount_minor <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be > 0n'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_settlement_amount_minor > v_iou.remaining_balance_minor THEN
        RAISE EXCEPTION 'Settlement amount (%n) exceeds remaining balance (%n)',
            p_settlement_amount_minor, v_iou.remaining_balance_minor
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Lock & fetch settlement account
    SELECT * INTO v_acc FROM accounts
    WHERE id = p_account_id AND user_id = v_user_id AND is_archived = FALSE
    FOR UPDATE;

    IF v_acc.id IS NULL THEN
        RAISE EXCEPTION 'Settlement account not found or access denied by RLS'
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 5. Locate or provision Contra Clearing Account
    SELECT id INTO v_clearing_id FROM accounts
    WHERE user_id = v_user_id AND name = 'IOU Clearing' AND is_archived = FALSE
    LIMIT 1;

    IF v_clearing_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, currency, balance_minor)
        VALUES (
            v_user_id,
            'IOU Clearing',
            CASE WHEN v_iou.direction = 'LENT' THEN 'ASSET'::account_type ELSE 'LIABILITY'::account_type END,
            v_iou.currency,
            0
        )
        RETURNING id INTO v_clearing_id;
    END IF;

    -- 6. Construct balanced double-entry legs
    -- If LENT: money is repaid into user's asset account (DEBIT Asset, CREDIT Contra)
    -- If BORROWED: money leaves user's asset account to repay debt (DEBIT Contra, CREDIT Asset)
    IF v_iou.direction = 'LENT' THEN
        v_entries := jsonb_build_array(
            jsonb_build_object('account_id', p_account_id, 'amount_minor', p_settlement_amount_minor, 'direction', 'DEBIT'),
            jsonb_build_object('account_id', v_clearing_id, 'amount_minor', p_settlement_amount_minor, 'direction', 'CREDIT')
        );
    ELSE
        v_entries := jsonb_build_array(
            jsonb_build_object('account_id', v_clearing_id, 'amount_minor', p_settlement_amount_minor, 'direction', 'DEBIT'),
            jsonb_build_object('account_id', p_account_id, 'amount_minor', p_settlement_amount_minor, 'direction', 'CREDIT')
        );
    END IF;

    -- 7. Atomically post transaction and journal entries
    v_tx_id := post_transaction(
        p_user_id := v_user_id,
        p_idempotency_key := v_idempotency_key,
        p_transaction_date := v_now::DATE,
        p_description := 'IOU Settlement: ' || v_iou.counterparty_name || ' (' || v_iou.direction || ')',
        p_notes := p_notes,
        p_entries := v_entries
    );

    -- 8. Update IOU status and balance
    v_new_remaining := v_iou.remaining_balance_minor - p_settlement_amount_minor;
    v_new_status := CASE WHEN v_new_remaining = 0 THEN 'SETTLED'::iou_status ELSE 'PARTIAL'::iou_status END;

    UPDATE iou_records
    SET remaining_balance_minor = v_new_remaining,
        status = v_new_status,
        updated_at = v_now,
        version = version + 1
    WHERE id = p_iou_id;

    -- 9. Append immutable audit log
    INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_state, new_state)
    VALUES (
        v_user_id,
        'iou_records',
        p_iou_id,
        'SETTLE'::audit_action,
        jsonb_build_object('remaining_balance_minor', v_iou.remaining_balance_minor, 'status', v_iou.status),
        jsonb_build_object('remaining_balance_minor', v_new_remaining, 'status', v_new_status, 'settlement_amount_minor', p_settlement_amount_minor, 'transaction_id', v_tx_id)
    );

    RETURN jsonb_build_object(
        'iou_id', p_iou_id,
        'transaction_id', v_tx_id,
        'settled_amount_minor', p_settlement_amount_minor,
        'remaining_balance_minor', v_new_remaining,
        'status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Revoke public execution rights and grant only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION settle_iou(UUID, BIGINT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION settle_iou(UUID, BIGINT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION settle_iou(UUID, BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_iou(UUID, BIGINT, UUID, TEXT) TO service_role;
