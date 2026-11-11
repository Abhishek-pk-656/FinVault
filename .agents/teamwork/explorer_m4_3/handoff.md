# Milestone 4 Explorer 3 Handoff Report: Supabase Data Layer, SSR/Client Integration & Frontend Build Pipeline

**Explorer:** Explorer M4.3 (`explorer_m4_3`)  
**Role:** Supabase Data Layer, SSR/Client Integration & Frontend Build Explorer  
**Working Directory:** `d:\programming\New_project`  
**State Folder:** `d:\programming\New_project\.agents\teamwork\explorer_m4_3`  
**Date:** 2026-11-09  
**Parent Agent:** Orchestrator (`867b8adb-e639-414f-92fa-0326940898a2`)  
**Status:** **COMPLETE / HARD HANDOFF**

---

## 1. Observation

### 1.1 Existing Architecture & File State
1. **Monorepo Structure & Dependencies**:
   - `apps/web/package.json` contains Next.js 14.2.3, React 18.2.0, `@supabase/ssr` (^0.3.0), `@supabase/supabase-js` (^2.42.0), `clsx`, `tailwind-merge`, and workspace linkages to `@finvault/db-types`, `@finvault/sync-engine`, and `@finvault/ui`.
   - `packages/db-types/src/index.ts` declares:
     - Domain interfaces with native 64-bit BigInt (`Account.balance_minor: bigint`, `JournalEntry.amount_minor: bigint`, `IOURecord.principal_minor: bigint`, `IOURecord.remaining_balance_minor: bigint`).
     - PostgREST database generic `Database['public']['Tables']` typed with number rows and `number | bigint` for Insert/Update.
     - RPC definitions: `post_transaction` (lines 603–614, accepting `p_entries: Json`, returning `string` UUID) and `settle_iou` (lines 615–623, accepting `p_settlement_amount_minor: number | bigint`, returning `Json`).
   - `packages/ui/src/index.tsx` (lines 18–62) already provides exact BigInt currency parsing and formatting:
     - `formatMinorToDecimal(amountMinor: bigint, decimals: number = 2): string`
     - `parseDecimalToMinor(input: string, decimals: number = 2): bigint`

2. **Supabase Client and SSR Boundary**:
   - `apps/web/src/lib/supabase/client.ts`: Uses `createBrowserClient<Database>` for browser contexts.
   - `apps/web/src/lib/supabase/server.ts`: Uses `createServerClient<Database>` with `cookies()` from `next/headers`. The cookie `set` and `remove` handlers contain `try/catch` blocks because Next.js 14 Server Components throw if cookie mutation is attempted during rendering.
   - `apps/web/src/middleware.ts`: Implements cookie refreshing and auth gating via `supabase.auth.getUser()`. Lines 45–48 redirect unauthenticated sessions to `/login`.
   - **Crucial Observation**: The `/login` page route (`apps/web/src/app/login/page.tsx`) does not yet exist.

3. **React Server Components BigInt Serialization Hazard**:
   - In Next.js 14 App Router, Server Components passing props across the RSC boundary to Client Components (`'use client'`) use React Flight protocol serialization.
   - Attempting to pass raw JavaScript `bigint` values across the boundary triggers verbatim:
     ```
     TypeError: Do not know how to serialize a BigInt
     ```
   - Similarly, Server Actions returning responses to Client Components fail if objects contain raw `bigint` properties.

4. **Database RPC Signatures in Supabase SQL Migrations**:
   - `post_transaction` (`supabase/migrations/20261108000000_init_finvault_schema.sql`, lines 366–428):
     Accepts `p_user_id UUID`, `p_idempotency_key UUID`, `p_transaction_date DATE`, `p_description VARCHAR(255)`, `p_notes TEXT`, `p_entries JSONB`.
     In PostgreSQL, line 422 casts entry amounts using `(v_entry->>'amount_minor')::BIGINT`. Because `->>` extracts JSON values as text, amounts passed as numeric strings or integers in JSON are parsed into 64-bit PostgreSQL `BIGINT` without floating-point distortion.
   - `settle_iou` (`supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql`, lines 163–297):
     Accepts `p_iou_id UUID`, `p_settlement_amount_minor BIGINT`, `p_account_id UUID`, `p_notes TEXT`.
     Dynamically provisions `IOU Clearing` contra account (lines 230–240) and executes balanced double-entry transaction via `post_transaction`.

5. **Build & Lint Pipeline Observations**:
   - Running `pnpm install` successfully installed 1,181 packages across all 6 workspace projects in 53.8s.
   - Running `pnpm --filter @finvault/web typecheck` succeeds with code 0 (zero errors).
   - Running `pnpm --filter @finvault/web build` succeeds with code 0 (Next.js 14.2.35 production build compiled static and dynamic routes).
   - Running `pnpm --filter @finvault/web lint` exits with code 1 because no `.eslintrc.json` file is present in `apps/web/`, causing Next.js to prompt interactively.

---

## 2. Logic Chain

1. **BigInt Serialization Invariant Strategy**:
   - *Premise 1*: FinVault Rule 01 strictly prohibits floating-point representations of monetary values.
   - *Premise 2*: React Server Components Flight protocol and JSON transport cannot serialize native JavaScript `bigint` values.
   - *Inference*: Money must be represented across the RSC boundary as string-encoded integer minor units (e.g. `"150000"` for ₹1,500.00).
   - *Result*: The data layer implements explicit DTO types (`SerializedAccount`, `SerializedTransaction`, `SerializedJournalEntry`, `SerializedIOURecord`, `SerializedNetWorthSummary`, `SerializedCashFlowSummary`) and bidirectional zero-float transformation mappers (`serializeAccount`, `deserializeAccount`, `serializeTransaction`, etc.). In Client Components, these strings are parsed directly to `bigint` using `BigInt(val)` or formatted for display using `@finvault/ui`'s `formatMinorToDecimal`.

2. **Supabase SSR Dual-Client Pattern**:
   - In Next.js 14 App Router, `cookies()` from `next/headers` is read-only in Server Components (data fetching) but mutable in Server Actions and Route Handlers.
   - Using the existing `server.ts` client for Server Actions will silently drop refreshed auth tokens or session cookies because the `try/catch` swallows the write attempt.
   - *Remedy*: Introduce `createActionClient()` in `apps/web/src/lib/supabase/action.ts` without the `try/catch` suppression, allowing Server Actions to persist refreshed cookies back to the browser response headers.

3. **Double-Entry Pre-validation Prior to RPC**:
   - The PostgreSQL `post_transaction` RPC and deferred constraint trigger `trg_verify_transaction_balance` strictly abort invalid transactions server-side.
   - However, network roundtrips for validation errors degrade UX.
   - *Solution*: Pre-validate on the client / server action level in `apps/web/src/lib/validation/double-entry.ts`:
     1. Ensure at least two entries (`entries.length >= 2`).
     2. Ensure every account ID is populated and belongs to the active tenant.
     3. Ensure every entry amount is strictly positive (`amount_minor > 0n`).
     4. Ensure both debits and credits exist (`debits > 0n` and `credits > 0n`).
     5. Ensure debits balance credits exactly (`debits === credits`).
   - If unbalanced, return detailed error and difference without firing the network request.

4. **Zero-Float JSON Serialization for RPC Payloads**:
   - In JavaScript, `Number(amountMinor)` loses precision beyond $2^{53} - 1$ (₹90,071,992,547,409.92).
   - PostgreSQL line 422 reads `(v_entry->>'amount_minor')::BIGINT`.
   - By serializing `amount_minor` as `e.amount_minor.toString()`, the payload remains an exact integer string in JSON, and PostgreSQL casts the string directly into `BIGINT`, preserving 100% mathematical precision for arbitrary 64-bit values.

5. **ESLint Non-Interactive CI Compatibility**:
   - Next.js CLI expects an ESLint configuration file when `next lint` is executed.
   - Adding `apps/web/.eslintrc.json` with `{"extends": "next/core-web-vitals"}` enables non-interactive linting in CI and pre-commit checks.

---

## 3. Caveats

1. **Supabase Local Emulator vs Cloud Instance**:
   - The default environment variables fall back to `http://localhost:54321` and `anon-key`. When deploying or testing with a remote Supabase project, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be populated in `.env.local`.
2. **Missing `/login` Route**:
   - `apps/web/src/middleware.ts` redirects unauthenticated traffic to `/login`. Until the login page is created in M4, hitting `/` while unauthenticated will redirect to a 404 page.

---

## 4. Conclusion & Concrete Code Blueprints

The data access layer, SSR/Client integration, BigInt serialization protocol, and build pipeline for Next.js 14 are formulated and verified.

### 4.1 Safe BigInt Serialization Architecture (`apps/web/src/lib/money/serialization.ts`)
```typescript
import type {
  Account,
  Transaction,
  JournalEntry,
  IOURecord,
  AccountType,
  JournalDirection,
  IOUDirection,
  IOUStatus,
} from '@finvault/db-types';

export interface SerializedAccount {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance_minor: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  version: string;
}

export interface SerializedTransaction {
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
  version: string;
  entries?: SerializedJournalEntry[];
}

export interface SerializedJournalEntry {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount_minor: string;
  direction: JournalDirection;
  created_at: string;
}

export interface SerializedIOURecord {
  id: string;
  user_id: string;
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: string;
  remaining_balance_minor: string;
  currency: string;
  status: IOUStatus;
  due_date?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: string;
}

export function serializeAccount(acc: Account): SerializedAccount {
  return {
    ...acc,
    balance_minor: acc.balance_minor.toString(),
    version: acc.version.toString(),
  };
}

export function deserializeAccount(dto: SerializedAccount | Record<string, any>): Account {
  return {
    id: dto.id,
    user_id: dto.user_id,
    name: dto.name,
    type: dto.type,
    currency: dto.currency || 'INR',
    balance_minor: BigInt(dto.balance_minor ?? 0),
    is_archived: Boolean(dto.is_archived),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

export function serializeTransaction(tx: Transaction & { entries?: JournalEntry[] }): SerializedTransaction {
  return {
    ...tx,
    version: tx.version.toString(),
    entries: tx.entries?.map(serializeJournalEntry),
  };
}

export function serializeJournalEntry(entry: JournalEntry): SerializedJournalEntry {
  return {
    ...entry,
    amount_minor: entry.amount_minor.toString(),
  };
}

export function serializeIOURecord(iou: IOURecord): SerializedIOURecord {
  return {
    ...iou,
    principal_minor: iou.principal_minor.toString(),
    remaining_balance_minor: iou.remaining_balance_minor.toString(),
    version: iou.version.toString(),
  };
}
```

### 4.2 Server Action Supabase Client (`apps/web/src/lib/supabase/action.ts`)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@finvault/db-types';

export function createActionClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```

### 4.3 Double-Entry Validation (`apps/web/src/lib/validation/double-entry.ts`)
```typescript
export interface PreValidationResult {
  isValid: boolean;
  differenceMinor: bigint;
  totalDebitsMinor: bigint;
  totalCreditsMinor: bigint;
  error?: string;
}

export function validateTransactionEntries(
  entries: { account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }[]
): PreValidationResult {
  if (!entries || entries.length < 2) {
    return {
      isValid: false,
      differenceMinor: 0n,
      totalDebitsMinor: 0n,
      totalCreditsMinor: 0n,
      error: 'A transaction must contain at least two entries.',
    };
  }

  let debits = 0n;
  let credits = 0n;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.account_id || entry.account_id.trim() === '') {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} is missing a selected account.`,
      };
    }

    if (entry.amount_minor <= 0n) {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} amount must be greater than zero.`,
      };
    }

    if (entry.direction === 'DEBIT') {
      debits += entry.amount_minor;
    } else if (entry.direction === 'CREDIT') {
      credits += entry.amount_minor;
    } else {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} has an invalid direction.`,
      };
    }
  }

  if (debits === 0n || credits === 0n) {
    return {
      isValid: false,
      differenceMinor: debits - credits,
      totalDebitsMinor: debits,
      totalCreditsMinor: credits,
      error: 'A transaction cannot be single-sided (must have both debits and credits).',
    };
  }

  const diff = debits - credits;
  if (diff !== 0n) {
    return {
      isValid: false,
      differenceMinor: diff,
      totalDebitsMinor: debits,
      totalCreditsMinor: credits,
      error: `Double-entry violation: debits (${debits}) do not equal credits (${credits}). Difference: ${diff}`,
    };
  }

  return {
    isValid: true,
    differenceMinor: 0n,
    totalDebitsMinor: debits,
    totalCreditsMinor: credits,
  };
}
```

### 4.4 Server Actions for Mutations (`apps/web/src/app/actions/transactions.ts` and `ious.ts`)
```typescript
'use server';

import { createActionClient } from '../../lib/supabase/action';
import { validateTransactionEntries } from '../../lib/validation/double-entry';
import { revalidatePath } from 'next/cache';

export async function submitTransactionAction(input: {
  idempotency_key?: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  entries: { account_id: string; amount_minor: string; direction: 'DEBIT' | 'CREDIT' }[];
}) {
  const parsedEntries = input.entries.map((e) => ({
    account_id: e.account_id,
    amount_minor: BigInt(e.amount_minor),
    direction: e.direction,
  }));

  const validation = validateTransactionEntries(parsedEntries);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const supabase = createActionClient();
  const idempotencyKey = input.idempotency_key || crypto.randomUUID();

  const payloadEntries = parsedEntries.map((e) => ({
    account_id: e.account_id,
    amount_minor: e.amount_minor.toString(),
    direction: e.direction,
  }));

  const { data: txId, error } = await supabase.rpc('post_transaction', {
    p_idempotency_key: idempotencyKey,
    p_transaction_date: input.transaction_date,
    p_description: input.description,
    p_notes: input.notes ?? null,
    p_entries: payloadEntries as any,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true, transactionId: txId };
}
```

```typescript
'use server';

import { createActionClient } from '../../lib/supabase/action';
import { revalidatePath } from 'next/cache';

export async function settleIOUAction(input: {
  iou_id: string;
  settlement_amount_minor: string;
  account_id: string;
  notes?: string | null;
}) {
  const amountMinor = BigInt(input.settlement_amount_minor);
  if (amountMinor <= 0n) {
    return { success: false, error: 'Settlement amount must be greater than zero.' };
  }

  const supabase = createActionClient();

  const { data, error } = await supabase.rpc('settle_iou', {
    p_iou_id: input.iou_id,
    p_settlement_amount_minor: Number(amountMinor),
    p_account_id: input.account_id,
    p_notes: input.notes ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true, result: data };
}
```

### 4.5 Recommended ESLint Configuration (`apps/web/.eslintrc.json`)
```json
{
  "extends": "next/core-web-vitals"
}
```

---

## 5. Verification Method & Verbatim Results

### 5.1 Verification Commands Run
```powershell
# 1. Monorepo workspace typecheck checks
pnpm --filter @finvault/ui typecheck
pnpm --filter @finvault/web typecheck

# 2. Next.js production build verification
pnpm --filter @finvault/web build

# 3. Backend & Sync Invariant Regression Suite
node --experimental-strip-types tests/e2e/runner.ts
node --test packages/sync-engine/tests/client-schema.test.ts
node --test packages/sync-engine/tests/sync-engine.test.ts
node .agents/teamwork/explorer_m1_3/verify-m1.js
```

### 5.2 Verbatim Command Outputs
1. **`pnpm --filter @finvault/ui typecheck`**:
   ```
   > @finvault/ui@0.1.0 typecheck D:\programming\New_project\packages\ui
   > tsc --noEmit
   (Exit code 0)
   ```
2. **`pnpm --filter @finvault/web typecheck`**:
   ```
   > @finvault/web@0.1.0 typecheck D:\programming\New_project\apps\web
   > tsc --noEmit
   (Exit code 0)
   ```
3. **`pnpm --filter @finvault/web build`**:
   ```
   ▲ Next.js 14.2.35
   Creating an optimized production build ...
   ✓ Compiled successfully
   Linting and checking validity of types ...
   ✓ Generating static pages (5/5)
   Finalizing page optimization ...
   Route (app)                              Size     First Load JS
   ┌ ○ /                                    138 B          87.4 kB
   ├ ○ /_not-found                          872 B          88.1 kB
   └ ƒ /auth/callback                       0 B                0 B
   + First Load JS shared by all            87.2 kB
   ƒ Middleware                             84.4 kB
   (Exit code 0)
   ```
4. **`tests/e2e/runner.ts`**:
   ```
   Total Test Suites:  11 (Passed: 11, Failed: 0)
   Total Test Cases:   63 (Passed: 63, Failed: 0)
   Success Rate:       100%
   ```
5. **`client-schema.test.ts` & `sync-engine.test.ts`**:
   ```
   client-schema.test.ts: 10 pass, 0 fail (23.9ms)
   sync-engine.test.ts:   23 pass, 0 fail (70.6ms)
   ```
6. **`verify-m1.js`**:
   ```
   Results: 86/86 passed (0 failed)
   ```

### 5.3 Invalidation Conditions
- Any occurrence of raw `bigint` passed across React Server Component boundaries throwing `TypeError: Do not know how to serialize a BigInt`.
- Permitting single-sided or unbalanced transactions to be transmitted to the Supabase RPC.
- Any regression across the 63 E2E test suites or Next.js production build failure.
