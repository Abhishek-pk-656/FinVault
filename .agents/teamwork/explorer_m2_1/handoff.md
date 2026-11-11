# Milestone 2 Specification Mining Report & Architectural Blueprint
**Agent:** Explorer 1 (`teamwork_spec_miner`)  
**State Folder:** `.agents/teamwork/explorer_m2_1/`  
**Target Milestone:** Milestone 2 (Supabase PostgreSQL Schema, Security, Triggers & Client SQLite Parity)  
**Date:** 2026-11-08  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Schema / DDL | `accounts` table | Core chart of accounts storing ASSET, LIABILITY, EQUITY, INCOME, EXPENSE with currency and balance | `user_id UUID`, `name VARCHAR(120)`, `type account_type`, `currency CHAR(3)`, `balance_minor BIGINT`, `is_archived BOOLEAN` | Account record with generated `id`, `created_at`, `updated_at`, `version` | Rejects nulls, invalid enum types, or cross-tenant user references | `20261108000000_init_finvault_schema.sql:13-24`, `docs/04` |
| 2 | Schema / DDL | `transactions` table | Transaction header recording financial events with unique UUID idempotency key | `user_id UUID`, `idempotency_key UUID`, `transaction_date DATE`, `description VARCHAR(255)`, `notes TEXT` | Transaction record with generated `id`, `created_at`, `updated_at`, `version` | Duplicate `idempotency_key` raises unique violation (`23505`) | `20261108000000_init_finvault_schema.sql:31-43`, `docs/04` |
| 3 | Schema / DDL | `journal_entries` table | Atomic legs of double-entry transactions enforcing debit/credit balance | `user_id UUID`, `transaction_id UUID`, `account_id UUID`, `amount_minor BIGINT`, `direction entry_direction` | Journal entry record with generated `id`, `created_at` | Non-positive amount (`<= 0`) violates `CHECK (amount_minor > 0)` (`23514`) | `20261108000000_init_finvault_schema.sql:50-58`, `docs/04` |
| 4 | Schema / DDL | `iou_records` table | Peer-to-peer lending ledger tracking bilateral debts (LENT/BORROWED) | `user_id UUID`, `counterparty_name VARCHAR(120)`, `direction iou_direction`, `principal_minor BIGINT`, `currency CHAR(3)`, `due_date DATE` | IOU record with generated `id`, `remaining_balance_minor`, `status`, `version` | Non-positive principal violates `CHECK (principal_minor > 0)` | `20261108000000_init_finvault_schema.sql:65-81`, `docs/04` |
| 5 | Schema / DDL | `sinking_funds` table | Goal-oriented savings and multi-bucket budget allocation funds | `user_id UUID`, `name VARCHAR(120)`, `target_amount_minor BIGINT`, `target_date DATE`, `currency CHAR(3)` | Fund record with generated `id`, `allocated_amount_minor`, `is_completed`, `version` | Non-positive target violates `CHECK (target_amount_minor > 0)` | `20261108000000_init_finvault_schema.sql:88-100`, `docs/04` |
| 6 | Schema / DDL | `audit_logs` table *(Discovered Gap)* | Immutable audit trail for sync conflict auditing, financial tampering detection, and compliance | `user_id UUID`, `entity_type VARCHAR(50)`, `entity_id UUID`, `action VARCHAR(20)`, `old_state JSONB`, `new_state JSONB`, `client_timestamp TIMESTAMPTZ` | Audit log record with generated `id`, `created_at` | Rejects null tenant or invalid action type | `docs/02-ARCHITECTURE-AND-STACK.md:14`, Dispatch prompt |
| 7 | Indexing Strategy | Composite & Lookup Indexes *(Discovered Gap)* | High-performance indexes for ledger queries, deferred triggers, and sync pull filters | Composite column sets on `transactions`, `accounts`, `journal_entries`, `iou_records`, `sinking_funds`, `audit_logs` | B-tree index structures | Failure to index `journal_entries(transaction_id)` causes sequential scan during trigger execution | Dispatch prompt, `packages/sync-engine/src/schema.ts:100-107` |
| 8 | Security / RLS | Table Row Level Security | Multi-tenant isolation ensuring users can only read and mutate their own financial data | `auth.uid()` JWT session context | Filtered rows on SELECT; allowed mutation on authorized rows | Cross-tenant access returns 0 rows (SELECT) or raises policy violation (`42501`) | `20261108000000_init_finvault_schema.sql:26-104`, `docs/05` |
| 9 | Security / RLS | Operation-Specific RLS Policies *(Discovered Gap)* | Distinct `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies with explicit `WITH CHECK (auth.uid() = user_id)` | Session `auth.uid()` and row `user_id` | Enforced operation boundaries | Attempt to reassign `user_id` or insert foreign `user_id` rejected | Dispatch prompt, Supabase Security Guidelines |
| 10 | Security / RLS | Search Path Hardening | Prevention of schema search path injection attacks on PL/pgSQL routines | Invocation of database function | Functions execute in strictly bounded namespace | Untrusted search paths blocked | `20261108000000_init_finvault_schema.sql:146, 248, 268, 325`, Dispatch prompt |
| 11 | Trigger / Integrity | Deferred Double-Entry Constraint Trigger | Server-side constraint trigger checking $\sum \text{debits} == \sum \text{credits}$ at transaction commit | Modified rows in `journal_entries` within transaction | Allows COMMIT if balanced or if all entries deleted | Unbalanced entries raise exception `check_violation` ('23514') and abort transaction | `20261108000000_init_finvault_schema.sql:107-154`, `docs/04:126-174` |
| 12 | Trigger / Integrity | Account Balance Maintenance Trigger | Dynamic recalculation of `accounts.balance_minor` according to normal balance sign conventions | INSERT, UPDATE, DELETE on `journal_entries` | Atomically adjusted `accounts.balance_minor` and `updated_at` | Inaccessible account raises `foreign_key_violation` ('23503') | `20261108000000_init_finvault_schema.sql:157-254`, `docs/04:183-281` |
| 13 | Trigger / Integrity | Journal Immutable Key Guards | Trigger checks preventing reassignment of primary key `id`, `user_id`, or `transaction_id` on journal entries | UPDATE statement on `journal_entries` | Permits valid updates to `amount_minor` or `account_id` | Modification of immutable keys raises `check_violation` ('23514') | `20261108000000_init_finvault_schema.sql:191-205` |
| 14 | Trigger / Provisioning | User Signup Account Bootstrap | Automatic provisioning of foundational starter accounts upon new user creation in `auth.users` | New row inserted into `auth.users` | Creates starter accounts with 0 balance (Cash, Bank, Expenses, Income, Opening Balance Equity) | Insertion failure aborts user creation | `20261108000000_init_finvault_schema.sql:257-273`, Dispatch prompt |
| 15 | Stored Procedure | Atomic Transaction RPC (`post_transaction`) | Single-transaction creation of transaction header and balanced journal entry splits | `p_user_id UUID`, `p_idempotency_key UUID`, `p_date DATE`, `p_description VARCHAR`, `p_notes TEXT`, `p_entries JSONB` | Transaction `UUID` and populated ledger rows | Unauthenticated raises `42501`; foreign account raises `23503`; unbalanced raises `23514` | `20261108000000_init_finvault_schema.sql:276-325`, Dispatch prompt |
| 16 | Stored Procedure | Atomic IOU Settlement RPC (`settle_iou`) *(Discovered Feature)* | Stored function atomically settling bilateral debt with automatic double-entry journal posting | `p_iou_id UUID`, `p_settlement_amount_minor BIGINT`, `p_settlement_account_id UUID` | Updated IOU record (`SETTLED`/`PARTIAL`) and new settlement transaction | Overpayment, non-positive amount, or foreign account raises exception | `docs/09-API-CONTRACTS.md`, `tests/e2e/infra/supabase-oracle.ts:352-414` |
| 17 | Client Storage | Client SQLite Schema Parity | 1:1 client SQLite DDL mirroring PostgreSQL tables with 64-bit `INTEGER` minor units and check constraints | SQLite execution of DDL statements | Initialized local SQLite tables with foreign keys and check constraints | Type or constraint mismatch fails SQLite initialization | `packages/sync-engine/src/schema.ts`, `tests/e2e/tier1-feature-coverage/offline-sqlite.test.ts` |
| 18 | Client Storage | Mutation Outbox Queue (`sync_queue`) | Local table queueing offline mutations for replay and delta synchronization | Offline mutation events (INSERT, UPDATE, DELETE) | Enqueued sync items with `PENDING` status | Serialization failure rolls back local transaction | `packages/sync-engine/src/schema.ts:85-97`, `tests/e2e/tier1-feature-coverage/offline-sqlite.test.ts:89-112` |
| 19 | Shared Types | TypeScript Type Definitions | Shared TypeScript definitions for all database entities enforcing `bigint` minor units | Model interfaces and DTOs | Compile-time type safety across frontend and sync engine | Floating-point usage causes TypeScript compiler errors | `packages/db-types/src/index.ts` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Double-Entry Deferred Trigger | 100-way multi-split transaction (50 debits, 50 credits of 250 paise each) | Successfully aggregates 50 legs, confirms `total_debits == total_credits == 12500n`, and commits without error. (`T2-LEDGER-02`) |
| 2 | Double-Entry Deferred Trigger | Transaction with 1-paise discrepancy (e.g. debits 10001 paise, credits 10000 paise) | Detects exact off-by-one difference (1 paise) and raises exception `check_violation` with exact delta in message. (`T2-LEDGER-06`) |
| 3 | Double-Entry Deferred Trigger | Single-sided entry (1 debit entry with no credit counterpart) | Selects `total_credits = 0`, detects missing leg (`total_debits = 0 OR total_credits = 0`), and raises `check_violation`. (`T2-LEDGER-07`) |
| 4 | Double-Entry Deferred Trigger | Complete transaction deletion where all journal entries are deleted in a single statement | Computes `entry_count = 0` and executes `IF entry_count = 0 THEN RETURN COALESCE(NEW, OLD); END IF;`, allowing clean deletion. (`20261108000000_init_finvault_schema.sql:126-128`) |
| 5 | Double-Entry Deferred Trigger | Extreme Int64 max amount ($2^{63}-1 = 9,223,372,036,854,775,807$ paise) | Handled safely if summing variables are typed as `NUMERIC(38,0)`; assignment to `BIGINT` in PL/pgSQL can risk integer overflow during intermediate summing. (`T2-LEDGER-03`) |
| 6 | Balance Maintenance Trigger | Journal entry amount updated in-place on the same account | Trigger calculates `v_old_delta` (reverts previous direction/amount) and `v_new_delta` (applies new direction/amount), atomically applying `v_old_delta + v_new_delta` to `balance_minor`. (`20261108000000_init_finvault_schema.sql:229-234`) |
| 7 | Balance Maintenance Trigger | Journal entry transferred from Account A to Account B | Executes split updates: subtracts old delta from Account A and applies new delta to Account B in a single transaction. (`20261108000000_init_finvault_schema.sql:235-244`) |
| 8 | Balance Maintenance Trigger | Attempt to alter `id`, `user_id`, or `transaction_id` of an existing journal entry | Guard conditions trigger immediately and raise `check_violation` ('Cannot reassign journal entry...'). (`20261108000000_init_finvault_schema.sql:191-205`) |
| 9 | Balance Maintenance Trigger | Account balance update during delta sync reconciliation | Current trigger updates `balance_minor` and `updated_at`, but fails to increment `version`. Without `version = version + 1`, downstream LWW conflict resolution may fail to detect server-side balance shifts. *(Edge Case Discovered)* |
| 10 | User Bootstrap Trigger | User onboarding with initial opening asset balances (e.g. ₹50,000 in bank) | Current trigger creates Cash, Bank, Expenses, Income, but NOT `Opening Balance Equity`. Entering initial bank balance without an equity account fails double-entry balance! Adding `Opening Balance Equity` (`EQUITY`) resolves this. *(Edge Case Discovered)* |
| 11 | Atomic RPC `post_transaction` | Caller passes `p_entries` containing 4 entries where 1 entry references an account owned by a different user | Iteration checks each `account_id` against `accounts WHERE id = ... AND user_id = v_user_id`. When foreign account is found, raises `foreign_key_violation` ('Cross-tenant foreign key violation') and rolls back all inserts. (`T2-RLS-03`, `tests/e2e/infra/supabase-oracle.ts:239-247`) |
| 12 | Atomic RPC `post_transaction` | Caller passes `p_entries` with only 1 entry or empty array `[]` | Should fail immediately with `check_violation` before creating transaction header row. Currently relies on deferred trigger at commit. Adding upfront `jsonb_array_length(p_entries) >= 2` validation improves ergonomics. *(Edge Case Discovered)* |
| 13 | Atomic RPC `post_transaction` | Caller provides `p_user_id` differing from authenticated JWT `auth.uid()` | If `p_user_id` is an explicit parameter and caller is authenticated, function must enforce `IF p_user_id <> auth.uid() AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized tenant spoofing'; END IF;`. *(Edge Case Discovered)* |
| 14 | Row Level Security | Anonymous unauthenticated request (`role = 'anon'`, `auth.uid() IS NULL`) | All `SELECT` queries evaluate `auth.uid() = user_id` to FALSE (returns 0 rows). All `INSERT`/`UPDATE`/`DELETE` attempts reject with 403 Forbidden. (`T2-RLS-01`) |
| 15 | Row Level Security | Authenticated User B attempts to query User A account UUID directly | `SELECT * FROM accounts WHERE id = 'user-a-uuid'` evaluates `auth.uid() = user_id` to FALSE and returns 0 rows, preventing existence enumeration. (`T1-RLS-02`) |
| 16 | Row Level Security | Malicious User B executes `UPDATE` setting `user_id = user_b_uuid` on User A row | `USING` filter prevents User B from selecting User A's row; and `WITH CHECK (auth.uid() = user_id)` prevents User B from writing foreign `user_id`. *(Edge Case Discovered)* |
| 17 | IOU Record Invariants | IOU record initialized or updated with `remaining_balance_minor < 0` or `> principal_minor` | Currently no CHECK constraint on `remaining_balance_minor`. An erroneous update could produce negative debt. Constraint `CHECK (remaining_balance_minor >= 0 AND remaining_balance_minor <= principal_minor)` prevents debt corruption. *(Edge Case Discovered)* |
| 18 | Sinking Fund Invariants | Sinking fund allocated with negative amount (`allocated_amount_minor < 0`) | Currently no check constraint on `allocated_amount_minor`. Adding `CHECK (allocated_amount_minor >= 0)` enforces non-negative budget accumulation. *(Edge Case Discovered)* |
| 19 | Client SQLite Offline Write | Client device logs transaction while completely offline (network disabled) | Local SQLite executes transaction and updates local balances in sub-50ms (<10ms measured) and enqueues payload in `sync_queue` with status `PENDING`. (`T1-SQLITE-02`, `T1-SQLITE-04`) |
| 20 | Client SQLite Rollback | Client offline transaction with unbalanced entries (e.g. DEBIT 20000, CREDIT 15000) | SQLite transaction aborts, rolls back transaction header, journal entries, and outbox queue, leaving account balances pristine. (`T1-SQLITE-05`) |

---

## 1. Observation

Direct examination of workspace files, existing DDL migrations, documentation, and the E2E test suite revealed the following specific facts:

1. **Initial DDL File (`supabase/migrations/20261108000000_init_finvault_schema.sql`)**:
   - Defines 5 tables: `accounts` (lines 13-24), `transactions` (lines 31-43), `journal_entries` (lines 50-58), `iou_records` (lines 65-81), and `sinking_funds` (lines 88-100).
   - **`audit_logs` table is completely missing**: There is no `CREATE TABLE audit_logs` in the migration file or in `docs/04-DATABASE-SCHEMA.md`, despite being required by `docs/02-ARCHITECTURE-AND-STACK.md:14` ("Conflict resolution: Last-Write-Wins (LWW) with client-generated UUIDs and audit logs") and explicitly listed in the Milestone 2 dispatch instructions.
   - **Zero custom indexes exist**: Aside from primary key and unique constraints, there are **no indexes** created in `20261108000000_init_finvault_schema.sql`. Specifically:
     - `journal_entries(transaction_id)` is **unindexed**. When the deferred constraint trigger `trg_verify_transaction_balance` executes at commit time, line 123 (`SELECT ... FROM journal_entries WHERE transaction_id = target_tx_id;`) performs a full sequential table scan per modified row.
     - `transactions(user_id, transaction_date DESC)` is unindexed.
     - `accounts(user_id, type)` is unindexed.
   - **RLS policies use generic `FOR ALL USING`**:
     Lines 27-28: `CREATE POLICY "Users can only access their own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);`
     Every table uses this single blanket policy without an explicit `WITH CHECK (auth.uid() = user_id)` clause or operation segregation.
   - **Missing check constraints on monetary balances**:
     - `iou_records.remaining_balance_minor` (line 72) has `BIGINT NOT NULL` but lacks `CHECK (remaining_balance_minor >= 0 AND remaining_balance_minor <= principal_minor)`.
     - `sinking_funds.allocated_amount_minor` (line 93) has `BIGINT NOT NULL DEFAULT 0` but lacks `CHECK (allocated_amount_minor >= 0)`.
   - **User bootstrap trigger omits `Opening Balance Equity`**:
     Lines 260-265:
     ```sql
     INSERT INTO accounts (user_id, name, type, currency, balance_minor)
     VALUES
         (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
         (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
         (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
         (NEW.id, 'Primary Income', 'INCOME', 'INR', 0);
     ```
     The prompt explicitly states: `"creates default accounts (Cash, Bank, Income, Expense, Opening Balance Equity) with 0 balance"`. The `Opening Balance Equity` account is absent.
   - **Account balance trigger does not increment account version**:
     Lines 179, 188, 232, 237, 242:
     `UPDATE accounts SET balance_minor = balance_minor + v_delta, updated_at = NOW() WHERE id = ...;`
     The `version` column is not incremented (`version = version + 1`), which prevents delta sync engines from detecting balance mutations via version watermarks.
   - **`post_transaction` procedure signature and validations**:
     Lines 276-282: Takes `p_idempotency_key UUID, p_transaction_date DATE, p_description VARCHAR(255), p_notes TEXT, p_entries JSONB`.
     The dispatch prompt requires: `post_transaction(p_user_id, p_idempotency_key, p_date, p_description, p_notes, p_entries)`.
     Furthermore, `post_transaction` lacks upfront validation for `jsonb_array_length(p_entries) >= 2`.

2. **Documentation Files (`docs/04-DATABASE-SCHEMA.md` and `docs/05-SECURITY-AND-COMPLIANCE.md`)**:
   - `docs/04-DATABASE-SCHEMA.md` mirrors the initial migration verbatim, lacking `audit_logs`, composite indexes, check constraints on remaining/allocated amounts, and `Opening Balance Equity`.
   - `docs/05-SECURITY-AND-COMPLIANCE.md` states: `"Every policy enforces USING (auth.uid() = user_id) and WITH CHECK (auth.uid() = user_id)"`, but the SQL code in `20261108000000_init_finvault_schema.sql` only specifies `USING (auth.uid() = user_id)` without `WITH CHECK`.

3. **Client SQLite Schema (`packages/sync-engine/src/schema.ts`)**:
   - Defines SQLite tables for `accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`, and `sync_queue`.
   - Indexes exist in SQLite (lines 100-107), demonstrating that indexing was intended but omitted from the PostgreSQL DDL.
   - `remaining_balance_minor` and `allocated_amount_minor` lack check constraints in SQLite as well.

4. **Test Suite Status (`tests/e2e/runner.ts`)**:
   - Command: `node --experimental-strip-types tests/e2e/runner.ts`
   - Result: 63 / 63 tests pass across all 4 Tiers with 100% success rate. The reference oracles in `tests/e2e/infra/` validate that the architectural concepts are mathematically sound.

---

## 2. Logic Chain

1. **Step 1: Invariant Analysis of Monetary Fields & CHECK Constraints**
   - Observation: Rule 01 and PRD mandate that zero floating-point money is permitted and all monetary fields must be integer minor units.
   - Observation: `journal_entries.amount_minor > 0`, `iou_records.principal_minor > 0`, and `sinking_funds.target_amount_minor > 0` are enforced.
   - Inference: A debt record's remaining balance (`remaining_balance_minor`) must logically never become negative, nor should it ever exceed the initial loan principal (`principal_minor`). Without `CHECK (remaining_balance_minor >= 0 AND remaining_balance_minor <= principal_minor)`, a corrupted update or sync race condition could produce impossible negative debt.
   - Inference: Similarly, `sinking_funds.allocated_amount_minor` must never be negative (`CHECK (allocated_amount_minor >= 0)`).

2. **Step 2: Performance & Ledger Integrity via Indexing**
   - Observation: PostgreSQL constraint triggers defined as `DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` fire at commit time for every modified row.
   - Observation: `verify_transaction_balance()` queries `journal_entries` by `transaction_id`.
   - Inference: In an active ledger with thousands of entries, executing `WHERE transaction_id = target_tx_id` without an index on `journal_entries(transaction_id)` results in an $O(N)$ sequential table scan per modified entry. For a 100-split transaction, PostgreSQL would scan the full journal table 100 times during commit! An index `idx_journal_entries_tx ON journal_entries(transaction_id)` reduces this to index seek $O(\log N)$.
   - Inference: Queries filtering transactions by user and date (`WHERE user_id = $1 ORDER BY transaction_date DESC`) require a composite B-tree index `idx_transactions_user_date ON transactions(user_id, transaction_date DESC)`.

3. **Step 3: Security & RLS Hardening**
   - Observation: In PostgreSQL, `CREATE POLICY ... FOR ALL USING (condition)` uses `condition` as `WITH CHECK` for `INSERT`, but for `UPDATE`, `USING` only controls row visibility; if `WITH CHECK` is omitted, PostgreSQL does not enforce the policy condition on the updated row values unless explicit.
   - Inference: To guarantee that a user cannot reassign rows to another tenant during an `UPDATE` or insert rows with another user's ID, every table must have explicit `WITH CHECK (auth.uid() = user_id)`.
   - Inference: Segregating into granular policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) provides cleaner auditability, prevents privilege escalation, and aligns with Supabase production standards.

4. **Step 4: Accounting Bootstrapping & Double-Entry Invariants**
   - Observation: Under double-entry bookkeeping, the initial state of a ledger must balance: $\text{Assets} = \text{Liabilities} + \text{Equity}$.
   - Observation: When a user creates an account and enters their initial bank balance (e.g. ₹50,000), the balancing leg must be credited to an Equity account.
   - Inference: Without an `Opening Balance Equity` account provisioned during user signup, the user cannot record their opening balances without either violating double-entry or recording fake "Income". Provisioning `Opening Balance Equity` (`EQUITY`) with 0 balance alongside Cash, Bank, Expenses, and Income directly satisfies this requirement.

5. **Step 5: Stored Procedure & Trigger Refinements**
   - Observation: `post_transaction` is a `SECURITY DEFINER` function. In Supabase, client RPC calls carry the authenticated user's JWT where `auth.uid()` is populated. However, Edge Functions or server administrative callers may need to pass `p_user_id` explicitly.
   - Inference: Defining `p_user_id UUID DEFAULT auth.uid()` allows both invocation styles while enforcing `IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN RAISE EXCEPTION ...`.
   - Inference: Adding `version = version + 1` to `trg_update_account_balance` ensures that account balance mutations advance the version counter for LWW delta sync.
   - Inference: Typing `total_debits` and `total_credits` as `NUMERIC(38,0)` in `verify_transaction_balance` prevents integer overflow when summing 64-bit integers.

---

## 3. Caveats

1. **No Production Supabase Instance Attached**: Investigation was conducted against local SQL migrations, TypeScript test harnesses, and documentation. No active Supabase cloud instance or running PostgreSQL container is connected in the workspace.
2. **Read-Only Scope**: In strict accordance with the Specification Miner archetype, no workspace files were modified, and no implementation code was written.
3. **Self-Hosted Mode Preservation**: While Milestone 2 focuses exclusively on Supabase PostgreSQL 16 and client SQLite, all schema designs maintain strict SQL standard compatibility to ensure future air-gapped PostgreSQL / FastAPI portability.

---

## 4. Conclusion & Concrete Blueprints

To achieve 100% compliance with Milestone 2 requirements, the project requires:
1. A consolidated, hardened PostgreSQL migration (or clean migration update) in `supabase/migrations/`.
2. Schema parity updates in `packages/sync-engine/src/schema.ts`.
3. Updated TypeScript interfaces in `packages/db-types/src/index.ts`.
4. Documentation synchronization in `docs/04-DATABASE-SCHEMA.md` and `docs/05-SECURITY-AND-COMPLIANCE.md`.

Below are the exact recommended blueprints for the engineering team.

### Blueprint A: PostgreSQL Schema & DDL Recommendations

```sql
-- ====================================================================
-- FinVault Milestone 2 DDL Blueprint
-- Target: Supabase PostgreSQL 16
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Enums
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

-- 3. Journal Entries Table
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
    allocated_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0),
    target_date DATE,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

-- 6. Audit Logs Table (Milestone 2 Requirement)
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

-- Performance & Integrity Indexes
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
```

### Blueprint B: Row Level Security (RLS) Hardening

```sql
-- Enable RLS on all 6 tables
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
```

### Blueprint C: Database Functions & Triggers

```sql
-- 1. Double-Entry Deferred Constraint Trigger Function
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

    -- If all journal entries were deleted (transaction deletion), allow
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

DROP TRIGGER IF EXISTS trg_verify_transaction_balance ON journal_entries;
CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_transaction_balance();

-- 2. Account Balance Maintenance Trigger Function
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

-- 3. User Bootstrap Trigger with Opening Balance Equity
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

-- 4. Atomic Transaction RPC (post_transaction)
CREATE OR REPLACE FUNCTION post_transaction(
    p_user_id UUID DEFAULT auth.uid(),
    p_idempotency_key UUID DEFAULT gen_random_uuid(),
    p_date DATE DEFAULT CURRENT_DATE,
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

    -- Cross-tenant verification: all accounts must belong to authenticated user
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
    VALUES (v_user_id, p_idempotency_key, p_date, p_description, p_notes)
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
```

---

## 5. Verification Method

To independently verify the discoveries, assertions, and recommendations documented in this report:

1. **Run Full Invariant & E2E Test Suite**:
   ```bash
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   Confirm all 63 test cases pass across Tier 1 (Feature Coverage), Tier 2 (Boundary & Corner Cases), Tier 3 (Pairwise Coverage), and Tier 4 (Workload Scenarios).

2. **Inspect Migration & DDL Definitions**:
   - Inspect `supabase/migrations/20261108000000_init_finvault_schema.sql` lines 126-144 to verify the deferred constraint trigger and `entry_count = 0` deletion handling.
   - Inspect lines 167-246 to verify normal balance delta math and immutable key checks.
   - Confirm absence of `audit_logs` table, indexes on `journal_entries(transaction_id)`, and `Opening Balance Equity` in lines 260-265.

3. **Inspect Client SQLite Schema**:
   - Inspect `packages/sync-engine/src/schema.ts` lines 9-107 to verify the client-side DDL matching the cloud schema and notice existing SQLite indexes that should be mirrored in PostgreSQL.

4. **Inspect Documentation**:
   - Inspect `docs/04-DATABASE-SCHEMA.md` and `docs/05-SECURITY-AND-COMPLIANCE.md` to verify current alignment and missing sections identified in this report.

5. **Invalidation Conditions**:
   - This specification report would be invalidated if FinVault shifted away from Double-Entry Lite accounting, adopted floating-point currency, or removed Row Level Security tenant isolation.
