# Milestone 2 DB Types & TypeScript Interfaces — Investigation & Blueprint Report

**Agent:** Explorer 2 (`teamwork_explorer`)  
**State Folder:** `.agents/teamwork/explorer_m2_2/`  
**Target Milestone:** Milestone 2 (Supabase PostgreSQL Schema, Security, Triggers & Client SQLite Parity — DB Types & TypeScript Interfaces Track)  
**Date:** 2026-11-08  
**Reference Artifact:** `.agents/teamwork/explorer_m2_2/proposed_index.ts`

---

## Executive Summary

This investigation conducted a comprehensive code-level and schema-level verification of `@finvault/db-types` (`packages/db-types`) against the PostgreSQL 16 schema (`supabase/migrations/20261108000000_init_finvault_schema.sql`), the client SQLite schema (`packages/sync-engine/src/client-schema.sql`), the E2E invariant test harness (`tests/e2e/`), and the companion specification mining report from Explorer 1 (`.agents/teamwork/explorer_m2_1/handoff.md`).

Current compilation (`tsc --noEmit --project packages/db-types/tsconfig.json`) and declaration emit (`tsc --emitDeclarationOnly`) succeed with 0 errors. However, key interface contracts and DTOs required by Milestone 2 are currently missing or incomplete:
1. **Missing Enums / Union Types:** `JournalDirection` (currently only named `EntryDirection`), `SyncOperation` (`'INSERT' | 'UPDATE' | 'DELETE'`), `SyncStatus` (`'PENDING' | 'IN_FLIGHT' | 'PROCESSING' | 'FAILED' | 'APPLIED' | 'SYNCED'`), and `AuditAction` (`'INSERT' | 'UPDATE' | 'DELETE'`).
2. **Missing Core Entities:** `AuditLog` (PostgreSQL `audit_logs` table) and `SyncQueueItem` (client SQLite `sync_queue` table).
3. **Missing DTOs / Mutation Payloads:** `CreateTransactionDTO`, `CreateJournalEntryDTO`, `CreateAccountDTO`, `CreateIOUDTO`, `SettleIOUDTO`, `CreateSinkingFundDTO`, and `SyncMutationDTO`.
4. **Missing PostgREST / Supabase Database Generic:** The canonical `Database` interface generic used by `@supabase/supabase-js` (`createClient<Database>()`) is absent.

A drop-in blueprint (`proposed_index.ts`) has been authored, verified with `tsc --noEmit`, tested against stress test regexes, and packaged in this report for immediate worker execution.

---

## 1. Observation

Direct examination of workspace files, existing DDL migrations, documentation, test suites, and compiler tools revealed the following direct observations:

### 1.1 Existing Package Configuration

- **`packages/db-types/package.json`** (`lines 1-22`):
  ```json
  {
    "name": "@finvault/db-types",
    "version": "0.1.0",
    "description": "Shared TypeScript definitions and interfaces for FinVault database and schemas",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
      ".": {
        "types": "./src/index.ts",
        "import": "./src/index.ts",
        "default": "./src/index.ts"
      }
    },
    "scripts": {
      "build": "tsc --emitDeclarationOnly",
      "typecheck": "tsc --noEmit",
      "lint": "eslint src --ext .ts"
    },
    "devDependencies": {
      "typescript": "^5.4.5"
    }
  }
  ```
  *Observation:* Zero runtime dependencies. TypeScript 5.4.5 in `devDependencies`. The package exports directly to `./src/index.ts` for monorepo consumers and emits declarations to `./dist`.

- **`packages/db-types/tsconfig.json`** (`lines 1-8`):
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "rootDir": "./src",
      "outDir": "./dist"
    },
    "include": ["src/**/*"]
  }
  ```
  *Observation:* Extends root `tsconfig.base.json` with strict typechecking (`"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`, target `ES2022`, module `ESNext`, moduleResolution `Bundler`).

### 1.2 Existing Type Definitions in `packages/db-types/src/index.ts`

- Current file has 103 lines.
- Defines:
  - `AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'` (line 7)
  - `EntryDirection = 'DEBIT' | 'CREDIT'` (line 8)
  - `IOUDirection = 'LENT' | 'BORROWED'` (line 9)
  - `IOUStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF'` (line 10)
  - `Account` interface (lines 12-23) with `balance_minor: bigint`, `version: bigint`
  - `Transaction` interface (lines 25-37) with `version: bigint`
  - `JournalEntry` interface (lines 39-47) with `amount_minor: bigint`, `direction: EntryDirection`
  - `IOURecord` interface (lines 49-65) with `principal_minor: bigint`, `remaining_balance_minor: bigint`
  - `SinkingFund` interface (lines 67-79) with `target_amount_minor: bigint`, `allocated_amount_minor: bigint`
  - `NewJournalEntryPayload` (lines 81-85)
  - `NewTransactionPayload` (lines 87-93)
  - `NewIOUPayload` (lines 95-103)

### 1.3 Downstream Consumption Analysis

1. **`packages/sync-engine/src/index.ts`** (`lines 1-5`):
   ```typescript
   import {
     Account,
     Transaction,
     NewTransactionPayload,
   } from '@finvault/db-types';
   ```
   *Observation:* Relies on `Account`, `Transaction`, and `NewTransactionPayload`.
2. **`packages/sync-engine/src/index.ts`** (`lines 10-19`):
   ```typescript
   export interface SyncMutation {
     id: string;
     table_name: string;
     record_id: string;
     operation: 'INSERT' | 'UPDATE' | 'DELETE';
     payload: string;
     status: 'PENDING' | 'SYNCED' | 'FAILED';
     retry_count: number;
     created_at: string;
   }
   ```
   *Observation:* Sync engine defines its own `SyncMutation` interface locally because `packages/db-types` lacked `SyncOperation`, `SyncStatus`, and `SyncQueueItem`.
3. **`apps/web/package.json` and `apps/mobile/package.json`**:
   Both list `"@finvault/db-types": "workspace:*"` and `"@supabase/supabase-js": "^2.42.0"`.

### 1.4 Test Harness & Invariant Assertions

1. **`tests/stress/m1-invariant-stress.ts`** (`lines 380-391`):
   Direct regex string matching on `packages/db-types/src/index.ts`:
   - `balance_minor: bigint`
   - `amount_minor: bigint`
   - `principal_minor: bigint`
   - `remaining_balance_minor: bigint`
   - `target_amount_minor: bigint`
   - `allocated_amount_minor: bigint`
   Execution command: `node --experimental-strip-types tests/stress/m1-invariant-stress.ts` passed 42/42 tests.
2. **`tests/e2e/runner.ts`**:
   Execution command: `node --experimental-strip-types tests/e2e/runner.ts` passed 63/63 tests across Tiers 1-4.
3. **TypeScript Compiler Checks**:
   - `npx tsc --noEmit --project packages/db-types/tsconfig.json` exited with returncode 0.
   - `npx tsc --emitDeclarationOnly --project packages/db-types/tsconfig.json` exited with returncode 0, emitting `dist/index.d.ts` and `dist/index.d.ts.map`.

### 1.5 Database Schema Parity Gap Analysis

| Entity / Schema Feature | PostgreSQL Schema (`supabase/migrations/`) | Client SQLite Schema (`sync-engine`) | Current `packages/db-types` | Gap Identified |
|---|---|---|---|---|
| `accounts` | `accounts` table with `BIGINT balance_minor` | `accounts` table with `INTEGER balance_minor` | `Account` interface (`balance_minor: bigint`) | Aligned. |
| `transactions` | `transactions` table with UUID `idempotency_key` | `transactions` table with TEXT `idempotency_key` | `Transaction` interface | Aligned. |
| `journal_entries` | `journal_entries` table with `entry_direction` | `journal_entries` table with `TEXT CHECK ('DEBIT', 'CREDIT')` | `JournalEntry` interface | Uses `direction: EntryDirection`. Needs `JournalDirection` alias. |
| `iou_records` | `iou_records` table with `principal_minor`, `remaining_balance_minor` | `iou_records` table with identical minor unit columns | `IOURecord` interface | Aligned. |
| `sinking_funds` | `sinking_funds` table with `target_amount_minor`, `allocated_amount_minor` | `sinking_funds` table with identical minor unit columns | `SinkingFund` interface | Aligned. |
| `audit_logs` | Identified as required M2 table (`audit_logs`) in Dispatch and Explorer 1 blueprint | Mirror / telemetry table | **MISSING** | Missing `AuditLog` interface and `AuditAction` enum. |
| `sync_queue` | N/A (Server has RPC/mutations) | `sync_queue` table with `operation`, `status`, `payload` | **MISSING** | Missing `SyncQueueItem`, `SyncOperation`, `SyncStatus`. |
| Payloads / DTOs | RPC `post_transaction(p_entries)` | `enqueueMutation` payload | `NewTransactionPayload`, `NewJournalEntryPayload`, `NewIOUPayload` | Missing canonical `CreateTransactionDTO`, `CreateJournalEntryDTO`, `CreateAccountDTO`, `CreateIOUDTO`, `SettleIOUDTO`, `SyncMutationDTO`. |
| PostgREST Database Generic | PostgREST auto-generated REST schema | N/A | **MISSING** | Missing `Database` interface generic for `@supabase/supabase-js`. |

---

## 2. Logic Chain

From the observations above, the following logical steps deduce the complete specification for `@finvault/db-types`:

### Step 2.1: Strict `bigint` for Monetary Units & Stress-Test Preservations
- **Fact:** Observation 1.4 confirms that `tests/stress/m1-invariant-stress.ts` lines 380-391 enforce exact character substrings for the six monetary properties typed as `bigint`.
- **Reasoning:** Any replacement or enhancement of `packages/db-types/src/index.ts` must retain `balance_minor: bigint`, `amount_minor: bigint`, `principal_minor: bigint`, `remaining_balance_minor: bigint`, `target_amount_minor: bigint`, and `allocated_amount_minor: bigint` without altering property names or casing.
- **Deduction:** All domain models and new creation DTOs (e.g. `CreateJournalEntryDTO.amount_minor`, `CreateIOUDTO.principal_minor`, `SettleIOUDTO.amount_minor`) must strictly type minor units as native `bigint`.

### Step 2.2: Harmonization of Enum / Union Types
- **Fact:** The dispatch prompt specifies:
  - `JournalDirection ('DEBIT' | 'CREDIT')`
  - `SyncOperation ('INSERT' | 'UPDATE' | 'DELETE')`
  - `SyncStatus ('PENDING' | 'IN_FLIGHT' | 'SYNCED' | 'FAILED')`
  Meanwhile, current `index.ts` defines `EntryDirection = 'DEBIT' | 'CREDIT'`.
- **Reasoning:** Renaming `EntryDirection` to `JournalDirection` without an alias would break existing imports in tests (`tests/e2e/infra/ledger-oracle.ts:10`) and existing implementations.
- **Deduction:** Define `JournalDirection = 'DEBIT' | 'CREDIT'` and export `export type EntryDirection = JournalDirection;` as a backwards-compatible alias. Define `SyncOperation`, `SyncStatus` (including `'PROCESSING' | 'APPLIED'` as used in `tests/e2e/infra/sqlite-harness.ts`), and `AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'`.

### Step 2.3: Core Domain Models for Missing Tables (`AuditLog` and `SyncQueueItem`)
- **Fact:** Explorer 1 established the DDL for `audit_logs` (`id UUID`, `user_id UUID`, `entity_type VARCHAR(50)`, `entity_id UUID`, `action audit_action`, `old_state JSONB`, `new_state JSONB`, `client_timestamp TIMESTAMPTZ`, `created_at TIMESTAMPTZ`). Client SQLite defines `sync_queue` (`id TEXT`, `table_name TEXT`, `record_id TEXT`, `operation TEXT`, `payload TEXT`, `created_at TEXT`, `status TEXT`, `retry_count INTEGER`).
- **Reasoning:** Full monorepo type safety across `apps/web`, `apps/mobile`, and `packages/sync-engine` requires canonical interfaces for these two tables.
- **Deduction:**
  1. Add `AuditLog` interface supporting `entity_type`, `entity_id`, `action`, `old_state`, `new_state`, `client_timestamp`, `created_at`, plus optional compatibility aliases (`table_name`, `record_id`, `old_data`, `new_data`).
  2. Add `SyncQueueItem` interface matching SQLite `sync_queue` with `operation: SyncOperation`, `status: SyncStatus`, and compatibility aliases (`entity_type`, `entity_id`, `timestamp`). Also export `export type SyncMutation = SyncQueueItem;` to satisfy `packages/sync-engine`.

### Step 2.4: Standardizing Mutation Payloads and DTOs
- **Fact:** The dispatch specifies canonical DTO names: `CreateTransactionDTO`, `CreateJournalEntryDTO`, `CreateAccountDTO`, `CreateIOUDTO`, `SettleIOUDTO`, `SyncMutationDTO`. Existing code in `packages/sync-engine` imports `NewTransactionPayload`.
- **Reasoning:** In monorepos, introducing canonical names while aliasing existing payload types provides non-breaking upgrades.
- **Deduction:** Implement:
  - `CreateJournalEntryDTO` (`account_id`, `amount_minor: bigint`, `direction: JournalDirection`) and alias `export type NewJournalEntryPayload = CreateJournalEntryDTO;`
  - `CreateTransactionDTO` (`idempotency_key`, `transaction_date`, `description`, `notes?`, `entries: CreateJournalEntryDTO[]`) and alias `export type NewTransactionPayload = CreateTransactionDTO;`
  - `CreateAccountDTO` (`name`, `type`, `currency?`, `balance_minor?: bigint`)
  - `CreateIOUDTO` (`counterparty_name`, `counterparty_contact?`, `direction`, `principal_minor: bigint`, `currency?`, `due_date?`, `notes?`) and alias `export type NewIOUPayload = CreateIOUDTO;`
  - `SettleIOUDTO` (`iou_id`, `amount_minor: bigint`, `account_id`, `settlement_date?`, `notes?`)
  - `CreateSinkingFundDTO` (`name`, `target_amount_minor: bigint`, `allocated_amount_minor?: bigint`, `target_date?`, `currency?`)
  - `SyncMutationDTO` (`id?`, `table_name`, `record_id`, `operation: SyncOperation`, `payload: string`, `status?`, `retry_count?`, `created_at?`, `entity_type?`, `entity_id?`, `timestamp?`)

### Step 2.5: PostgREST / Supabase `Database` Generic Interface
- **Fact:** Client applications (`apps/web` and `apps/mobile`) instantiate Supabase clients via `createClient<Database>(supabaseUrl, supabaseKey)`.
- **Reasoning:** If `Database` is not provided by `@finvault/db-types`, each application must write manual typings or operate without typed PostgREST queries, losing compile-time query validation.
- **Deduction:** Provide a structural `Database` generic mapping `public.Tables` (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`, `audit_logs`), `public.Views`, `public.Functions` (`post_transaction`), and `public.Enums`.
- **Zero Runtime Overhead Guarantee:** The `Database` definition requires only pure TypeScript types (`Json`, interfaces) and zero runtime imports, keeping `@finvault/db-types` 100% dependency-free and universally consumable across Web, React Native, Node, and Deno.

---

## 3. Caveats

1. **PostgREST JSON Serialization vs Native BigInt Domain Model:**
   In JSON transmission, standard JSON does not support native `BigInt` literals. PostgREST over HTTP serializes `BIGINT` columns as JavaScript `number` (or `string` if configured). Therefore, in the `Database` interface (which describes raw HTTP PostgREST payloads), `Row` types represent minor units as `number`, while `Insert` and `Update` types accept `number | bigint`. In contrast, FinVault's core domain models (`Account`, `JournalEntry`, etc.) enforce native `bigint`. Consumers parsing PostgREST responses should cast minor units using `BigInt(row.amount_minor)`.
2. **Backwards Compatibility with M1 Consumers:**
   `packages/sync-engine/src/index.ts` currently imports `NewTransactionPayload`. If the worker replaces `NewTransactionPayload` without providing the type alias `export type NewTransactionPayload = CreateTransactionDTO;`, `packages/sync-engine` will fail to compile. The blueprint guarantees 100% backward compatibility.
3. **No Project File Modification Constraint:**
   Explorer 2 has operated strictly in read-only mode regarding source files. All proposals are stored in `.agents/teamwork/explorer_m2_2/proposed_index.ts` and detailed below for Worker 2 to implement.

---

## 4. Conclusion & Concrete Implementation Blueprint

The existing `@finvault/db-types` package is functionally sound but requires the expansion of its type contracts to achieve 100% parity with Milestone 2 database schema requirements, RPC interfaces, and offline sync engines.

The complete replacement blueprint for `packages/db-types/src/index.ts` has been written, tested, and validated in `.agents/teamwork/explorer_m2_2/proposed_index.ts`.

### 4.1 Implementation Blueprint for Worker: `packages/db-types/src/index.ts`

```typescript
/**
 * FinVault Shared Database Types & Canonical TypeScript Interfaces
 *
 * Invariant: All monetary amounts are stored as BIGINT minor units (paise/cents).
 * No floating point currency numbers are permitted.
 *
 * Architecture alignment:
 * - PostgreSQL 16 (Supabase cloud migration with RLS & double-entry triggers)
 * - SQLite 3.35+ (client offline-first local storage & sync queue outbox)
 * - @supabase/supabase-js typed Database generic
 */

// ============================================================================
// 1. Core Enums & Union Types
// ============================================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type JournalDirection = 'DEBIT' | 'CREDIT';
export type EntryDirection = JournalDirection; // Backwards-compatible alias

export type IOUDirection = 'LENT' | 'BORROWED';
export type IOUStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'PENDING' | 'IN_FLIGHT' | 'PROCESSING' | 'FAILED' | 'APPLIED' | 'SYNCED';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

// ============================================================================
// 2. Strict Domain Model Interfaces (Native `bigint` Minor Units)
// ============================================================================

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
  direction: JournalDirection;
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

export interface AuditLog {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction | string;
  old_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  client_timestamp?: string | null;
  created_at: string;
  // Alternative aliases for PostgREST & sync engine flexibility
  table_name?: string;
  record_id?: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  status: SyncStatus;
  retry_count: number;
  created_at: string;
  // Parity alias columns for test harness & oracle compatibility
  entity_type?: string | null;
  entity_id?: string | null;
  timestamp?: string | null;
}

// Backwards-compatible alias for sync-engine
export type SyncMutation = SyncQueueItem;

// ============================================================================
// 3. Mutation Payloads & DTOs
// ============================================================================

export interface CreateAccountDTO {
  name: string;
  type: AccountType;
  currency?: string;
  balance_minor?: bigint;
}

export interface CreateJournalEntryDTO {
  account_id: string;
  amount_minor: bigint;
  direction: JournalDirection;
}
export type NewJournalEntryPayload = CreateJournalEntryDTO; // Backwards-compatible alias

export interface CreateTransactionDTO {
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  entries: CreateJournalEntryDTO[];
}
export type NewTransactionPayload = CreateTransactionDTO; // Backwards-compatible alias

export interface CreateIOUDTO {
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: bigint;
  currency?: string;
  due_date?: string | null;
  notes?: string | null;
}
export type NewIOUPayload = CreateIOUDTO; // Backwards-compatible alias

export interface SettleIOUDTO {
  iou_id: string;
  amount_minor: bigint;
  account_id: string;
  settlement_date?: string;
  notes?: string | null;
}

export interface CreateSinkingFundDTO {
  name: string;
  target_amount_minor: bigint;
  allocated_amount_minor?: bigint;
  target_date?: string | null;
  currency?: string;
}

export interface SyncMutationDTO {
  id?: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  status?: SyncStatus;
  retry_count?: number;
  created_at?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  timestamp?: string | null;
}

// ============================================================================
// 4. Supabase Database Generic Type Definition (@supabase/supabase-js)
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          currency: string;
          balance_minor: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          type: AccountType;
          currency?: string;
          balance_minor?: number | bigint;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: AccountType;
          currency?: string;
          balance_minor?: number | bigint;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          idempotency_key: string;
          transaction_date: string;
          description: string;
          notes: string | null;
          is_reconciled: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          idempotency_key: string;
          transaction_date: string;
          description: string;
          notes?: string | null;
          is_reconciled?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          idempotency_key?: string;
          transaction_date?: string;
          description?: string;
          notes?: string | null;
          is_reconciled?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          transaction_id: string;
          account_id: string;
          amount_minor: number;
          direction: JournalDirection;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          transaction_id: string;
          account_id: string;
          amount_minor: number | bigint;
          direction: JournalDirection;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          transaction_id?: string;
          account_id?: string;
          amount_minor?: number | bigint;
          direction?: JournalDirection;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journal_entries_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journal_entries_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journal_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      iou_records: {
        Row: {
          id: string;
          user_id: string;
          counterparty_name: string;
          counterparty_contact: string | null;
          direction: IOUDirection;
          principal_minor: number;
          remaining_balance_minor: number;
          currency: string;
          status: IOUStatus;
          due_date: string | null;
          notes: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          counterparty_name: string;
          counterparty_contact?: string | null;
          direction: IOUDirection;
          principal_minor: number | bigint;
          remaining_balance_minor?: number | bigint;
          currency?: string;
          status?: IOUStatus;
          due_date?: string | null;
          notes?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          counterparty_name?: string;
          counterparty_contact?: string | null;
          direction?: IOUDirection;
          principal_minor?: number | bigint;
          remaining_balance_minor?: number | bigint;
          currency?: string;
          status?: IOUStatus;
          due_date?: string | null;
          notes?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'iou_records_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      sinking_funds: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount_minor: number;
          allocated_amount_minor: number;
          target_date: string | null;
          currency: string;
          is_completed: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          target_amount_minor: number | bigint;
          allocated_amount_minor?: number | bigint;
          target_date?: string | null;
          currency?: string;
          is_completed?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_amount_minor?: number | bigint;
          allocated_amount_minor?: number | bigint;
          target_date?: string | null;
          currency?: string;
          is_completed?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'sinking_funds_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          old_state: Json | null;
          new_state: Json | null;
          client_timestamp: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          old_state?: Json | null;
          new_state?: Json | null;
          client_timestamp?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: AuditAction;
          old_state?: Json | null;
          new_state?: Json | null;
          client_timestamp?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      post_transaction: {
        Args: {
          p_user_id?: string | null;
          p_idempotency_key: string;
          p_transaction_date?: string;
          p_date?: string;
          p_description?: string;
          p_notes?: string | null;
          p_entries: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      account_type: AccountType;
      entry_direction: JournalDirection;
      iou_direction: IOUDirection;
      iou_status: IOUStatus;
      audit_action: AuditAction;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ============================================================================
// 5. Utility Type Helpers
// ============================================================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
```

---

## 5. Verification Method

To independently verify the implementation, execute the following commands in the workspace root:

### 5.1 Typecheck packages/db-types
```powershell
npx tsc --noEmit --project packages/db-types/tsconfig.json
```
**Expected Result:** Command terminates with exit code 0 and no error messages.

### 5.2 Build / Declaration Emit
```powershell
npx tsc --emitDeclarationOnly --project packages/db-types/tsconfig.json
```
**Expected Result:** Emits `dist/index.d.ts` and `dist/index.d.ts.map` with exit code 0.

### 5.3 Monorepo Dependent Packages Typecheck
```powershell
npx tsc --noEmit --project packages/sync-engine/tsconfig.json
npx tsc --noEmit --project apps/web/tsconfig.json
npx tsc --noEmit --project apps/mobile/tsconfig.json
```
**Expected Result:** All packages compile cleanly without type resolution or interface mismatch errors.

### 5.4 E2E Invariant Test Suite Execution
```powershell
node --experimental-strip-types tests/e2e/runner.ts
```
**Expected Result:** 63/63 test cases pass across all 4 tiers with 100% success rate.

### 5.5 Stress Test Invariant Assertion
```powershell
node --experimental-strip-types tests/stress/m1-invariant-stress.ts
```
**Expected Result:** 42/42 tests pass, explicitly confirming all six `*_minor: bigint` assertions in `packages/db-types/src/index.ts`.

### 5.6 Invalidation Conditions
The verification is invalidated if:
1. Any monetary field is modified to `number` or `string` in domain models.
2. An existing type alias (`NewTransactionPayload`, `EntryDirection`) is removed, causing consumer compile errors.
3. The `Database` generic structure breaks Supabase client type inferences.
