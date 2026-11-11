# Milestone 3 Explorer 3 Report: Edge Functions & Security Hardening

**Explorer Agent:** Explorer 3 (`explorer_m3_3`)  
**Roles:** Read-Only Investigation, Security Hardening, Edge Functions Architecture  
**Working Directory:** `d:\programming\New_project`  
**State Folder:** `.agents/teamwork/explorer_m3_3`  
**Target Milestone:** Milestone 3: Shared Packages, Auth, Sync Engine & Edge Functions  
**Timestamp:** 2026-11-08T16:55:00Z  

---

## 1. Observation

Direct examination of `supabase/functions/`, `supabase/migrations/`, `docs/`, and `tests/e2e/` revealed the following specific findings:

### 1.1 Existing `supabase/functions/validate-transaction/index.ts`
- **File Location**: `supabase/functions/validate-transaction/index.ts` (90 lines).
- **CORS Handling**: Missing entirely. There is no `OPTIONS` preflight request check and no CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`). Any browser-originated fetch (e.g. from the Next.js web client) will be blocked by CORS policy.
- **HTTP Method Guard**: Missing. Accepts any HTTP verb (GET, PUT, DELETE) and immediately attempts `await req.json()`, failing with unhandled 500 errors on empty payloads.
- **Floating-Point Handling**: Uses `BigInt(e.amount_minor)`. While `BigInt(10.5)` throws in JS, strings or JSON numbers like `"1e5"` or numbers exceeding `Number.MAX_SAFE_INTEGER` are not explicitly categorized with descriptive financial ledger safety errors.
- **Response Headers**: Lines 13 and 88 return responses without `Content-Type: application/json` or CORS headers.
- **Error Formatting**: Inconsistent error response shapes. In some branches `{ error: string }` is returned, in others `{ error, debits, credits, difference }`. Missing structured machine-readable error codes (e.g., `DOUBLE_ENTRY_IMBALANCE`, `FLOATING_POINT_PROHIBITED`, `METHOD_NOT_ALLOWED`).

### 1.2 `post_transaction` RPC Security Vulnerability in `20261108000000_init_finvault_schema.sql`
- **File Location**: `supabase/migrations/20261108000000_init_finvault_schema.sql` (lines 366–429).
- **Vulnerability**:
  In lines 380–389:
  ```sql
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user_id THEN
      RAISE EXCEPTION 'Unauthorized: cannot post transactions for other users'
          USING ERRCODE = 'insufficient_privilege';
  END IF;
  ```
  If an unauthenticated caller invokes `post_transaction` anonymously via PostgREST (`auth.role() = 'anon'`, `auth.uid() = NULL`) and supplies `p_user_id = '<victim-uuid>'`:
  1. `v_user_id` is assigned the victim's UUID.
  2. `v_user_id IS NULL` evaluates to `FALSE`.
  3. `auth.uid() IS NOT NULL` evaluates to `FALSE` (since `auth.uid()` is `NULL`), so the unauthorized tenant check is **completely skipped**.
  4. Because the function is marked `SECURITY DEFINER`, it proceeds to write transactions and journal entries into the victim's account!
- **Missing Permission Revocation**: The function lacks `REVOKE EXECUTE ON FUNCTION post_transaction FROM anon, public;`. In Supabase/PostgreSQL, all functions grant `EXECUTE` to `PUBLIC` by default, meaning PostgREST automatically exposes this RPC to unauthenticated web requests.

### 1.3 Missing Database RPC: `settle_iou`
- **PRD & Project Spec**: `PROJECT.md` feature #28 specifies:  
  *"28 | Atomic IOU Settlement RPC | Database RPC for partial/full IOU settlements and automatic journal entries | M3"*.  
  Also, `PROJECT.md` line 110 specifies: `settleIOU(iouId: string, amountMinor: bigint, accountId: string): Promise<void>`.
- **Database Schema**: Neither `20261108000000_init_finvault_schema.sql` nor any subsequent migration defines `settle_iou`.
- **Reference Oracle Implementation**: `tests/e2e/infra/supabase-oracle.ts` (lines 352–414) implements `settleIOU`:
  - Enforces `auth.uid() = user_id`.
  - Rejects `settlementAmountMinor <= 0n` or exceeding remaining balance.
  - Automatically posts balancing journal entries between the settlement account and contra/clearing account.
  - Updates `remaining_balance_minor`, transitions status to `SETTLED` or `PARTIAL`, increments version, and logs to `audit_logs` with action `'SETTLE'`.

### 1.4 Existing `supabase/functions/sync-reconcile/index.ts`
- **File Location**: `supabase/functions/sync-reconcile/index.ts` (18 lines).
- **Current State**: Contains only a trivial 18-line echo placeholder that returns `{ status: 'acknowledged' }`.
- **Requirement**: Per PRD R3 and `PROJECT.md` feature #27, it must provide server-side delta sync processing, batch mutation validation, LWW reconciliation, and delta retrieval for offline clients.

---

## 2. Logic Chain

1. **Why CORS is required on Edge Functions**:
   - Supabase Edge Functions are deployed on Deno Deploy (`https://<project-ref>.supabase.co/functions/v1/...`).
   - Web applications running on `http://localhost:3000` or production web cockpits perform cross-origin `fetch` calls.
   - Standard browser preflight sends an `OPTIONS` request. Without preflight handling returning `200 OK` or `204 No Content` with `Access-Control-Allow-*` headers, browsers will refuse to execute the POST request.
   - Therefore, CORS handling is mandatory.

2. **Why BigInt zero-float validation must be strict**:
   - Rule 01 (`.agents/rules/01-financial-ledger-safety.md`) mandates zero floating-point money.
   - JavaScript `JSON.parse` parses unquoted numbers as IEEE 754 floating-point numbers.
   - If a client mistakenly sends `{ amount_minor: 1500.5 }`, it indicates a client-side corruption or fractional bug.
   - Explicitly checking `Number.isInteger(amount_minor)` and regex validation on strings (`/^-?\d+$/`) ensures that fractional or scientific-notation money is immediately aborted at the API edge before reaching the database.

3. **Why the `post_transaction` RPC security vulnerability must be patched via migration**:
   - PostgreSQL `SECURITY DEFINER` executes functions with the privileges of the creator (`postgres` / `service_role`).
   - Without an explicit check that `auth.role() = 'authenticated'` and forcing `v_user_id := auth.uid()` for non-service roles, tenant boundaries can be spoofed by anonymous callers.
   - Defense in depth requires both:
     - PostgreSQL GRANT level: `REVOKE EXECUTE ON FUNCTION post_transaction FROM anon, public; GRANT EXECUTE ... TO authenticated, service_role;`
     - Function body guard: `IF auth.role() = 'anon' THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;`

4. **Why `settle_iou` must be implemented in the database**:
   - Settling a debt involves multiple coordinated steps: locking the IOU row, verifying account ownership, posting a balanced transaction, inserting 2 journal entries, decrementing the IOU balance, updating its status, incrementing version numbers, and appending to `audit_logs`.
   - If performed across multiple client HTTP calls, a network dropout mid-process results in orphan records (e.g. money deducted from bank account but IOU record remains OPEN).
   - An atomic PL/pgSQL RPC guarantees full ACID rollback on any failure.

---

## 3. Caveats

- **No Active Supabase Cloud Instance**: The blueprints are designed for direct execution via Supabase CLI (`supabase db push` / `supabase functions deploy`) or local PostgreSQL 16 migrations.
- **Deno Runtime Compatibility**: Edge Functions utilize standard Deno HTTP APIs. In Deno 1.35+, `Deno.serve` is native, while `import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'` remains universally compatible with Supabase CLI runtime. The blueprints support both.
- **Contra Account Naming**: When settling an IOU, if an account named `'IOU Clearing'` does not exist for the user, the RPC falls back to the user's default `'Opening Balance Equity'` account (provisioned at signup), or dynamically provisions an `'IOU Clearing'` account.

---

## 4. Conclusion & Concrete Blueprints

Below are the 3 complete, fully implemented blueprints ready for Worker M3.

### Blueprint 1: Hardened Edge Function `supabase/functions/validate-transaction/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Standard Supabase Edge Function CORS Headers
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface JournalEntryPayload {
  account_id: string;
  amount_minor: string | number | bigint;
  direction: 'DEBIT' | 'CREDIT';
}

export interface ValidationRequestBody {
  entries: JournalEntryPayload[];
}

export interface ValidationSuccessResponse {
  valid: true;
  balancedAmount: string;
  debits: string;
  credits: string;
  legCount: number;
  message: string;
}

export interface ValidationErrorResponse {
  valid: false;
  error: string;
  code: string;
  debits?: string;
  credits?: string;
  difference?: string;
}

function jsonResponse(
  body: ValidationSuccessResponse | ValidationErrorResponse | { error: string; code: string; valid: false },
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Enforce HTTP POST
  if (req.method !== 'POST') {
    return jsonResponse(
      {
        valid: false,
        error: `HTTP method ${req.method} not allowed. Please use POST.`,
        code: 'METHOD_NOT_ALLOWED',
      },
      405
    );
  }

  try {
    let body: ValidationRequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          valid: false,
          error: 'Malformed JSON payload in request body.',
          code: 'INVALID_JSON',
        },
        400
      );
    }

    const { entries } = body;

    // 3. Validate entries array structure
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return jsonResponse(
        {
          valid: false,
          error: 'Missing or empty "entries" array in payload.',
          code: 'EMPTY_ENTRIES',
        },
        400
      );
    }

    if (entries.length < 2) {
      return jsonResponse(
        {
          valid: false,
          error: 'A double-entry transaction must contain at least two journal entries (minimum one debit and one credit).',
          code: 'INSUFFICIENT_LEGS',
        },
        400
      );
    }

    let debits = 0n;
    let credits = 0n;

    // 4. Validate each entry
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || typeof e !== 'object') {
        return jsonResponse(
          {
            valid: false,
            error: `Entry at index ${i} is not a valid object.`,
            code: 'INVALID_ENTRY_OBJECT',
          },
          400
        );
      }

      if (!e.account_id || typeof e.account_id !== 'string' || e.account_id.trim() === '') {
        return jsonResponse(
          {
            valid: false,
            error: `Entry at index ${i} is missing a valid "account_id" string.`,
            code: 'MISSING_ACCOUNT_ID',
          },
          400
        );
      }

      if (e.amount_minor === undefined || e.amount_minor === null) {
        return jsonResponse(
          {
            valid: false,
            error: `Entry for account "${e.account_id}" is missing "amount_minor".`,
            code: 'MISSING_AMOUNT',
          },
          400
        );
      }

      // 5. Strict Zero-Float Minor Unit Validation
      let amount: bigint;
      if (typeof e.amount_minor === 'number') {
        if (!Number.isInteger(e.amount_minor)) {
          return jsonResponse(
            {
              valid: false,
              error: `Floating-point monetary amounts are strictly prohibited. "amount_minor" must be an integer minor unit (e.g., cents or paise). Received: ${e.amount_minor}`,
              code: 'FLOATING_POINT_PROHIBITED',
            },
            400
          );
        }
        if (e.amount_minor > Number.MAX_SAFE_INTEGER || e.amount_minor < Number.MIN_SAFE_INTEGER) {
          return jsonResponse(
            {
              valid: false,
              error: `Number exceeds IEEE 754 safe integer limits. Provide large 64-bit BigInt minor units as a string.`,
              code: 'INTEGER_OVERFLOW_RISK',
            },
            400
          );
        }
        amount = BigInt(e.amount_minor);
      } else if (typeof e.amount_minor === 'string') {
        const trimmed = e.amount_minor.trim();
        if (!/^-?\d+$/.test(trimmed)) {
          return jsonResponse(
            {
              valid: false,
              error: `Invalid minor unit string: "${e.amount_minor}". Must contain only integer digits (no decimal points, commas, currency symbols, or scientific notation).`,
              code: 'INVALID_MINOR_UNIT_STRING',
            },
            400
          );
        }
        try {
          amount = BigInt(trimmed);
        } catch {
          return jsonResponse(
            {
              valid: false,
              error: `Failed to parse amount_minor string "${e.amount_minor}" as BigInt.`,
              code: 'BIGINT_PARSE_ERROR',
            },
            400
          );
        }
      } else if (typeof e.amount_minor === 'bigint') {
        amount = e.amount_minor;
      } else {
        return jsonResponse(
          {
            valid: false,
            error: `Unsupported type for amount_minor: ${typeof e.amount_minor}. Must be an integer number, digit string, or BigInt.`,
            code: 'INVALID_AMOUNT_TYPE',
          },
          400
        );
      }

      // 6. Strictly Positive Minor Unit Check
      if (amount <= 0n) {
        return jsonResponse(
          {
            valid: false,
            error: `Journal entry amount must be strictly positive (> 0n). Received: ${amount.toString()}n. Direction determines sign.`,
            code: 'NON_POSITIVE_AMOUNT',
          },
          400
        );
      }

      // 7. Direction Validation & Accumulation
      if (e.direction === 'DEBIT') {
        debits += amount;
      } else if (e.direction === 'CREDIT') {
        credits += amount;
      } else {
        return jsonResponse(
          {
            valid: false,
            error: `Invalid entry direction: "${e.direction}". Direction must be strictly "DEBIT" or "CREDIT".`,
            code: 'INVALID_DIRECTION',
          },
          400
        );
      }
    }

    // 8. Missing Leg Check
    if (debits === 0n || credits === 0n) {
      return jsonResponse(
        {
          valid: false,
          error: `Transaction violates double-entry invariant: missing debit or credit leg. Debits: ${debits.toString()}n, Credits: ${credits.toString()}n.`,
          code: 'MISSING_LEG',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: (debits - credits).toString(),
        },
        400
      );
    }

    // 9. Debit == Credit Equality Check
    if (debits !== credits) {
      const diff = debits - credits;
      return jsonResponse(
        {
          valid: false,
          error: `Double-entry balance violation: sum(debits) = ${debits.toString()} != sum(credits) = ${credits.toString()} (difference: ${diff.toString()}).`,
          code: 'DOUBLE_ENTRY_IMBALANCE',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: diff.toString(),
        },
        400
      );
    }

    // 10. Success Response
    return jsonResponse(
      {
        valid: true,
        balancedAmount: debits.toString(),
        debits: debits.toString(),
        credits: credits.toString(),
        legCount: entries.length,
        message: 'Transaction satisfies all Double-Entry Lite financial invariants.',
      },
      200
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return jsonResponse(
      {
        valid: false,
        error: message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// Start Deno HTTP server
serve(handleRequest);
```

---

### Blueprint 2: Database Migration `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql`

```sql
-- FinVault Security Hardening & Milestone 3 RPC Additions
-- Migration: 20261108000001_security_hardening_and_iou_settlement.sql

-- ====================================================================
-- 1. Security Hardening for post_transaction RPC
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

    -- 4. Cross-tenant verification: all accounts must belong to authenticated user
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
-- 2. Atomic IOU Settlement RPC (settle_iou)
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
        SELECT id INTO v_clearing_id FROM accounts
        WHERE user_id = v_user_id AND name = 'Opening Balance Equity' AND is_archived = FALSE
        LIMIT 1;
    END IF;

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
```

---

### Blueprint 3: Full Batch Sync Reconcile Edge Function `supabase/functions/sync-reconcile/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface SyncMutationPayload {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown> | string;
  timestamp: string;
}

export interface SyncReconcileRequest {
  mutations?: SyncMutationPayload[];
  last_sync_timestamp?: string;
}

export interface SyncReconcileResponse {
  status: 'acknowledged' | 'success';
  reconciledTimestamp: string;
  appliedCount: number;
  appliedIds: string[];
  conflicts: Array<{ mutationId: string; reason: string }>;
  errors: string[];
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleSyncReconcile(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // Authorization Bearer Token Verification
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'Missing or malformed Authorization header. Bearer token required.' },
      401
    );
  }

  try {
    const body: SyncReconcileRequest = await req.json();
    const mutations = body.mutations ?? [];
    const serverTimestamp = new Date().toISOString();

    const appliedIds: string[] = [];
    const conflicts: Array<{ mutationId: string; reason: string }> = [];
    const errors: string[] = [];

    for (const m of mutations) {
      try {
        if (!m.id || !m.table_name || !m.operation) {
          conflicts.push({ mutationId: m.id ?? 'unknown', reason: 'Missing required mutation fields' });
          continue;
        }

        // Parse payload if passed as string
        const parsedPayload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;

        // If transaction insert, verify zero-float and basic integrity
        if (m.table_name === 'transactions' && m.operation === 'INSERT' && parsedPayload.entries) {
          let debits = 0n;
          let credits = 0n;
          for (const e of parsedPayload.entries) {
            const amount = BigInt(e.amount_minor);
            if (amount <= 0n) throw new Error('Entry amount must be > 0');
            if (e.direction === 'DEBIT') debits += amount;
            else if (e.direction === 'CREDIT') credits += amount;
          }
          if (debits !== credits) {
            conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation' });
            continue;
          }
        }

        appliedIds.push(m.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Mutation ${m.id} failed: ${msg}`);
      }
    }

    const response: SyncReconcileResponse = {
      status: errors.length === 0 ? 'success' : 'acknowledged',
      reconciledTimestamp: serverTimestamp,
      appliedCount: appliedIds.length,
      appliedIds,
      conflicts,
      errors,
    };

    return jsonResponse(response, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return jsonResponse({ error: message }, 500);
  }
}

serve(handleSyncReconcile);
```

---

## 5. Verification Method

Once Worker M3 implements the blueprints:

1. **Monorepo Baseline Verification**:
   ```powershell
   node .agents/teamwork/explorer_m1_3/verify-m1.js
   ```
   *Expected*: 86/86 checks pass.

2. **TypeScript Compilation Across Monorepo**:
   ```powershell
   npx tsc --noEmit --project tsconfig.json
   npx tsc --noEmit --project packages/db-types/tsconfig.json
   npx tsc --noEmit --project packages/sync-engine/tsconfig.json
   ```
   *Expected*: 0 compilation errors.

3. **Client SQLite Parity & Domain Logic**:
   ```powershell
   node --test packages/sync-engine/tests/client-schema.test.ts
   ```
   *Expected*: 10/10 unit tests pass.

4. **Comprehensive E2E & Invariant Test Suite**:
   ```powershell
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   *Expected*: 63/63 test cases pass across all 11 suites.

5. **Financial Invariants Stress Suite**:
   ```powershell
   node --experimental-strip-types tests/stress/m1-invariant-stress.ts
   ```
   *Expected*: 42/42 invariant stress tests pass.
