# Specification Mining & Gap Analysis Report: Database, Ledger Invariants, Auth & Sync (R2 & R3)

**Miner Archetype**: Specification Miner  
**State Folder**: `d:\programming\New_project\.agents\teamwork\miner_survey_2`  
**Workspace**: `d:\programming\New_project`  
**Parent Orchestrator ID**: `867b8adb-e639-414f-92fa-0326940898a2`  
**Date**: 2026-11-08  

---

## 1. Executive Summary

This report delivers the authoritative specification mining and repository gap analysis for **Requirement R2 (Supabase PostgreSQL Schema, Security, and Ledger Invariants)** and **Requirement R3 (Authentication, Backend Services, and Sync)** for the **FinVault** project.

FinVault is a local-first, privacy-preserving personal finance, money lending (IOU), bills, and wealth management platform running across Web (Next.js 14+) and Mobile (React Native / Expo for Android first). The cloud backend is powered by **Supabase (PostgreSQL 16 + pgvector)** with **Google OAuth (Gmail)** authentication, and the local client storage relies on an offline-first **SQLite / SQLCipher** database synchronized via delta replication.

All observations are derived from verbatim inspection of the workspace root files, `docs/` suite (`01` through `11`), `.agents/rules/`, `.agents/skills/`, and shell environment audits.

---

## 2. Observation

### 2.1 Workspace File Tree & Missing Codebase Directories
Running `Get-ChildItem -Force` and `Test-Path` across the workspace revealed:
- **Root Files Present**: `AGENTS.md`, `CHANGELOG.md`, `TASKS.md`, `docs/` (files `01` through `11`), `.agents/` (`rules/` and `skills/`).
- **Codebase Directories Non-Existent**:
  - `supabase/` (`supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`) -> `Test-Path: False`
  - `packages/` (`packages/db-types/`, `packages/sync-engine/`, `packages/ui/`) -> `Test-Path: False`
  - `apps/` (`apps/web/`, `apps/mobile/`) -> `Test-Path: False`
- **Host Runtime Environment**:
  - `node.exe`: `v24.21.0` (at `C:\Program Files\nodejs\node.exe`)
  - `npm.ps1`: `11.19.0` (at `C:\Program Files\nodejs\npm.ps1`)
  - `python.exe`: `3.15.0` (at `C:\Python315\python.exe`)
  - `git`: Not in system `PATH`.
  - `supabase CLI`: Not installed locally in system `PATH`.

### 2.2 Verbatim Documentation Findings (R2: Schema, Security & Invariants)

#### `docs/04-DATABASE-SCHEMA.md`:
- **Core Principles Quoted**:
  > 1. Minor Currency Units (`BIGINT`): All monetary amounts stored as minor units (e.g., paise/cents) with ISO 4217 currency code. Zero floating-point arithmetic.  
  > 2. Double-Entry Lite Invariant: Every financial transaction contains balanced journal entries where $\sum \text{debits} = \sum \text{credits}$.  
  > 3. User Isolation (Row-Level Security): Every row is tied to `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` with RLS policies enabled.
- **Defined PostgreSQL Tables**:
  1. `accounts`: `id UUID PK`, `user_id UUID FK`, `name VARCHAR(120)`, `type account_type` (`ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE`), `currency CHAR(3) DEFAULT 'INR'`, `balance_minor BIGINT DEFAULT 0`, `is_archived BOOLEAN DEFAULT FALSE`, `created_at`, `updated_at`, `version BIGINT DEFAULT 1`.
  2. `transactions`: `id UUID PK`, `user_id UUID FK`, `idempotency_key UUID UNIQUE`, `transaction_date DATE`, `description VARCHAR(255)`, `notes TEXT`, `is_reconciled BOOLEAN DEFAULT FALSE`, `is_deleted BOOLEAN DEFAULT FALSE`, `created_at`, `updated_at`, `version BIGINT DEFAULT 1`.
  3. `journal_entries`: `id UUID PK`, `user_id UUID FK`, `transaction_id UUID FK`, `account_id UUID FK`, `amount_minor BIGINT CHECK (amount_minor > 0)`, `direction entry_direction` (`DEBIT`, `CREDIT`), `created_at`.
  4. `iou_records`: `id UUID PK`, `user_id UUID FK`, `counterparty_name VARCHAR(120)`, `counterparty_contact VARCHAR(80)`, `direction iou_direction` (`LENT`, `BORROWED`), `principal_minor BIGINT CHECK (principal_minor > 0)`, `remaining_balance_minor BIGINT`, `currency CHAR(3) DEFAULT 'INR'`, `status iou_status` (`OPEN`, `PARTIAL`, `SETTLED`, `WRITTEN_OFF`), `due_date DATE`, `notes TEXT`, `is_deleted BOOLEAN DEFAULT FALSE`, `created_at`, `updated_at`, `version BIGINT DEFAULT 1`.
  5. `sinking_funds`: `id UUID PK`, `user_id UUID FK`, `name VARCHAR(120)`, `target_amount_minor BIGINT CHECK (target_amount_minor > 0)`, `allocated_amount_minor BIGINT DEFAULT 0`, `target_date DATE`, `currency CHAR(3) DEFAULT 'INR'`, `is_completed BOOLEAN DEFAULT FALSE`, `created_at`, `updated_at`.
- **Incomplete Server-Side Trigger Implementation (Lines 121–140)**:
  ```sql
  CREATE OR REPLACE FUNCTION verify_transaction_balance()
  RETURNS TRIGGER AS $$
  DECLARE
      total_debits BIGINT;
      total_credits BIGINT;
  BEGIN
      SELECT COALESCE(SUM(amount_minor), 0) INTO total_debits
      FROM journal_entries
      WHERE transaction_id = NEW.transaction_id AND direction = 'DEBIT';

      SELECT COALESCE(SUM(amount_minor), 0) INTO total_credits
      FROM journal_entries
      WHERE transaction_id = NEW.transaction_id AND direction = 'CREDIT';

      -- Verified on transaction finalization / deferred constraint
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```
  *Defect Observed*: The function does NOT raise an exception when `total_debits <> total_credits`, nor does it attach a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` to `journal_entries`. Furthermore, it does not handle deletions (`OLD.transaction_id`).

#### `docs/05-SECURITY-AND-COMPLIANCE.md`:
- Currently contains only 5 lines of placeholder text:
  > 1. Local-First Data Sovereignty: All financial records reside locally in PostgreSQL and encrypted on-device SQLite (`SQLCipher`). Zero telemetry or third-party cloud data exposure.  
  > 2. Authentication & Biometrics: Local device biometrics (FaceID/Fingerprint) protect the mobile application. Local desktop API secured via local bearer token auth.  
  > 3. Secrets Management: Environment variables managed via local `.env` files (never committed to Git).
  *Defect Observed*: Entirely omits Supabase RLS policies, Google OAuth security requirements, token exchange flows, and SQLCipher key derivation specifics.

#### `.agents/rules/01-financial-ledger-safety.md`:
- Strict rule mandate:
  > 1. Integer Minor Units: Never use floating-point numbers (`float`/`double`) for currency. Store all amounts as `BIGINT` minor units (e.g., cents or paise) or exact fixed-point decimals (`NUMERIC(19,4)`).  
  > 2. Double-Entry Invariant: Every posted transaction must maintain strict debit-credit balance equality (`SUM(debits) == SUM(credits)`).  
  > 3. Idempotency: All transaction ingestion endpoints (bank CSV imports, Android notifications) must enforce cryptographic deduplication hashes (`SHA-256` of date + amount + normalized description).

### 2.3 Verbatim Documentation Findings (R3: Auth, Backend Services & Sync)

#### `docs/09-API-CONTRACTS.md`:
- **Auth Contract**: Google OAuth via `supabase.auth.signInWithOAuth({ provider: 'google' })`. JWT managed in browser cookies (`@supabase/ssr`) and device SecureStore (`expo-secure-store`).
- **Database RPC Contract**:
  - `rpc/post_transaction`: Accepts `{ idempotency_key: UUID, transaction_date: DATE, description: string, entries: [{ account_id: UUID, amount_minor: BIGINT, direction: 'DEBIT'|'CREDIT' }] }`. Rejects with HTTP 400 if `SUM(debits) != SUM(credits)`.
- **Delta Sync Contract**:
  - Pull: `SELECT * FROM transactions WHERE user_id = auth.uid() AND updated_at > :last_sync_timestamp;`
  - Push: Batch upsert local queued changesets with client UUIDs; Supabase returns committed server timestamps.

#### `docs/02-ARCHITECTURE-AND-STACK.md`:
- Specifies: Supabase (PostgreSQL 16 + pgvector), PostgREST auto-generated REST API, Supabase Edge Functions (Deno / TypeScript), Row Level Security (RLS) bound to `auth.uid()`.
- Client storage: SQLite / SQLCipher with `<50ms` latency.
- Sync protocol: Offline-first client writes to local SQLite first. When online, bidirectional delta sync connects via HTTPS to Supabase. Conflict resolution: Last-Write-Wins (LWW) with client-generated UUIDs and audit logs.
- Monorepo package pointers: `packages/db-types`, `packages/sync-engine`, `supabase/migrations`, `supabase/functions`.

#### Outdated Legacy References in Skills:
- `.agents/skills/db-migration-and-sync/SKILL.md`:
  > "1. Generate an Alembic migration in Python for FastAPI backend modifications."
  *Defect Observed*: Relic from superseded FastAPI architecture. Must be updated to Supabase SQL migrations and SQLite schema synchronization.
- `.agents/skills/verify-and-record/SKILL.md`:
  > "1. Run `pytest` with property-based financial ledger tests."
  *Defect Observed*: Relic from Python architecture. Prompt specifies fast-check (TypeScript) and database trigger tests.

---

## 3. Logic Chain

1. **System Invariant**: Financial data integrity in FinVault is non-negotiable. Floating-point arithmetic introduces IEEE-754 precision drift; therefore, every monetary column must be `BIGINT` minor units (e.g. 100 paise = 1 INR, 100 cents = 1 USD).
2. **Double-Entry Enforcement**: A double-entry transaction consists of multiple journal entries. Because standard PostgreSQL triggers evaluate per-row during individual `INSERT` statements, an immediate trigger on `journal_entries` would prematurely fail on the first split insertion. Hence, server-side enforcement requires either:
   - A `DEFERRABLE INITIALLY DEFERRED` constraint trigger evaluated strictly at commit time.
   - An atomic database stored procedure (`post_transaction` RPC) that accepts the entire transaction and entry array, verifies debits == credits in a single transaction block, inserts entries, and adjusts account balances.
   - Both layers must be implemented for defense-in-depth.
3. **Multi-Tenant Row Level Security (RLS)**: Because clients communicate directly with Supabase via PostgREST and `@supabase/supabase-js`, database-level RLS is the sole cloud security perimeter. Every table must enforce `auth.uid() = user_id` for both `USING` and `WITH CHECK`. Furthermore, foreign key references (such as `journal_entries.account_id -> accounts.id`) must be safeguarded to prevent User A from referencing User B's accounts.
4. **Offline-First Delta Sync**: To achieve offline operability with zero UI latency, mobile and web write to a local SQLite database first. Every write appends a record to a local `sync_queue` table. When online, a two-phase push/pull synchronization protocol reconciles deltas with Supabase using version watermarks (`updated_at`, `version`) and client-generated UUIDs, applying Last-Write-Wins (LWW) conflict resolution.
5. **Implementation Reality**: The repository currently lacks all code directories (`supabase/`, `packages/db-types/`, `packages/sync-engine/`). Initializing these packages and writing the complete Supabase SQL migrations with working triggers and RLS policies is the immediate prerequisite for subsequent feature development.

---

## 4. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R2: Database Schema | Minor Unit `BIGINT` Storage | All monetary amounts stored as 64-bit integers representing minor currency units (paise/cents). No floating-point types allowed. | `amount_minor: BIGINT` (> 0) | Stored `BIGINT` | Check constraint violation if `amount_minor <= 0` | `docs/04`, `ADR-001`, `01-safety.md` |
| 2 | R2: Database Schema | Core Account Hierarchy | Chart of accounts classifying entities into ASSET, LIABILITY, EQUITY, INCOME, EXPENSE with currency and balance. | Account attributes (`name`, `type`, `currency`) | Created `accounts` row with `UUID` | Rejects invalid enum values or null names | `docs/04-DATABASE-SCHEMA.md` |
| 3 | R2: Database Schema | Transaction Header & Idempotency | Master record for financial movements storing transaction date, description, notes, and unique idempotency key. | `idempotency_key: UUID`, `transaction_date`, `description` | Created `transactions` row | Rejects duplicate `idempotency_key` (unique constraint) | `docs/04-DATABASE-SCHEMA.md` |
| 4 | R2: Database Schema | Balanced Journal Entries | Granular debit/credit legs linked to transactions and accounts. Must balance to zero net. | `transaction_id`, `account_id`, `amount_minor`, `direction` ('DEBIT'/'CREDIT') | Created `journal_entries` row | Rejects foreign key violations or negative amounts | `docs/04-DATABASE-SCHEMA.md` |
| 5 | R2: Database Schema | Peer Lending & IOU Ledger | Debt tracker recording principal, remaining balance, counterparty name/contact, direction (LENT/BORROWED), status (OPEN, PARTIAL, SETTLED, WRITTEN_OFF), and due date. | Counterparty details, principal, direction, due date | Created `iou_records` row | Rejects non-positive principal; status transition validations | `docs/04`, `01-PRD`, `TASKS.md` |
| 6 | R2: Database Schema | Sinking Funds & Savings Goals | Target savings tracker recording target amount, allocated amount, target date, and completion flag. | `name`, `target_amount_minor`, `target_date` | Created `sinking_funds` row | Rejects non-positive target amounts | `docs/04-DATABASE-SCHEMA.md` |
| 7 | R2: Database Schema | Versioned Records & Soft Deletion | Optimistic concurrency versioning (`version BIGINT DEFAULT 1`) and soft-delete flags (`is_deleted BOOLEAN DEFAULT FALSE`) for sync propagation. | Row updates or soft delete requests | Incremented version, updated timestamp | Conflicts detected if expected version != actual version | `docs/04`, `docs/02`, `docs/09` |
| 8 | R2: Security & RLS | Supabase RLS User Isolation | PostgreSQL Row Level Security enforcing that authenticated users only access rows where `user_id = auth.uid()`. | Incoming JWT with `auth.uid()` claim | Scoped query results | Empty set for unauthorized SELECT; permission denied for unauthorized INSERT/UPDATE/DELETE | `docs/04`, `docs/02`, `ORIGINAL_REQUEST.md` |
| 9 | R2: Security & RLS | Cross-Tenant FK Integrity | Prevent User A from inserting journal entries or IOUs pointing to User B's accounts or records. | `account_id`, `user_id` | Validated row creation | Trigger/composite FK aborts transaction if account belongs to different user | Analysis of RLS security boundaries |
| 10 | R2: Ledger Invariants | Deferred Constraint Trigger | PostgreSQL constraint trigger on `journal_entries` executing at commit time to abort transaction if $\sum debits \neq \sum credits$. | Inserted/updated/deleted journal entries in transaction | Success on commit if debits == credits | `RAISE EXCEPTION` (P0001) aborts entire SQL transaction | `docs/04`, `01-safety.md`, `ADR-001` |
| 11 | R2: Ledger Invariants | Atomic Transaction RPC (`post_transaction`) | Supabase Database Function executing atomic insert of transaction + all balanced journal splits + account balance updates. | `{ idempotency_key, transaction_date, description, entries: [...] }` | Created transaction object + entries | Returns HTTP 400 with descriptive error if unbalanced | `docs/09-API-CONTRACTS.md` |
| 12 | R2: Ledger Invariants | Account Balance Maintenance | Real-time balance updates on `accounts.balance_minor` derived from debits/credits according to account type accounting signs. | Journal entry modifications | Updated `balance_minor` on affected accounts | Rejects invalid operations or balance overflow | Accounting principles & schema design |
| 13 | R2: Client Storage | Client SQLite Schema Parity | Offline SQLite schema in React Native / Web mirroring PostgreSQL tables with 64-bit integer minor units and constraints. | SQL DDL matching PostgreSQL | Local database schema initialized | SQLite syntax or constraint failure | `ORIGINAL_REQUEST.md`, `docs/02`, `docs/04` |
| 14 | R2: Client Storage | SQLCipher Key Derivation & Encryption | At-rest AES-256 database encryption with PBKDF2 (64,000 iterations), key stored in OS Keystore/Keychain. | Encryption passphrase / biometric key | Decrypted database handle | Rejects access if encryption key invalid | `docs/11-ENV`, `docs/02`, `docs/05` |
| 15 | R3: Authentication | Google OAuth Sign-in (Gmail) | Supabase Auth integration supporting Google OAuth with redirect callback and JWT issuance. | Google OAuth credentials / user consent | Authenticated user session + access/refresh tokens | Auth error on invalid credentials or canceled consent | `ORIGINAL_REQUEST.md`, `docs/02`, `docs/09`, `docs/10` |
| 16 | R3: Authentication | User Bootstrap Account Provisioning | Trigger on `auth.users` creating standard default accounts (Checking, Cash, Expense, Income) upon first login. | New row in `auth.users` | Initialized default `accounts` | Transaction rollback if account creation fails | Spec discovery: required for instant first transaction |
| 17 | R3: Backend Services | PostgREST Auto-Generated REST API | High-performance direct CRUD API generated by Supabase over PostgreSQL tables, protected by RLS. | HTTPS requests with Bearer JWT | JSON payloads matching table schema | HTTP 401 (unauthenticated), 403 (unauthorized RLS) | `docs/02`, `docs/09` |
| 18 | R3: Backend Services | Supabase Edge Functions (Deno) | Serverless TypeScript Edge Functions for custom validation, bulk imports, statement parsing, and complex orchestrations. | HTTP POST with JSON body + auth header | Processed response JSON | Returns error status codes (400, 422, 500) | `ORIGINAL_REQUEST.md`, `docs/02`, `docs/09` |
| 19 | R3: Backend Services | Atomic IOU Settlement RPC | Supabase function to settle an IOU, update remaining balance, transition status, and record balancing journal entries. | `{ iou_id, amount_minor, account_id, payment_date }` | Updated IOU record + posted transaction | Rejects if amount exceeds remaining balance | PRD Phase 1 & API Contracts |
| 20 | R3: Synchronization | Local Mutation Queue (`sync_queue`) | Local SQLite outbox tracking pending inserts, updates, and deletes while offline with retry count and status. | Local mutations (table, record_id, op, payload) | Queued record for sync engine | Queue full or write error | `docs/02-ARCHITECTURE-AND-STACK.md` |
| 21 | R3: Synchronization | Bidirectional Delta Sync (Push/Pull) | Sync protocol pushing local mutations to Supabase and pulling cloud changes modified after `last_sync_timestamp`. | Local queued changes / server delta request | Synced local SQLite + updated timestamps | Network retry on timeout; marks sync status | `docs/09`, `docs/02`, `ORIGINAL_REQUEST.md` |
| 22 | R3: Synchronization | Last-Write-Wins (LWW) Conflict Resolution | Deterministic conflict resolution using version numbers, timestamps, and UUIDs to reconcile concurrent offline modifications. | Conflicting local and remote records | Winner record applied, version bumped | Conflict logged in sync audit log | `docs/02-ARCHITECTURE-AND-STACK.md` |

---

## 5. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Double-Entry Deferred Trigger | Inserting first entry of a 2-split transaction within a `BEGIN ... COMMIT` block. | In an immediate trigger, this fails immediately because credits are 0. In a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, evaluation is delayed until `COMMIT`, allowing the second entry to be inserted before verification. |
| 2 | Double-Entry Deferred Trigger | Single-leg transaction committed: `INSERT INTO journal_entries (DEBIT, 50000); COMMIT;` | At commit time, trigger evaluates debits (50000) != credits (0), throws `RAISE EXCEPTION 'Double-entry balance mismatch'`, rolling back entire transaction. |
| 3 | Double-Entry Multi-Split | Complex split: 1 debit (150000 paise) and 3 credits (50000, 70000, 30000 paise). | Total debits (150000) == total credits (150000). Trigger succeeds and commit completes smoothly. |
| 4 | Double-Entry Deletion | Deleting one journal entry from a balanced transaction: `DELETE FROM journal_entries WHERE id = '...'; COMMIT;` | Trigger on `OLD.transaction_id` detects debits != credits, raises exception, preventing partial deletion of ledger splits. |
| 5 | Double-Entry Cascade Deletion | Deleting a transaction: `DELETE FROM transactions WHERE id = '...';` | Foreign key `ON DELETE CASCADE` removes all associated journal entries. The trigger checks `IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = v_tx_id) THEN RETURN NULL;` and cleanly bypasses the balance check. |
| 6 | Minor Unit Zero/Negative Checks | Journal entry with `amount_minor = 0` or `amount_minor = -500`. | Aborted immediately by table check constraint `CHECK (amount_minor > 0)`. Negative balances are represented via credit/debit direction, never negative numbers. |
| 7 | Cross-Tenant Injection via FK | Authenticated User A attempts to insert a journal entry referencing User B's `account_id`. | If foreign key check is run without tenant isolation, Postgres allows it because FK runs with owner permissions. Must be blocked by adding a composite unique key `(id, user_id)` on `accounts` and composite FK `FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id)` on `journal_entries`, or checking `user_id` in the `post_transaction` RPC. |
| 8 | Offline Duplicate Sync Submission | Network timeout occurs after server commits client mutations, but before client receives 200 OK. Client retries push. | `idempotency_key UUID UNIQUE` on `transactions` catches duplicate insertion. Server returns existing transaction record instead of re-inserting or raising an unhandled conflict. |
| 9 | Concurrent Offline Edits on Same Record | Device A renames account while offline; Device B renames same account to something else while offline. | Delta sync uses Last-Write-Wins (LWW) based on `updated_at` server timestamp or highest version number. The later timestamp wins; audit entry recorded. |
| 10 | IOU Overpayment Settlement | User attempts to settle 12,000 paise on an IOU having `remaining_balance_minor = 10,000`. | Settlement RPC checks `amount_minor <= remaining_balance_minor`. Rejects overpayment with error `Payment exceeds remaining balance`. |
| 11 | SQLite 64-bit Integer Parity | Inserting a large integer (e.g. `9223372036854775807`) in SQLite `INTEGER` column. | SQLite storage class `INTEGER` natively supports 1, 2, 3, 4, 6, or 8-byte signed integers (up to 64 bits), exactly matching PostgreSQL `BIGINT`. Arithmetic matches without rounding errors. |
| 12 | Soft Deleted Entity Delta Sync | Record deleted on Device A while offline (`is_deleted = TRUE`). Device B syncs. | The soft-deleted row is pulled by Device B during delta sync (`updated_at > last_sync`), updating Device B's local SQLite record to `is_deleted = 1` rather than leaving an orphaned row. |
| 13 | New User First Login Without Accounts | User signs in via Google OAuth, navigates directly to transaction entry screen before creating accounts. | Transaction entry fails if no accounts exist. Solution: Automatic PostgreSQL trigger `on_auth_user_created` creates default accounts (Cash, Bank, Expense, Income) for the new user. |

---

## 6. Comprehensive Technical Specifications for R2 & R3

### 6.1 Database Schema Definition (Supabase PostgreSQL Migration)
The schema must be organized into a dedicated migration: `supabase/migrations/20261108000000_initial_schema.sql`:

1. **Extensions**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "vector";
   ```
2. **Enumerations**:
   ```sql
   CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
   CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
   CREATE TYPE iou_direction AS ENUM ('LENT', 'BORROWED');
   CREATE TYPE iou_status AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF');
   ```
3. **Tables with Composite Tenant FKs & Minor Unit Constraints**:
   - `accounts`:
     - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
     - `name VARCHAR(120) NOT NULL`
     - `type account_type NOT NULL`
     - `currency CHAR(3) NOT NULL DEFAULT 'INR'`
     - `balance_minor BIGINT NOT NULL DEFAULT 0`
     - `is_archived BOOLEAN NOT NULL DEFAULT FALSE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `version BIGINT NOT NULL DEFAULT 1`
     - `CONSTRAINT accounts_id_user_id_unique UNIQUE (id, user_id)`
   - `transactions`:
     - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
     - `idempotency_key UUID UNIQUE NOT NULL`
     - `transaction_date DATE NOT NULL`
     - `description VARCHAR(255) NOT NULL`
     - `notes TEXT`
     - `is_reconciled BOOLEAN NOT NULL DEFAULT FALSE`
     - `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `version BIGINT NOT NULL DEFAULT 1`
     - `CONSTRAINT transactions_id_user_id_unique UNIQUE (id, user_id)`
   - `journal_entries`:
     - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
     - `transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE`
     - `account_id UUID NOT NULL`
     - `amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)`
     - `direction entry_direction NOT NULL`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT`
   - `iou_records`:
     - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
     - `counterparty_name VARCHAR(120) NOT NULL`
     - `counterparty_contact VARCHAR(80)`
     - `direction iou_direction NOT NULL`
     - `principal_minor BIGINT NOT NULL CHECK (principal_minor > 0)`
     - `remaining_balance_minor BIGINT NOT NULL CHECK (remaining_balance_minor >= 0)`
     - `currency CHAR(3) NOT NULL DEFAULT 'INR'`
     - `status iou_status NOT NULL DEFAULT 'OPEN'`
     - `due_date DATE`
     - `notes TEXT`
     - `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `version BIGINT NOT NULL DEFAULT 1`
   - `sinking_funds`:
     - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
     - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
     - `name VARCHAR(120) NOT NULL`
     - `target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0)`
     - `allocated_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0)`
     - `target_date DATE`
     - `currency CHAR(3) NOT NULL DEFAULT 'INR'`
     - `is_completed BOOLEAN NOT NULL DEFAULT FALSE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `version BIGINT NOT NULL DEFAULT 1`
     - `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`

4. **Row Level Security (RLS) Policies**:
   ```sql
   ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
   ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
   ALTER TABLE iou_records ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sinking_funds ENABLE ROW LEVEL SECURITY;

   CREATE POLICY accounts_isolation_policy ON accounts
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);

   CREATE POLICY transactions_isolation_policy ON transactions
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);

   CREATE POLICY journal_entries_isolation_policy ON journal_entries
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);

   CREATE POLICY iou_records_isolation_policy ON iou_records
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);

   CREATE POLICY sinking_funds_isolation_policy ON sinking_funds
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);
   ```

5. **Double-Entry Balance Verification Constraint Trigger**:
   ```sql
   CREATE OR REPLACE FUNCTION verify_transaction_balance()
   RETURNS TRIGGER AS $$
   DECLARE
       v_tx_id UUID;
       v_debits BIGINT;
       v_credits BIGINT;
       v_count INT;
   BEGIN
       v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

       -- If parent transaction was deleted, bypass check
       IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = v_tx_id) THEN
           RETURN NULL;
       END IF;

       SELECT
           COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE 0 END), 0),
           COUNT(*)
       INTO v_debits, v_credits, v_count
       FROM journal_entries
       WHERE transaction_id = v_tx_id;

       IF v_count > 0 AND v_debits <> v_credits THEN
           RAISE EXCEPTION 'Double-Entry Invariant Violation: Transaction % has unbalanced entries (Debits: %, Credits: %)',
               v_tx_id, v_debits, v_credits
               USING ERRCODE = 'P0001';
       END IF;

       RETURN NULL;
   END;
   $$ LANGUAGE plpgsql;

   CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
       AFTER INSERT OR UPDATE OR DELETE ON journal_entries
       DEFERRABLE INITIALLY DEFERRED
       FOR EACH ROW
       EXECUTE FUNCTION verify_transaction_balance();
   ```

6. **Automatic Account Balance Maintenance Trigger**:
   ```sql
   CREATE OR REPLACE FUNCTION update_account_balance_on_entry()
   RETURNS TRIGGER AS $$
   DECLARE
       v_account_type account_type;
       v_delta BIGINT;
   BEGIN
       -- Determine delta:
       -- For ASSET/EXPENSE: DEBIT increases (+), CREDIT decreases (-)
       -- For LIABILITY/EQUITY/INCOME: CREDIT increases (+), DEBIT decreases (-)
       IF TG_OP = 'INSERT' THEN
           SELECT type INTO v_account_type FROM accounts WHERE id = NEW.account_id;
           IF v_account_type IN ('ASSET', 'EXPENSE') THEN
               v_delta := CASE WHEN NEW.direction = 'DEBIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
           ELSE
               v_delta := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
           END IF;
           UPDATE accounts SET balance_minor = balance_minor + v_delta, updated_at = NOW() WHERE id = NEW.account_id;
       ELSIF TG_OP = 'DELETE' THEN
           SELECT type INTO v_account_type FROM accounts WHERE id = OLD.account_id;
           IF v_account_type IN ('ASSET', 'EXPENSE') THEN
               v_delta := CASE WHEN OLD.direction = 'DEBIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
           ELSE
               v_delta := CASE WHEN OLD.direction = 'CREDIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
           END IF;
           UPDATE accounts SET balance_minor = balance_minor + v_delta, updated_at = NOW() WHERE id = OLD.account_id;
       END IF;
       RETURN NULL;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER trg_update_account_balance
       AFTER INSERT OR DELETE ON journal_entries
       FOR EACH ROW
       EXECUTE FUNCTION update_account_balance_on_entry();
   ```

7. **User Bootstrap Trigger (`on_auth_user_created`)**:
   ```sql
   CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
   RETURNS TRIGGER AS $$
   BEGIN
       INSERT INTO accounts (user_id, name, type, currency, balance_minor) VALUES
           (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
           (NEW.id, 'Main Bank Account', 'ASSET', 'INR', 0),
           (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
           (NEW.id, 'Salary Income', 'INCOME', 'INR', 0);
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   CREATE TRIGGER trg_on_auth_user_created
       AFTER INSERT ON auth.users
       FOR EACH ROW
       EXECUTE FUNCTION handle_new_user_provisioning();
   ```

### 6.2 Client SQLite / SQLCipher Schema Parity
The client database running in React Native (`op-sqlite` / `SQLCipher`) and local web store must execute identical schema constraints:
```sql
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    balance_minor INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

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

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    direction TEXT CHECK(direction IN ('DEBIT', 'CREDIT')) NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS iou_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    counterparty_name TEXT NOT NULL,
    counterparty_contact TEXT,
    direction TEXT CHECK(direction IN ('LENT', 'BORROWED')) NOT NULL,
    principal_minor INTEGER NOT NULL CHECK (principal_minor > 0),
    remaining_balance_minor INTEGER NOT NULL CHECK (remaining_balance_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT CHECK(status IN ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF')) NOT NULL DEFAULT 'OPEN',
    due_date TEXT,
    notes TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sinking_funds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor > 0),
    allocated_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0),
    target_date TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    is_completed INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- Sync Queue Outbox Table
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')) NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status TEXT CHECK(status IN ('PENDING', 'IN_FLIGHT', 'FAILED', 'RESOLVED')) NOT NULL DEFAULT 'PENDING'
);

-- Sync Metadata Table
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### 6.3 Authentication & Backend Services Specification (R3)
1. **Google OAuth Flow**:
   - Web: Initiated with `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback` } })`.
   - Mobile: Initiated via `expo-auth-session` with deep link redirect `finvault://auth/callback`.
   - Security: Tokens stored in SecureStore on mobile and httpOnly cookies via `@supabase/ssr` on Web.
2. **Atomic RPCs**:
   - `post_transaction(payload)`:
     ```json
     {
       "idempotency_key": "uuid-v4",
       "transaction_date": "2026-11-08",
       "description": "Grocery Shopping",
       "notes": "Weekly restock",
       "entries": [
         { "account_id": "acc-uuid-grocery", "amount_minor": 450000, "direction": "DEBIT" },
         { "account_id": "acc-uuid-bank", "amount_minor": 450000, "direction": "CREDIT" }
       ]
     }
     ```
   - Server validates in-memory $\sum debits == \sum credits$, inserts into `transactions` and `journal_entries`, and updates accounts atomically. Returns HTTP 400 if unbalanced.
3. **Supabase Edge Functions (`supabase/functions/`)**:
   - `validate-transaction`: Validates transaction format and ledger invariants before ingestion.
   - `sync-reconcile`: Batch reconciliation endpoint receiving queued mutations and resolving version watermarks.

### 6.4 Offline-First Synchronization Protocol (R3)
1. **Push Phase**:
   - Client selects all rows from `sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC`.
   - Sends payload in batch via HTTPS to Supabase.
   - Server processes mutations within transaction block, checks idempotency keys, increments `version`, and sets `updated_at = NOW()`.
   - On success, client marks queue rows as `RESOLVED` (or deletes them) and updates local records with server timestamps.
2. **Pull Phase**:
   - Client queries `sync_metadata` for `last_synced_at` (default `1970-01-01T00:00:00Z`).
   - Client requests changes: `GET /rest/v1/<table>?updated_at=gt.:last_synced_at&order=updated_at.asc`.
   - Client upserts received records into local SQLite tables.
   - Client saves latest `updated_at` as new `last_synced_at`.
3. **Conflict Resolution**:
   - **Entity Updates (LWW)**: Server timestamp takes precedence. If local changes conflict with remote changes, server version is retained and local overwrite is flagged in sync logs.
   - **Transactions**: Double-entry transactions are atomic documents with unique UUIDs. Edits to posted transactions update the transaction and replace entries, or post offsetting reversal transactions. Soft-deletion (`is_deleted = TRUE`) takes absolute priority over updates.

---

## 7. Gap Analysis: Specification vs. Workspace Reality

| Area | Specified in Docs / Original Request | Existing Workspace State | Severity | Remediation Action |
| :--- | :--- | :--- | :--- | :--- |
| **Monorepo Structure** | `apps/web`, `apps/mobile`, `packages/db-types`, `packages/sync-engine`, `packages/ui` | Directory structure completely absent | **High** | Initialize Turborepo monorepo with pnpm workspaces. |
| **Supabase Migrations** | `supabase/migrations/*.sql` containing DDL, RLS, deferred triggers, and seed data | `supabase/` directory does not exist | **High** | Create `supabase/migrations/20261108000000_initial_schema.sql` with complete DDL, constraint triggers, balance triggers, and RLS. |
| **Double-Entry Trigger** | Server-side trigger aborting transactions where debits != credits | `docs/04` lines 121–140 show incomplete function stub without `RAISE EXCEPTION` or `CONSTRAINT TRIGGER` | **High** | Implement production PL/pgSQL deferred constraint trigger and `post_transaction` RPC. |
| **Client SQLite DDL** | Mirrored SQLite schema with 64-bit integers and sync queue | Only described in narrative form in `docs/04` | **Medium** | Create `packages/sync-engine` containing SQLite migration DDL and client schema. |
| **TypeScript DB Types** | `packages/db-types` with generated types for Supabase schema | Missing entirely | **High** | Generate or author TypeScript types reflecting schema tables and enums. |
| **Sync Engine** | `packages/sync-engine` implementing push/pull delta sync with LWW | Missing entirely | **High** | Build the offline queue and delta sync engine package. |
| **Supabase Edge Functions** | `supabase/functions/` in Deno for transaction validation | Missing entirely | **Medium** | Implement Deno Edge Functions for transaction validation and sync. |
| **Security Docs (`docs/05`)** | Detailed security, RLS, OAuth, and biometrics baseline | File is a 5-line stub | **Medium** | Expand `docs/05-SECURITY-AND-COMPLIANCE.md` to document RLS architecture and OAuth flows. |
| **Migration Skill** | `.agents/skills/db-migration-and-sync/SKILL.md` | Still mentions Python/Alembic for FastAPI | **Low** | Update skill to describe Supabase SQL migrations and SQLite sync. |
| **Verify Skill** | `.agents/skills/verify-and-record/SKILL.md` | Still mentions `pytest` | **Low** | Update skill to specify TypeScript fast-check and trigger verification scripts. |

---

## 8. Caveats

1. **No External Live Database**: A live Supabase cloud project URL and credentials have not been configured yet (workspace contains only template variables in `docs/11-ENV-AND-MCP.md`). Local verification of PostgreSQL triggers requires Supabase CLI (`npx supabase`) or local PostgreSQL instance.
2. **Git Executable Missing**: The `git` executable is not currently registered in the Windows environment PATH, so version control commands cannot be run from PowerShell without adding git to PATH or using file-based change tracking.
3. **Multi-Currency Splits**: In Phase 1, transactions are assumed to be single-currency (`INR` default). Multi-currency transactions with fluctuating exchange rates require dedicated revaluation journal entries in Phase 3.

---

## 9. Conclusion

The architectural intent for FinVault R2 and R3 is well-conceived in `docs/04`, `docs/02`, `docs/09`, and `docs/10-ADR.md`, but **zero code or migration files currently exist in the repository**. 

Key implementation priorities identified:
1. Initialize the monorepo structure with `packages/db-types` and `packages/sync-engine`.
2. Author the complete, production-grade Supabase migration file `supabase/migrations/20261108000000_initial_schema.sql` including:
   - All monetary fields as `BIGINT` minor units.
   - Comprehensive RLS policies isolating users by `auth.uid() = user_id`.
   - The deferred constraint trigger enforcing $\sum debits == \sum credits$.
   - Automatic account balance maintenance trigger.
   - Automatic user account bootstrapping trigger on `auth.users`.
3. Provide the matching SQLite DDL and client-side sync queue tables in `packages/sync-engine`.
4. Update `docs/05-SECURITY-AND-COMPLIANCE.md` and the outdated references in `.agents/skills/db-migration-and-sync/SKILL.md` and `verify-and-record/SKILL.md`.

---

## 10. Verification Method

To verify the findings and future implementation of R2 and R3:
1. **Inspect Schema & Migrations**:
   - Verify `supabase/migrations/20261108000000_initial_schema.sql` contains all 5 core tables, enums, RLS policies, and the `trg_verify_transaction_balance` deferred constraint trigger.
2. **Verify Minor Units Invariant**:
   - Audit SQL and TypeScript interfaces: check that no table uses `NUMERIC` with decimals, `REAL`, or `FLOAT` for amounts. All amount columns must be `BIGINT` or `INTEGER` in SQLite.
3. **Verify Trigger Abort Behavior**:
   - Execute SQL test script inserting an unbalanced split:
     ```sql
     BEGIN;
     INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description)
     VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', gen_random_uuid(), CURRENT_DATE, 'Test');
     INSERT INTO journal_entries (user_id, transaction_id, account_id, amount_minor, direction)
     VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 10000, 'DEBIT');
     COMMIT; -- Must fail with error P0001
     ```
4. **Verify RLS Isolation**:
   - Query tables with `SET ROLE authenticated; SET request.jwt.claim.sub = 'user-a-uuid';` and ensure records for `'user-b-uuid'` return 0 rows.
5. **Verify Fast-Check Property Tests**:
   - Run `pnpm test` in `packages/sync-engine` and `apps/web` to confirm property-based tests verify debits == credits across thousands of generated multi-split transactions.
