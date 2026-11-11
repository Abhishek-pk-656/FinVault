# Data Access Layer & Supabase SSR Integration Blueprint

## 1. Executive Architecture Summary
FinVault Web Cockpit runs on **Next.js 14+ App Router** with a dual data-access topology:
1. **Server Components (RSC) / Server Actions**: Direct authenticated queries via `@supabase/ssr` `createServerClient` reading auth cookies, fetching data with zero client-side waterfall, and executing transactional mutations.
2. **Client Components ('use client')**: Interactive components consuming serialized DTOs from Server Components, invoking Server Actions or `@supabase/ssr` `createBrowserClient` with optimistic UI updates and real-time Supabase subscriptions.

---

## 2. Invariant Protection: Safe BigInt Serialization
Next.js React Server Components (RSC) Flight protocol serializes props to JSON. Passing a native JavaScript `bigint` (e.g. `150000n`) directly across the Server-to-Client boundary throws:
```
TypeError: Do not know how to serialize a BigInt
```
To satisfy **Financial Ledger Rule 01 (Zero Floating-Point Money)** while preserving full 64-bit minor integer precision across boundaries, all monetary amounts are transferred as **string-encoded integer minor units** (e.g. `"150000"` for 1500.00).

### 2.1 Serialization Types & Utilities (`apps/web/src/lib/money/serialization.ts`)

```typescript
import type {
  Account,
  Transaction,
  JournalEntry,
  IOURecord,
  SinkingFund,
  AccountType,
  JournalDirection,
  IOUDirection,
  IOUStatus,
} from '@finvault/db-types';

/**
 * Serialized DTO representations for Client Components
 * All BigInt minor units and version counters are serialized to string.
 */
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

export interface SerializedNetWorthSummary {
  totalAssetsMinor: string;
  totalLiabilitiesMinor: string;
  netWorthMinor: string;
  safeToSpendMinor: string;
  currency: string;
}

export interface SerializedCashFlowSummary {
  inflowsMinor: string;
  outflowsMinor: string;
  netSavingsMinor: string;
  savingsRateBps: number; // Basis points (e.g. 2500 = 25.00%)
  period: string; // YYYY-MM
}

// ============================================================================
// Serialization / Deserialization Mappers
// ============================================================================

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

export function deserializeTransaction(dto: SerializedTransaction): Transaction {
  return {
    id: dto.id,
    user_id: dto.user_id,
    idempotency_key: dto.idempotency_key,
    transaction_date: dto.transaction_date,
    description: dto.description,
    notes: dto.notes ?? null,
    is_reconciled: Boolean(dto.is_reconciled),
    is_deleted: Boolean(dto.is_deleted),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

export function serializeJournalEntry(entry: JournalEntry): SerializedJournalEntry {
  return {
    ...entry,
    amount_minor: entry.amount_minor.toString(),
  };
}

export function deserializeJournalEntry(dto: SerializedJournalEntry | Record<string, any>): JournalEntry {
  return {
    id: dto.id,
    user_id: dto.user_id,
    transaction_id: dto.transaction_id,
    account_id: dto.account_id,
    amount_minor: BigInt(dto.amount_minor ?? 0),
    direction: dto.direction,
    created_at: dto.created_at,
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

export function deserializeIOURecord(dto: SerializedIOURecord | Record<string, any>): IOURecord {
  return {
    id: dto.id,
    user_id: dto.user_id,
    counterparty_name: dto.counterparty_name,
    counterparty_contact: dto.counterparty_contact ?? null,
    direction: dto.direction,
    principal_minor: BigInt(dto.principal_minor ?? 0),
    remaining_balance_minor: BigInt(dto.remaining_balance_minor ?? 0),
    currency: dto.currency || 'INR',
    status: dto.status,
    due_date: dto.due_date ?? null,
    notes: dto.notes ?? null,
    is_deleted: Boolean(dto.is_deleted),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

/**
 * Universal deep serializer converting any BigInt properties to strings
 */
export function deepSerializeBigInt<T>(input: T): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(deepSerializeBigInt);
  if (typeof input === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      res[k] = deepSerializeBigInt(v);
    }
    return res;
  }
  return input;
}
```

---

## 3. Supabase SSR Client & Server Integration

### 3.1 Browser Client (`apps/web/src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@finvault/db-types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key'
  );
}
```

### 3.2 Server Component Client (`apps/web/src/lib/supabase/server.ts`)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@finvault/db-types';

export function createClient() {
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
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Can be ignored if called from Server Component (read-only cookie store)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Can be ignored if called from Server Component
          }
        },
      },
    }
  );
}
```

### 3.3 Server Action Client (`apps/web/src/lib/supabase/action.ts`)
In Next.js 14 Server Actions, cookie mutations are permissible. This dedicated action client ensures session refresh headers and auth cookies propagate cleanly:
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

---

## 4. Server-Side Data Access Services (`apps/web/src/lib/services/`)

### 4.1 Accounts Service (`apps/web/src/lib/services/accounts.ts`)
```typescript
import { createClient } from '../supabase/server';
import { serializeAccount, type SerializedAccount } from '../money/serialization';
import type { Account } from '@finvault/db-types';

export async function fetchAccounts(): Promise<SerializedAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_archived', false)
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching accounts:', error);
    throw new Error(`Failed to fetch accounts: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...row,
    balance_minor: row.balance_minor.toString(),
    version: row.version.toString(),
  }));
}

export async function fetchNetWorthSummary(): Promise<{
  totalAssetsMinor: string;
  totalLiabilitiesMinor: string;
  netWorthMinor: string;
  safeToSpendMinor: string;
}> {
  const accounts = await fetchAccounts();

  let totalAssets = 0n;
  let totalLiabilities = 0n;
  let safeToSpend = 0n;

  for (const acc of accounts) {
    const bal = BigInt(acc.balance_minor);
    if (acc.type === 'ASSET') {
      totalAssets += bal;
      const lower = acc.name.toLowerCase();
      if (lower.includes('cash') || lower.includes('bank') || lower.includes('checking') || lower.includes('wallet')) {
        safeToSpend += bal;
      }
    } else if (acc.type === 'LIABILITY') {
      totalLiabilities += bal;
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssetsMinor: totalAssets.toString(),
    totalLiabilitiesMinor: totalLiabilities.toString(),
    netWorthMinor: netWorth.toString(),
    safeToSpendMinor: safeToSpend.toString(),
  };
}
```

### 4.2 Transactions Service (`apps/web/src/lib/services/transactions.ts`)
```typescript
import { createClient } from '../supabase/server';
import type { SerializedTransaction } from '../money/serialization';

export async function fetchRecentTransactions(limit: number = 20): Promise<SerializedTransaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      journal_entries (
        id,
        user_id,
        transaction_id,
        account_id,
        amount_minor,
        direction,
        created_at
      )
    `)
    .eq('is_deleted', false)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching transactions:', error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return (data || []).map((tx: any) => ({
    ...tx,
    version: tx.version.toString(),
    entries: (tx.journal_entries || []).map((je: any) => ({
      ...je,
      amount_minor: je.amount_minor.toString(),
    })),
  }));
}
```

### 4.3 IOU Records Service (`apps/web/src/lib/services/ious.ts`)
```typescript
import { createClient } from '../supabase/server';
import type { SerializedIOURecord } from '../money/serialization';

export async function fetchActiveIOUs(): Promise<SerializedIOURecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('iou_records')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching IOUs:', error);
    throw new Error(`Failed to fetch IOUs: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...row,
    principal_minor: row.principal_minor.toString(),
    remaining_balance_minor: row.remaining_balance_minor.toString(),
    version: row.version.toString(),
  }));
}
```

---

## 5. Transaction Submission & Double-Entry Pre-validation

### 5.1 Pre-validation Logic (`apps/web/src/lib/validation/double-entry.ts`)
Before invoking the backend RPC, client forms and server actions run strict pre-validation:
```typescript
import type { CreateJournalEntryDTO } from '@finvault/db-types';

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

### 5.2 Server Action for Transaction Submission (`apps/web/src/app/actions/transactions.ts`)
```typescript
'use server';

import { createActionClient } from '../../lib/supabase/action';
import { validateTransactionEntries } from '../../lib/validation/double-entry';
import { revalidatePath } from 'next/cache';

export interface SubmitTransactionInput {
  idempotency_key?: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  entries: {
    account_id: string;
    amount_minor: string; // String BigInt from client
    direction: 'DEBIT' | 'CREDIT';
  }[];
}

export async function submitTransactionAction(input: SubmitTransactionInput) {
  // 1. Parse BigInt entries
  const parsedEntries = input.entries.map((e) => ({
    account_id: e.account_id,
    amount_minor: BigInt(e.amount_minor),
    direction: e.direction,
  }));

  // 2. Pre-validate double-entry
  const validation = validateTransactionEntries(parsedEntries);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  // 3. Invoke Supabase RPC post_transaction
  const supabase = createActionClient();
  const idempotencyKey = input.idempotency_key || crypto.randomUUID();

  // Format entries for Postgres JSONB: pass amounts as strings or numbers safely
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
    console.error('post_transaction RPC error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/transactions');
  return { success: true, transactionId: txId };
}
```

---

## 6. IOU Settlement Handler & RPC Invocation

### 6.1 Server Action for IOU Settlement (`apps/web/src/app/actions/ious.ts`)
```typescript
'use server';

import { createActionClient } from '../../lib/supabase/action';
import { revalidatePath } from 'next/cache';

export interface SettleIOUInput {
  iou_id: string;
  settlement_amount_minor: string; // String BigInt from client
  account_id: string; // Cash or Bank account UUID
  notes?: string | null;
}

export async function settleIOUAction(input: SettleIOUInput) {
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
    console.error('settle_iou RPC error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/ious');
  return { success: true, result: data };
}
```

---

## 7. Client Hooks & Realtime Subscriptions (`apps/web/src/lib/hooks/`)

### 7.1 Realtime Balance Hook (`apps/web/src/lib/hooks/useRealtimeSync.ts`)
Listens to PostgreSQL changes on `transactions`, `accounts`, and `iou_records` using Supabase Realtime Channels, triggering optimistic or cached refetches:
```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../supabase/client';

export function useRealtimeSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('cockpit-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iou_records' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);
}
```
