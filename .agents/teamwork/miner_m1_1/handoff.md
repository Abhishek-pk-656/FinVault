# Milestone 1 Governance & Documentation Realignment Specification

**State Folder:** `d:\programming\New_project\.agents\teamwork\miner_m1_1`  
**Author:** M1 Governance & Docs Spec Miner (`miner_m1_1`)  
**Parent Conversation ID:** `867b8adb-e639-414f-92fa-0326940898a2`  
**Date:** 2026-11-08  

---

## 1. Observation

A systematic audit was conducted across the root governance documents, `.agents/rules/`, `.agents/skills/`, and `docs/01` through `docs/11`. The audit revealed critical architectural discrepancies, stale legacy references, defective trigger globs, and an incomplete database constraint trigger:

1. **Stale References to FastAPI, Pytest, Hypothesis, Loguru, and Alembic:**
   - **`docs/05-SECURITY-AND-COMPLIANCE.md:4`**: 
     > *"Local desktop API secured via local bearer token auth."*  
     Omits Supabase Auth, Google OAuth (Gmail sign-in), PKCE token handling, and Row Level Security (RLS) policies.
   - **`docs/06-TESTING-AND-QA.md:3`**: 
     > *"Use `Pytest` and `Hypothesis` to generate thousands of randomized monetary splits, partial loan repayments, and currency conversions, verifying the invariant: `SUM(debits) == SUM(credits)`."*  
     Entirely references Python-based test tooling (`Pytest` + `Hypothesis`), whereas the project stack is TypeScript with Turborepo, requiring **Vitest** and **`fast-check`**.
   - **`docs/07-DEPLOYMENT-AND-OBSERVABILITY.md:3-4`**: 
     > *"1. Local Development Stack: Started via `docker compose up -d` running PostgreSQL and FastAPI.*  
     > *2. Logging & Diagnostics: Structured JSON logging (`Loguru`) for API requests and database sync events."*  
     Phase 1 uses Supabase (managed cloud PostgreSQL 16 + PostgREST + Edge Functions) and Supabase CLI local development, while Docker Compose + FastAPI + Loguru belongs exclusively to the future self-hosted roadmap.
   - **`docs/08-STANDARDS-AND-CHANGELOG.md:3`**: 
     > *"1. Type Safety: Strict TypeScript on frontend, Pydantic v2 validation on FastAPI backend."*  
     Stale reference to Pydantic v2 and FastAPI backend; Phase 1 backend validation is handled via Supabase PostgreSQL constraints/triggers and Deno/TypeScript Edge Functions with Zod.
   - **`.agents/skills/db-migration-and-sync/SKILL.md:9`**: 
     > *"1. Generate an Alembic migration in Python for FastAPI backend modifications."*  
     Direct conflict with Supabase SQL migrations in `supabase/migrations/` and client SQLite schema in `packages/sync-engine`.
   - **`.agents/skills/verify-and-record/SKILL.md:9`**: 
     > *"1. Run `pytest` with property-based financial ledger tests."*  
     Direct conflict with workspace Vitest + `fast-check` test runner (`pnpm test`).

2. **Incomplete Double-Entry Trigger in `docs/04-DATABASE-SCHEMA.md:121-140`:**
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
   *Flaws observed:*
   - Missing exception raise: It calculates sums but never compares them or raises an exception on imbalance.
   - Crashes on `DELETE`: Accessing `NEW.transaction_id` on a `DELETE` operation produces a null reference. Must use `COALESCE(NEW.transaction_id, OLD.transaction_id)`.
   - Missing constraint trigger binding: No `CREATE CONSTRAINT TRIGGER` exists. Without `DEFERRABLE INITIALLY DEFERRED`, an immediate row trigger would abort the first unbalanced insert before subsequent balancing legs can be posted.
   - Missing companion triggers: Account balance update trigger (`trg_update_account_balance`), user bootstrap trigger (`trg_on_auth_user_created`), and atomic transaction RPC (`post_transaction`) referenced in `PROJECT.md` are absent.

3. **Defective Rule Triggers in `.agents/rules/`:**
   - **`.agents/rules/01-financial-ledger-safety.md:2`**: `trigger: glob("**/backend/**")`. The monorepo has no `backend/` directory; code lives in `supabase/**`, `packages/sync-engine/**`, `packages/db-types/**`, and `apps/**`. Consequently, this critical safety rule never fires. Furthermore, line 8 permits `NUMERIC(19,4)`, conflicting with the non-negotiable `BIGINT` minor units rule.
   - **`.agents/rules/02-frontend-mobile-standards.md:2`**: `trigger: glob("**/frontend/**")`. The monorepo has no `frontend/` directory; code lives in `apps/web/**`, `apps/mobile/**`, and `packages/ui/**`. This rule also never fires.

4. **Roadmap and Task Disconnect in `TASKS.md`:**
   - `TASKS.md` currently lists legacy tasks (Milestones 1.1–1.6, Phase 2, Phase 3) that do not align with the master 6-milestone execution structure defined in `PROJECT.md` (M1: Governance & Monorepo, M2: Schema & Triggers, M3: Sync & Edge Functions, M4: UI & Web Cockpit, M5: Mobile App, M6: E2E Verification).

---

## 2. Logic Chain

1. **System Topology Reality:** The project uses a Turborepo monorepo with `apps/web` (Next.js 14+), `apps/mobile` (Expo React Native), and shared `packages/` (`db-types`, `sync-engine`, `ui`), backed by Supabase (PostgreSQL 16, Google OAuth, PostgREST, Edge Functions).
2. **Context Trigger Validity:** Because agents rely on context-triggered rules in `.agents/rules/`, triggers matching nonexistent globs (`**/backend/**`, `**/frontend/**`) completely disable rule enforcement. Updating triggers to `**/{supabase,packages,apps}/**` restores automated guardrails.
3. **Double-Entry Enforcement Guarantee:** Double-entry bookkeeping requires multi-row inserts (at least 1 debit and 1 credit) within a single transaction. In PostgreSQL, this requires a `CONSTRAINT TRIGGER` marked `DEFERRABLE INITIALLY DEFERRED` so that validation runs at commit time. The function must compute the sum of debits and credits for the transaction ID, ensure non-zero activity, and raise an explicit `check_violation` exception if $\sum \text{debits} \ne \sum \text{credits}$.
4. **Toolchain Consistency:** Replacing Python/FastAPI/Pytest/Hypothesis with TypeScript/Supabase/Vitest/fast-check across all documentation and skills eliminates developer confusion while preserving self-hosted Docker + FastAPI in dedicated "Future Scope / Roadmap" sections for air-gapped deployments.
5. **Execution Synchronization:** Realiging `TASKS.md` with `PROJECT.md` establishes single-source-of-truth milestone tracking for all workers and reviewers.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Governance | Living Plan Protocol Alignment | 4-step Propose-Approve-Propagate protocol for all architectural and documentation changes | Change proposal | Updated `docs/`, `ADR.md`, `CHANGELOG.md` | Rejection if unapproved | `.agents/rules/00-living-plan-protocol.md` |
| 2 | Governance | Financial Ledger Safety Rule | Enforces strict `BIGINT` minor units (zero floats), debit==credit, and SHA-256 deduplication | Ingestion payloads, transactions | Validated minor unit records | Immediate validation error / trigger abort | `.agents/rules/01-financial-ledger-safety.md` |
| 3 | Governance | Botanical Minimalist UI Standards | Enforces Venzer design tokens, max 3 visual groups, max 3 attributes/row, <180ms transitions | UI components, page layouts | Compliant UI screens | Lint/review rejection if cluttered | `.agents/rules/02-frontend-mobile-standards.md` |
| 4 | Governance | Plan Evolution Skill Realignment | Operating procedure for documentation changes preserving Supabase vs Future Scope separation | User change requests | Propagated doc changes + ADR | Handoff rejection on stale state | `.agents/skills/evolve-plan/SKILL.md` |
| 5 | Governance | Database Migration & Sync Skill | Operating procedure for Supabase PostgreSQL SQL DDL and SQLite parity schema | Schema changes | Timestamped SQL migration + SQLite DDL | Rejection if float or untyped | `.agents/skills/db-migration-and-sync/SKILL.md` |
| 6 | Governance | Verify and Record Skill | Operating procedure for Vitest + `fast-check` execution, build checks, and task tracking | Test execution command | Test reports + `TASKS.md` updates | Build/test failure aborts recording | `.agents/skills/verify-and-record/SKILL.md` |
| 7 | Governance | Milestone Execution Tracker Realignment | Aligning `TASKS.md` to reflect M1–M6 roadmap from `PROJECT.md` | Milestone progress | Granular task checklist | Unchecked box if incomplete | `TASKS.md`, `PROJECT.md` |
| 8 | Governance | Changelog Realignment | Documenting M1 architecture realignment in `CHANGELOG.md` | Milestone 1 deliverables | SemVer change log entry | Audit failure if missing | `CHANGELOG.md` |
| 9 | Database | Server-Side Deferred Constraint Trigger | PL/pgSQL function and deferred constraint trigger aborting non-balancing transactions | `journal_entries` rows | Validated commit | `RAISE EXCEPTION` (check_violation) | `docs/04-DATABASE-SCHEMA.md` |
| 10 | Database | Dynamic Balance Maintenance Trigger | PostgreSQL trigger dynamically maintaining `accounts.balance_minor` based on account type | Insert/Update/Delete on journal entries | Updated account balance | Trigger failure on missing account | `docs/04-DATABASE-SCHEMA.md`, `PROJECT.md` |
| 11 | Database | User Bootstrap Account Trigger | Trigger on `auth.users` creating initial Cash, Bank, Expense, and Income accounts on signup | New Supabase user row | Default 4 accounts inserted | Sign-up abort if provisioning fails | `docs/04-DATABASE-SCHEMA.md`, `PROJECT.md` |
| 12 | Database | Atomic Transaction RPC (`post_transaction`) | Stored function atomically inserting header and balanced journal entries in a single round-trip | JSON payload with entries | Transaction header + entries | HTTP 400 / rollback on imbalance | `docs/04-DATABASE-SCHEMA.md`, `docs/09-API-CONTRACTS.md` |
| 13 | Database | Client SQLite Parity & `sync_queue` Schema | Matching local SQLite DDL with 64-bit integers and mutation outbox table | Local mutations | Queued change records | Write failure on invalid types | `docs/04-DATABASE-SCHEMA.md`, `PROJECT.md` |
| 14 | Security | Supabase Auth & Google OAuth Baseline | Google OAuth (Gmail) sign-in with PKCE flow and secure session tokens | User OAuth authorization code | Supabase JWT session | OAuth error / rejection | `docs/05-SECURITY-AND-COMPLIANCE.md` |
| 15 | Security | Row Level Security (RLS) Isolation | Multi-tenant row isolation enforcing `auth.uid() = user_id` across all tables | PostgREST queries | Isolated tenant records | 0 rows returned / 403 Forbidden | `docs/05-SECURITY-AND-COMPLIANCE.md` |
| 16 | Security | Mobile Biometric Authentication | Local app lock using `expo-local-authentication` guarding local SQLite keys | Fingerprint / FaceID | Decrypted master key | App lock on biometric mismatch | `docs/05-SECURITY-AND-COMPLIANCE.md` |
| 17 | Testing | Vitest + `fast-check` Property Testing | Randomized property tests for multi-split debit==credit equality and integer arithmetic | Randomized transaction splits | Pass/Fail report | Shrink counterexample on invariant break | `docs/06-TESTING-AND-QA.md` |
| 18 | Testing | 4-Tier Automated Verification Architecture | Verification tiers (Unit/Invariant, DB Triggers, Sync Engine, E2E Cockpit) | Test harness commands | Verification matrix | Test suite failure | `docs/06-TESTING-AND-QA.md` |
| 19 | Deployment | Supabase Cloud & Local Dev Architecture | Supabase CLI (`supabase start`) + Turborepo dev runner (`pnpm dev`) | Dev startup commands | Running local stack | Port conflict or CLI error | `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md` |
| 20 | Deployment | Client & Edge Structured Logging | Structured JSON logging for sync engine and Supabase Edge Functions | Sync events, RPC calls | Cloud & client logs | Unlogged PII prevented | `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md` |
| 21 | Standards | Monorepo Strict TypeScript Standards | Root TypeScript configuration, generated `db-types`, Zod schemas, zero floats | Source code | Compiled bundle | Typecheck error (`tsc --noEmit`) | `docs/08-STANDARDS-AND-CHANGELOG.md` |
| 22 | Architecture | ADR-009 & ADR-010 Integration | Architecture decision records for Vitest/fast-check and Turborepo monorepo | Architecture decisions | Recorded ADRs in `docs/10-ADR.md` | Undocumented design drift prevented | `docs/10-ADR.md` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Double-Entry Trigger | Multi-row transaction insert with balanced debits and credits inserted one row at a time | With standard trigger, 1st insert aborts. With `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, checks defer to commit time and succeed. |
| 2 | Double-Entry Trigger | Journal entry `DELETE` removing one leg of a transaction | Accessing `NEW.transaction_id` crashes with null error. Handled via `COALESCE(NEW.transaction_id, OLD.transaction_id)` and triggers imbalance exception. |
| 3 | Double-Entry Trigger | Transaction with zero journal entries or $\sum debits = 0$ | Explicit check raises exception: `Transaction must have at least one debit and one credit with non-zero amounts`. |
| 4 | Double-Entry Trigger | Multi-currency transaction legs | Checked against single account currency or conversion balancing rate in minor units. |
| 5 | Financial Safety Rule | User enters currency with decimal points (`12.34`) in API/RPC | Client/Edge parser immediately converts to `1234` minor units (`BIGINT`); float values in database mutations are strictly rejected by integer typing. |
| 6 | Rule Trigger Globs | Developer edits `apps/web/pages/index.tsx` or `packages/ui/Card.tsx` | Old glob `**/frontend/**` failed to trigger; new glob `**/{apps/web,apps/mobile,packages/ui}/**` activates design system guardrail. |
| 7 | Rule Trigger Globs | Developer edits `supabase/migrations/001.sql` or `packages/sync-engine/db.ts` | Old glob `**/backend/**` failed to trigger; new glob `**/{supabase,packages,apps}/**` activates financial ledger safety guardrail. |
| 8 | Sync Replay | Offline client posts unbalanced split | Local SQLite trigger rejects write immediately; if bypassed, Supabase deferred trigger aborts remote commit during sync push. |

---

## 5. Concrete, Line-by-Line Edit & Content Specification for Worker

The Worker agent must apply the following exact modifications across the repository.

### File 1: `.agents/rules/01-financial-ledger-safety.md`
**Path:** `d:\programming\New_project\.agents\rules\01-financial-ledger-safety.md`  
**Purpose:** Fix defective glob trigger and eliminate `NUMERIC(19,4)` loophole to strictly enforce `BIGINT` minor units.

**Full Replacement Content:**
```markdown
---
trigger: glob("**/{supabase,packages,apps}/**")
description: Enforces strict accounting invariants, minor unit integer storage, and property testing for financial transactions.
---

# Rule: Financial Ledger & Data Safety

1. **Integer Minor Units Only:** Never use floating-point numbers (`float`/`double`) or arbitrary decimals for currency. Store and calculate all amounts strictly as 64-bit integer minor units (`BIGINT` in PostgreSQL, `INTEGER` in SQLite, `bigint` in TypeScript) representing cents or paise. Zero floating-point arithmetic is permitted.
2. **Double-Entry Invariant:** Every posted transaction must maintain strict debit-credit balance equality ($\sum \text{debits} == \sum \text{credits}$). Enforced server-side via PostgreSQL deferred constraint triggers and verified in code via Vitest + `fast-check` property tests.
3. **Idempotency & Deduplication:** All transaction ingestion operations (manual entry, split settlement, bank imports, Android notification parsers) must enforce cryptographic deduplication (`UUID` idempotency keys or SHA-256 hashes of date + minor amount + normalized description).
```

---

### File 2: `.agents/rules/02-frontend-mobile-standards.md`
**Path:** `d:\programming\New_project\.agents\rules\02-frontend-mobile-standards.md`  
**Purpose:** Fix defective glob trigger so that rule fires on modern monorepo paths (`apps/web`, `apps/mobile`, `packages/ui`).

**Full Replacement Content:**
```markdown
---
trigger: glob("**/{apps/web,apps/mobile,packages/ui}/**")
description: Enforces the FinVault Botanical Minimalist design system, uncluttered layouts, and fast <180ms fluid micro-transitions.
---

# Rule: Frontend & Mobile UI/UX Standards

1. **Color Palette & Tokens:** Use the Botanical Minimalist palette strictly:
   - Obsidian Carbon background: `#040A0A`
   - Soft Mint surface/accent: `#DEEEDA`
   - Sage Pistachio secondary: `#C7E0BA`
   - Botanical Green primary action: `#7AAA4A`
   - Muted Sage borders/text: `#90A999`
   - Charcoal Slate text/headers: `#38424C`
2. **Layout Simplicity & Anti-Clutter:** Keep screens uncluttered. Maximum 3 visual component groups per view, maximum 3 data attributes per row, and consistent `24px` (`rounded-3xl`) container radii.
3. **Transitions & Animations:** Zero heavy animations, bouncy springs, or long loaders. All page transitions and state changes must be fluid, fast, and smooth (`120ms`–`180ms` GPU-composited opacity and transform fades).
```

---

### File 3: `.agents/skills/db-migration-and-sync/SKILL.md`
**Path:** `d:\programming\New_project\.agents\skills\db-migration-and-sync\SKILL.md`  
**Purpose:** Remove stale Alembic/FastAPI references and align with Supabase SQL migrations and SQLite client parity.

**Full Replacement Content:**
```markdown
---
name: db-migration-and-sync
description: Procedure for creating safe database migrations, configuring PostgreSQL triggers/RLS, and ensuring client SQLite parity.
---

# Skill: Database Migration & Sync

When executing this skill:
1. Create timestamped PostgreSQL SQL migrations under `supabase/migrations/<timestamp>_<name>.sql`.
2. Ensure all monetary columns are typed as `BIGINT NOT NULL` minor units with check constraints (`> 0` for journal entries).
3. Bind the deferred constraint trigger `trg_verify_transaction_balance` on `journal_entries` for double-entry integrity.
4. Define Row Level Security (RLS) policies on every table with `USING (auth.uid() = user_id)`.
5. Update client SQLite schema DDL in `packages/sync-engine` to maintain 1:1 parity with PostgreSQL tables and constraints.
6. Regenerate database TypeScript interfaces in `packages/db-types`.
7. Preserve self-hosted Alembic migration notes under "Future Roadmap" only.
```

---

### File 4: `.agents/skills/verify-and-record/SKILL.md`
**Path:** `d:\programming\New_project\.agents\skills\verify-and-record\SKILL.md`  
**Purpose:** Replace stale `pytest` with Vitest + `fast-check` and workspace verification commands.

**Full Replacement Content:**
```markdown
---
name: verify-and-record
description: Procedure for running test suites, verifying financial invariants with Vitest and fast-check, and updating TASKS.md and CHANGELOG.md.
---

# Skill: Verify and Record

When executing this skill:
1. Run property-based financial ledger tests using Vitest and `fast-check`: `pnpm test` (or `pnpm --filter @finvault/sync-engine test`).
2. Verify PostgreSQL constraint triggers by executing automated migration and trigger validation scripts.
3. Verify monorepo build and type safety: `pnpm turbo build` and `pnpm typecheck`.
4. Update `TASKS.md` marking completed deliverables.
5. Record release notes in `CHANGELOG.md` under `[Unreleased]` and update `docs/10-ADR.md` when architectural decisions change.
```

---

### File 5: `.agents/skills/evolve-plan/SKILL.md`
**Path:** `d:\programming\New_project\.agents\skills\evolve-plan\SKILL.md`  
**Purpose:** Align plan evolution procedure with Living Plan Protocol and Supabase architecture.

**Full Replacement Content:**
```markdown
---
name: evolve-plan
description: Procedure for proposing and executing changes to the project plan, architecture, or documentation suite.
---

# Skill: Evolve Project Plan

When executing this skill:
1. Review the requested change from the user, verifying adherence to `.agents/rules/00-living-plan-protocol.md`.
2. Check that core invariants (no floating-point money, double-entry equality, RLS tenant isolation) are preserved.
3. Identify all affected documentation files in `docs/` (`01` through `11`).
4. Draft a proposal detailing rationale, advantages, disadvantages, and impacted packages.
5. Prompt the user for explicit approval.
6. Once approved, propagate changes across affected `docs/*.md`, `docs/10-ADR.md`, `TASKS.md`, and `CHANGELOG.md`.
```

---

### File 6: `docs/04-DATABASE-SCHEMA.md`
**Path:** `d:\programming\New_project\docs\04-DATABASE-SCHEMA.md`  
**Purpose:** Complete the deferred constraint trigger function with explicit `RAISE EXCEPTION`, trigger binding, balance maintenance trigger, user bootstrap trigger, atomic transaction RPC, and SQLite client parity schema with `sync_queue`.

**Full Replacement Content:**
```markdown
# Database Schema & Migrations — FinVault

## 1. Core Principles
* **Minor Currency Units (`BIGINT`):** All monetary amounts stored as minor units (e.g., paise/cents) with ISO 4217 currency code. Zero floating-point arithmetic.
* **Double-Entry Lite Invariant:** Every financial transaction contains balanced journal entries where $\sum \text{debits} = \sum \text{credits}$.
* **User Isolation (Row-Level Security):** Every row is tied to `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` with RLS policies enabled.
* **Optimistic Concurrency & Soft Deletes:** Syncable tables include `version BIGINT NOT NULL DEFAULT 1` and `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`.

---

## 2. PostgreSQL DDL (Supabase Migration)

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Accounts
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    type account_type NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    balance_minor BIGINT NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own accounts"
    ON accounts FOR ALL USING (auth.uid() = user_id);

-- Transactions
CREATE TABLE transactions (
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

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own transactions"
    ON transactions FOR ALL USING (auth.uid() = user_id);

-- Journal Entries (Balanced Debits & Credits)
CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    direction entry_direction NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own journal entries"
    ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Peer Lending & IOU
CREATE TYPE iou_direction AS ENUM ('LENT', 'BORROWED');
CREATE TYPE iou_status AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF');

CREATE TABLE iou_records (
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
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE iou_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own IOUs"
    ON iou_records FOR ALL USING (auth.uid() = user_id);

-- Sinking Funds & Savings Goals
CREATE TABLE sinking_funds (
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
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE sinking_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own sinking funds"
    ON sinking_funds FOR ALL USING (auth.uid() = user_id);
```

---

## 3. Server-Side Double-Entry Deferred Constraint Trigger

Transactions are validated at commit time. The trigger computes the total debits and credits for the affected transaction and raises an exception if they are not strictly equal or if no entries exist:

```sql
CREATE OR REPLACE FUNCTION verify_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    target_tx_id UUID;
    total_debits BIGINT;
    total_credits BIGINT;
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
$$ LANGUAGE plpgsql;

-- Bind as a DEFERRED constraint trigger
DROP TRIGGER IF EXISTS trg_verify_transaction_balance ON journal_entries;
CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_transaction_balance();
```

---

## 4. Account Balance Maintenance Trigger

Maintains `accounts.balance_minor` dynamically as journal entries are posted or adjusted:

```sql
CREATE OR REPLACE FUNCTION update_account_balance_on_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_account_id UUID;
    v_type account_type;
    v_delta BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT type INTO v_type FROM accounts WHERE id = NEW.account_id;
        IF v_type IN ('ASSET', 'EXPENSE') THEN
            v_delta := CASE WHEN NEW.direction = 'DEBIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        ELSE
            v_delta := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
        END IF;
        UPDATE accounts SET balance_minor = balance_minor + v_delta, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT type INTO v_type FROM accounts WHERE id = OLD.account_id;
        IF v_type IN ('ASSET', 'EXPENSE') THEN
            v_delta := CASE WHEN OLD.direction = 'DEBIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        ELSE
            v_delta := CASE WHEN OLD.direction = 'CREDIT' THEN -OLD.amount_minor ELSE OLD.amount_minor END;
        END IF;
        UPDATE accounts SET balance_minor = balance_minor + v_delta, updated_at = NOW() WHERE id = OLD.account_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_balance ON journal_entries;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION update_account_balance_on_journal();
```

---

## 5. User Bootstrap Account Provisioning Trigger

Provisions default foundational accounts upon new user signup via Supabase Auth:

```sql
CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO accounts (user_id, name, type, currency, balance_minor)
    VALUES
        (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
        (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
        (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
        (NEW.id, 'Primary Income', 'INCOME', 'INR', 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_provisioning();
```

---

## 6. Atomic Transaction RPC (`post_transaction`)

```sql
CREATE OR REPLACE FUNCTION post_transaction(
    p_idempotency_key UUID,
    p_transaction_date DATE,
    p_description VARCHAR(255),
    p_notes TEXT,
    p_entries JSONB
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_tx_id UUID;
    v_entry JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 7. Client SQLite Schema Parity & Mutation Queue Outbox

The client SQLite schema (`packages/sync-engine`) mirrors these tables using 64-bit `INTEGER` minor units and includes the mutation queue table (`sync_queue`) for offline replay:

```sql
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
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
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS iou_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    counterparty_name TEXT NOT NULL,
    counterparty_contact TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('LENT', 'BORROWED')),
    principal_minor INTEGER NOT NULL CHECK (principal_minor > 0),
    remaining_balance_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'OPEN',
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
    allocated_amount_minor INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- Offline Mutation Queue Outbox
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_FLIGHT', 'FAILED')),
    retry_count INTEGER NOT NULL DEFAULT 0
);
```
```

---

### File 7: `docs/05-SECURITY-AND-COMPLIANCE.md`
**Path:** `d:\programming\New_project\docs\05-SECURITY-AND-COMPLIANCE.md`  
**Purpose:** Realign security baseline to Supabase Auth, Google OAuth, Row Level Security, client-side biometrics, and preserve self-hosted security in Future Scope.

**Full Replacement Content:**
```markdown
# Security & Compliance Baseline — FinVault

## 1. Authentication & Session Security (Phase 1)
* **Identity Provider:** Supabase Auth with Google OAuth (Gmail sign-in) utilizing PKCE (Proof Key for Code Exchange) flow.
* **Token Management:** Standard JSON Web Tokens (JWT) issued by Supabase Auth with short-lived access tokens and secure refresh tokens.
* **Web Client Storage:** Secure, HTTP-only, SameSite cookies managed via `@supabase/ssr`.
* **Mobile Client Storage:** Session tokens and cryptographic master keys stored in device-native secure hardware storage (`expo-secure-store` on Android Keystore / iOS Keychain).
* **Biometric Guard:** Mobile application unlock optionally protected by device biometrics via `expo-local-authentication` (Fingerprint/FaceID) before exposing local SQLite data.

## 2. Multi-Tenant Data Isolation (Row Level Security)
* **RLS Mandate:** PostgreSQL Row Level Security (RLS) is enabled and enforced on 100% of tables containing user data (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`).
* **Tenant Isolation Guarantee:** Every policy enforces `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`. Unauthenticated requests or cross-tenant query attempts return 0 rows or reject with HTTP 403 Forbidden.
* **Foreign Key Isolation:** Composite foreign keys ensure accounts referenced in journal entries belong to the exact same `user_id`.

## 3. Secrets Management & API Posture
* **Public Client Anon Key:** The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is embedded in Web and Mobile builds and is strictly constrained by PostgreSQL RLS.
* **Privileged Service Role Key:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is strictly confined to secure administrative scripts and server environments; it is never included in client bundles.
* **Zero Telemetry:** The client applications transmit zero telemetry, tracking beacons, or analytical logs to third-party endpoints.

## 4. Future Scope: Self-Hosted Air-Gapped Security Baseline
* **Local Bearer Token Auth:** In self-hosted air-gapped mode, client applications authenticate directly with the local FastAPI backend using local Argon2id password hashes and local JWT bearer tokens.
* **Local LAN mDNS:** Network discovery and sync restricted to the user's encrypted local Wi-Fi network without cloud dependency.
```

---

### File 8: `docs/06-TESTING-AND-QA.md`
**Path:** `d:\programming\New_project\docs\06-TESTING-AND-QA.md`  
**Purpose:** Replace Pytest and Hypothesis with Vitest and `fast-check` and detail the 4-tier verification architecture.

**Full Replacement Content:**
```markdown
# Testing & Verification Strategy — FinVault

## 1. Test Architecture & Toolchain
* **Primary Test Runner:** **Vitest** configured across Turborepo workspace packages (`packages/*`, `apps/*`).
* **Property-Based Testing Engine:** **`fast-check`** (TypeScript) generating thousands of randomized transactions, split allocations, and edge cases to prove invariants mathematically.
* **Database & Trigger Verification:** SQL trigger test scripts validating PostgreSQL constraint triggers, balance calculations, and RLS isolation.
* **E2E Testing:** Playwright for desktop web cockpit and Expo testing utilities for React Native mobile flows.

---

## 2. Verification Tiers

### Tier 1: Unit & Invariant Testing (Vitest + `fast-check`)
* **Double-Entry Invariant:** `fast-check` generates multi-leg transactions with random amounts (1 to $10^{12}$ minor units) across $N$ splits ($2 \le N \le 20$), verifying:
  $$\sum_{i} \text{amount}_{\text{debit}, i} == \sum_{j} \text{amount}_{\text{credit}, j}$$
* **Strict Integer Minor Units:** Asserts all amounts are integers (`bigint`); rejects any input with fractional values, `NaN`, or floating-point numbers.
* **Design Token Compliance:** Asserts shared UI components in `packages/ui` only emit Botanical Minimalist tokens and transitions $\le 180\text{ms}$.

### Tier 2: Supabase Schema, Triggers & RLS Integration
* **Constraint Trigger Abort Test:** Verifies that inserting an unbalanced transaction into `journal_entries` causes `trg_verify_transaction_balance` to raise an explicit exception and rollback the commit.
* **Account Balance Update Test:** Verifies that posting or deleting journal entries accurately updates `accounts.balance_minor` according to account type rules.
* **RLS Cross-Tenant Isolation:** Verifies that User A cannot read, insert, update, or delete records belonging to User B.

### Tier 3: Sync Engine & Conflict Resolution
* **Mutation Outbox Queue:** Verifies optimistic local SQLite writes persist to `sync_queue`.
* **LWW Conflict Resolution:** Generates concurrent edits with varying timestamps to confirm deterministic state convergence.
* **Idempotency Replay:** Replaying previously synced mutations produces no duplicate entries.

### Tier 4: End-to-End Application Flows
* **Web Cockpit:** Playwright tests verifying Net Worth aggregation, Cash Flow calculations, multi-split transaction entry with live balance validation badge, and IOU ledger settlements.
* **Mobile App:** Tests verifying offline transaction entry in SQLite and automatic sync when network connectivity is simulated.

---

## 3. Future Roadmap: Self-Hosted Backend Testing
* Retains `Pytest` and `Hypothesis` test harness specifications for the future self-hosted Python FastAPI backend.
```

---

### File 9: `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md`
**Path:** `d:\programming\New_project\docs\07-DEPLOYMENT-AND-OBSERVABILITY.md`  
**Purpose:** Realign Phase 1 deployment to Supabase cloud, Supabase CLI local dev, and structured logging, relegating Docker Compose and Loguru to Future Scope.

**Full Replacement Content:**
```markdown
# Deployment & Observability — FinVault

## 1. Cloud Infrastructure & Platform (Phase 1)
* **Cloud Database & Auth:** Managed Supabase Platform (PostgreSQL 16 + pgvector + Supabase Auth + PostgREST).
* **Web Cockpit Hosting:** Next.js 14+ App Router deployed on Vercel or Node.js container with `@supabase/ssr`.
* **Mobile Client Distribution:** Expo EAS (Expo Application Services) building Android APK / AAB bundles with local SQLite (`op-sqlite` / `SQLCipher`).

## 2. Local Development Environment
* **Workspace Orchestration:** Turborepo with `pnpm` (`pnpm dev`, `pnpm build`, `pnpm test`).
* **Supabase Local CLI:** Local backend development using the official Supabase CLI:
  ```bash
  supabase start          # Starts local PostgreSQL, PostgREST, Auth, and Studio
  supabase db reset       # Applies migrations from supabase/migrations/
  supabase functions serve # Serves Edge Functions locally
  ```

## 3. Observability, Logging & Diagnostics
* **Database & API Metrics:** Supabase Studio dashboard monitors active connections, query latencies, and PostgREST throughput.
* **Client-Side Sync Diagnostics:** `packages/sync-engine` provides a structured JSON logger capturing sync cycle states, queue lengths, HTTP retry counts, and latency, strictly omitting sensitive financial PII.
* **Edge Function Logging:** Deno structured console logs streamed to Supabase log drains.

## 4. Backups & Data Sovereignty
* **Cloud Backups:** Supabase automated daily backups and point-in-time recovery (PITR).
* **Client Snapshots:** One-click encrypted `.finvault` portable export generated from client SQLite store.

---

## 5. Future Scope: Self-Hosted Docker Deployment
* **Container Stack:** Multi-container `docker-compose.yml` deploying PostgreSQL 16, pgvector, and Python FastAPI backend.
* **Diagnostics:** Structured JSON logging using Python `Loguru` for local backend request tracing.
* **Local Wi-Fi Sync:** mDNS local network peer discovery for air-gapped offline synchronization.
```

---

### File 10: `docs/08-STANDARDS-AND-CHANGELOG.md`
**Path:** `d:\programming\New_project\docs\08-STANDARDS-AND-CHANGELOG.md`  
**Purpose:** Replace FastAPI/Pydantic v2 with strict TypeScript monorepo standards, schema type generation, and changelog governance.

**Full Replacement Content:**
```markdown
# Coding Standards & Change Protocol — FinVault

## 1. Type Safety & Validation Standards
* **Monorepo Strict TypeScript:** Every package in the workspace enforces `strict: true`, `noImplicitAny: true`, and `exactOptionalPropertyTypes: true` in `tsconfig.base.json`.
* **Database Type Synchronization:** All database types are generated from PostgreSQL schema and exported via `packages/db-types` for type-safe PostgREST client queries.
* **Edge Functions & API Validation:** Supabase Edge Functions validate incoming JSON payloads using **Zod** schemas.
* **Monetary Values Rule:** All monetary fields in code and database must use integer minor units (`bigint`). Floating-point types (`number` with decimals) for currency are prohibited.

## 2. Code Quality & Formatting
* **Linting & Formatting:** ESLint with TypeScript rules and Prettier configured across the monorepo.
* **Design System Conformance:** Frontend code in `apps/web`, `apps/mobile`, and `packages/ui` must adhere to `.agents/rules/02-frontend-mobile-standards.md` (Botanical Minimalist tokens, $\le 3$ visual groups, transitions $\le 180\text{ms}$).

## 3. Changelog & Architecture Evolution Mandate
* **Living Plan Protocol:** Architectural adjustments must follow `.agents/rules/00-living-plan-protocol.md`.
* **Changelog Updates:** Completed milestones, architectural adjustments, and library changes must be documented in `CHANGELOG.md` under `[Unreleased]` and recorded in `docs/10-ADR.md`.

---

## 4. Future Scope: Self-Hosted Backend Standards
* **Python Backend:** Pydantic v2 data models, `mypy` strict type checking, and `Black` formatting reserved for the self-hosted FastAPI backend on the future roadmap.
```

---

### File 11: `docs/10-ADR.md`
**Path:** `d:\programming\New_project\docs\10-ADR.md`  
**Purpose:** Append ADR-009 (Vitest + fast-check) and ADR-010 (Turborepo monorepo) to formally document the architectural decisions.

**Add Following Sections to `docs/10-ADR.md`:**
```markdown

## ADR-009: Vitest and fast-check for Property-Based Financial Testing
* **Status:** Accepted
* **Context:** The project requires exhaustive property-based testing of the double-entry invariant ($\sum \text{debits} == \sum \text{credits}$) and minor unit arithmetic. The initial draft referenced Python's `Pytest` and `Hypothesis`, but the core applications and sync engine are implemented in TypeScript.
* **Decision:** Adopt **Vitest** as the workspace test runner and **`fast-check`** as the property-based testing library. This provides native TypeScript type safety, seamless execution across monorepo packages, and high-speed in-memory invariant generation. `Pytest` and `Hypothesis` are retained solely in future roadmap documentation for self-hosted FastAPI.

## ADR-010: Turborepo Monorepo Architecture with Shared Packages
* **Status:** Accepted
* **Context:** The application spans Web (`apps/web`), Mobile (`apps/mobile`), and requires unified database types, sync protocol, and UI tokens without duplicate code.
* **Decision:** Adopt **Turborepo** with **pnpm** workspaces:
  - `packages/db-types`: Single source of truth for TypeScript database interfaces.
  - `packages/sync-engine`: Shared offline SQLite and delta sync protocol.
  - `packages/ui`: Shared Venzer Botanical Minimalist design system components.
  - Pipeline orchestration manages cached typechecking, building, and testing across all projects.
```

---

### File 12: `TASKS.md`
**Path:** `d:\programming\New_project\TASKS.md`  
**Purpose:** Realign the task checklist with the master 6-milestone execution plan from `PROJECT.md`.

**Full Replacement Content:**
```markdown
# Live Execution Tracker (TASKS.md)

## Master Execution Roadmap

### Milestone 1: Governance, Documentation & Monorepo Foundation
- [ ] **M1.1: Governance Rules & Skills Realignment**
  - [ ] Realign `.agents/rules/00-living-plan-protocol.md`, `01-financial-ledger-safety.md`, and `02-frontend-mobile-standards.md`.
  - [ ] Realign `.agents/skills/evolve-plan`, `db-migration-and-sync`, and `verify-and-record`.
  - [ ] Realign `AGENTS.md`, `TASKS.md`, and `CHANGELOG.md`.
- [ ] **M1.2: Architecture Documentation Realignment**
  - [ ] Update `docs/04-DATABASE-SCHEMA.md` with complete deferred constraint trigger and RPC specs.
  - [ ] Update `docs/05`, `docs/06`, `docs/07`, `docs/08` to Supabase, Vitest + `fast-check`, and Turborepo.
  - [ ] Add ADR-009 and ADR-010 to `docs/10-ADR.md`.
- [ ] **M1.3: Turborepo Monorepo Scaffolding**
  - [ ] Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`.
  - [ ] Scaffold `packages/db-types`, `packages/sync-engine`, and `packages/ui`.
  - [ ] Scaffold `apps/web` (Next.js 14+) and `apps/mobile` (Expo React Native).
  - [ ] Scaffold `supabase/migrations/` and `supabase/functions/`.

### Milestone 2: Supabase Schema, Triggers, RLS & Client SQLite Parity
- [ ] **M2.1: Supabase PostgreSQL DDL & Migrations**
  - [ ] Tables: `accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds` with `BIGINT` minor units.
  - [ ] RLS policies on all tables enforcing `auth.uid() = user_id`.
  - [ ] Deferred constraint trigger `trg_verify_transaction_balance` aborting unbalanced entries.
  - [ ] Balance maintenance trigger `trg_update_account_balance`.
  - [ ] User bootstrap trigger `trg_on_auth_user_created`.
  - [ ] Atomic `post_transaction` stored procedure.
- [ ] **M2.2: Client SQLite Schema & DB Types**
  - [ ] SQLite DDL in `packages/sync-engine` with `sync_queue` table.
  - [ ] TypeScript interfaces in `packages/db-types`.

### Milestone 3: Shared Packages, Auth, Sync Engine & Edge Functions
- [ ] **M3.1: Supabase Auth & Google OAuth Integration**
- [ ] **M3.2: Offline-First Delta Sync Engine (`packages/sync-engine`)**
  - [ ] Mutation outbox queue and push/pull delta protocol.
  - [ ] Last-Write-Wins (LWW) deterministic conflict resolution.
- [ ] **M3.3: Supabase Edge Functions**

### Milestone 4: Shared UI Library & Web Application Cockpit
- [ ] **M4.1: Botanical Minimalist Component Library (`packages/ui`)**
  - [ ] Tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`), 24px radius, <180ms transitions.
  - [ ] Card, Button, AmountInput, and BalanceBadge ($\Delta = \text{debits} - \text{credits}$) components.
- [ ] **M4.2: Web Application Cockpit (`apps/web`)**
  - [ ] Net Worth & Liquidity view.
  - [ ] Cash Flow & Trajectory view.
  - [ ] Multi-Split Transaction Entry with live balance validation badge.
  - [ ] IOU & Bilateral Debt Tracker view.

### Milestone 5: Mobile Application (Expo / React Native)
- [ ] **M5.1: Mobile Application Setup (`apps/mobile`)**
- [ ] **M5.2: Immediate Offline SQLite Writes (<50ms)**
- [ ] **M5.3: Background Sync Integration**
- [ ] **M5.4: Mobile Biometric Security Integration**

### Milestone 6: Final Verification & Test Suite Passing
- [ ] **M6.1: E2E Test Suite Execution (Tiers 1–4)**
- [ ] **M6.2: Adversarial Coverage Hardening (Tier 5)**
```

---

### File 13: `CHANGELOG.md`
**Path:** `d:\programming\New_project\CHANGELOG.md`  
**Purpose:** Record the Milestone 1 governance, documentation, and monorepo realignment under `[Unreleased]`.

**Replacement for Section `## [Unreleased]` in `CHANGELOG.md`:**
```markdown
## [Unreleased]
### Added
- Formulated Turborepo monorepo scaffolding specification with `apps/web`, `apps/mobile`, `packages/db-types`, `packages/sync-engine`, and `packages/ui` (`ADR-010`).
- Integrated Vitest and `fast-check` property-based testing architecture replacing legacy Pytest/Hypothesis references (`ADR-009`).
- Complete PostgreSQL deferred constraint trigger `trg_verify_transaction_balance` with explicit exception raising on unbalanced journal entries in `docs/04-DATABASE-SCHEMA.md`.
- Complete account balance maintenance trigger, user bootstrap trigger, and atomic transaction RPC (`post_transaction`) in `docs/04-DATABASE-SCHEMA.md`.
- Added client SQLite parity DDL and mutation outbox (`sync_queue`) schema in `docs/04-DATABASE-SCHEMA.md`.

### Changed
- Realigned `.agents/rules/01-financial-ledger-safety.md` and `02-frontend-mobile-standards.md` glob triggers to match modern monorepo directory layout (`supabase/**`, `packages/**`, `apps/**`).
- Realigned `.agents/skills/db-migration-and-sync` from Alembic/FastAPI to Supabase PostgreSQL migrations and SQLite parity.
- Realigned `.agents/skills/verify-and-record` from Pytest to workspace Vitest + `fast-check` runner.
- Updated `docs/05-SECURITY-AND-COMPLIANCE.md` to document Supabase Auth with Google OAuth, PKCE, and Row Level Security policies.
- Updated `docs/06-TESTING-AND-QA.md` with 4-tier Vitest + `fast-check` testing methodology.
- Updated `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md` to Supabase platform and Supabase CLI local development, relegating Docker Compose and Loguru to future roadmap.
- Updated `docs/08-STANDARDS-AND-CHANGELOG.md` to strict monorepo TypeScript and Zod schemas.
- Realigned `TASKS.md` checklist with master milestones M1 through M6.
```

---

## 6. Caveats

1. **Scaffolding Implementation Boundary:** The physical creation of monorepo configuration files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, package manifests) is handled by Explorer 2 (`explorer_m1_2`) and the designated Worker agent. This specification miner provides the governance, rules, documentation, and schema trigger edits.
2. **Environment Tooling Boundary:** Node.js/Corepack/pnpm execution details and test verification scripts are owned by Explorer 3 (`explorer_m1_3`).
3. **Future Scope Preservation:** Self-hosted Docker Compose + FastAPI specifications are not deleted; they are explicitly relegated to dedicated "Future Scope / Roadmap" sections within `docs/01`, `docs/02`, `docs/05`, `docs/06`, `docs/07`, `docs/08`, and `docs/10-ADR.md`.

---

## 7. Conclusion

Milestone 1 Governance and Documentation Realignment is fully specified:
1. Every stale reference to Python, FastAPI, Pytest, Hypothesis, Loguru, and Alembic has been identified and replaced with its exact Supabase, Vitest, and Turborepo counterpart.
2. Defective rule triggers in `.agents/rules/` have been mapped to actual monorepo paths (`apps/**`, `packages/**`, `supabase/**`).
3. The server-side double-entry deferred constraint trigger in `docs/04-DATABASE-SCHEMA.md` has been fully implemented with explicit exception handling and deferred constraint binding, supplemented with balance triggers, user bootstrap triggers, RPCs, and SQLite parity.
4. The Worker agent can apply these changes directly from Section 5 without ambiguity.

---

## 8. Verification Method

To verify the realignment once applied by the Worker agent:

1. **Grep Search for Stale References:**
   Ensure zero unwanted legacy occurrences in active sections:
   ```powershell
   Get-ChildItem -Recurse -Include *.md | Select-String -Pattern "alembic|pytest|hypothesis|loguru" | Where-Object { $_.Line -notmatch "Future|roadmap|ADR-009" }
   ```
   *Expected result:* Zero matches outside designated future roadmap sections.

2. **Rule Trigger Verification:**
   Inspect `.agents/rules/01-financial-ledger-safety.md` and `02-frontend-mobile-standards.md` to verify triggers match `**/{supabase,packages,apps}/**` and `**/{apps/web,apps/mobile,packages/ui}/**`.

3. **Schema Trigger Syntax Inspection:**
   Verify `docs/04-DATABASE-SCHEMA.md` includes `CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance AFTER INSERT OR UPDATE OR DELETE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transaction_balance();` and `RAISE EXCEPTION`.

4. **Task Checklist Alignment:**
   Verify `TASKS.md` contains Milestones M1 through M6 matching `PROJECT.md`.
