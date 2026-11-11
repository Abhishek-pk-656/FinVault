# Survey & Specification Mining Report: Frontend Applications (R4) & Verification / Testing (R5)

**Agent**: Frontend & Testing Explorer (`explorer_survey_3`)  
**Parent Conversation ID**: `867b8adb-e639-414f-92fa-0326940898a2`  
**State Folder**: `d:\programming\New_project\.agents\teamwork\explorer_survey_3`  
**Working Directory**: `d:\programming\New_project`  
**Date**: 2026-11-08  

---

## Executive Summary

A comprehensive investigation of `d:\programming\New_project` was conducted across all files, documentation specs (`docs/01`–`docs/11`), rules (`.agents/rules/`), skills (`.agents/skills/`), and the system toolchain. 

Key findings:
1. **Frontend (R4)**: Requires a Next.js 14+ App Router web dashboard and a React Native / Expo mobile application (Android first, iOS ready), sharing the Venzer Botanical Minimalist design system (`packages/ui`) with strict color tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`), layout anti-clutter rules (max 3 visual component groups per view, max 3 data attributes per row, `24px` rounded radii), and fluid transitions (`120ms`–`180ms`). Core views: Net Worth, Cash Flow, Multi-Split Transaction Entry, and IOU / Peer Lending Tracker.
2. **Verification & Testing (R5)**: Requires automated property-based testing using `fast-check` and `Vitest` in TypeScript, coupled with PostgreSQL database function/trigger tests. Core invariants to verify: $\sum \text{debits} == \sum \text{credits}$ across arbitrary randomized multi-split transactions; absolute rejection of floating-point numbers in favor of positive `BIGINT` minor units (paise/cents); strict tenant isolation via Row Level Security (RLS); and offline SQLite write & sync reconciliation with Supabase.
3. **Repository Reality & Gaps**: The repository currently contains zero frontend application code, zero monorepo configuration files, zero shared packages, and zero test suites. Furthermore, legacy documentation artifacts (`docs/06-TESTING-AND-QA.md`, `.agents/skills/verify-and-record/SKILL.md`, and `docs/08`) still mention `Pytest`, `Hypothesis`, and `FastAPI`, conflicting with ADR-008 and the TypeScript/Supabase architecture mandate.

---

## 1. Observation

### 1.1 Direct Repository Inspection

Execution of `Get-ChildItem -Path . -Recurse -File` revealed exactly 36 files in the workspace:
- Root files: `AGENTS.md`, `CHANGELOG.md`, `TASKS.md`
- Documentation files: `docs/01-PRD-AND-ROADMAP.md` through `docs/11-ENV-AND-MCP.md` (11 files)
- Governance and skills: `.agents/rules/` (3 files), `.agents/skills/` (3 files)
- Teamwork coordination files: `.agents/teamwork/` (16 files across agent folders)

**Observed Absences:**
- No monorepo root files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `.gitignore`).
- No frontend apps (`apps/web/`, `apps/mobile/`).
- No shared packages (`packages/ui/`, `packages/sync-engine/`, `packages/db-types/`).
- No database migrations or edge functions (`supabase/migrations/`, `supabase/functions/`).
- No test suites, configs, or test runners (`vitest.config.ts`, `fast-check` test files).

**Observed Host Tooling:**
- Node.js version: `v24.21.0` (confirmed via `node -v`)
- npm version: `11.19.0` (confirmed via `npm -v`)
- Corepack version: `0.36.0` (confirmed via `corepack -v`, enables `pnpm` on demand via `corepack enable`)

---

### 1.2 Extracted Specifications: R4 — Frontend Web Dashboard & Mobile Application

Extracted from `AGENTS.md`, `docs/01-PRD-AND-ROADMAP.md`, `docs/02-ARCHITECTURE-AND-STACK.md`, `docs/03-DESIGN-SYSTEM.md`, `docs/09-API-CONTRACTS.md`, `docs/10-ADR.md`, and `.agents/rules/02-frontend-mobile-standards.md`:

#### 1. Architecture & Monorepo Topology
- **Web App (`apps/web`)**: Next.js 14+ (App Router, Server & Client Components), strict TypeScript, Tailwind CSS, `@supabase/supabase-js`, `@supabase/ssr` (cookie-based session handling).
- **Mobile App (`apps/mobile`)**: React Native / Expo SDK 51+ (targeting Android first, iOS ready), `@supabase/supabase-js`, `expo-secure-store`, local SQLite / SQLCipher (e.g. `op-sqlite` or `expo-sqlite`).
- **Shared UI Package (`packages/ui`)**: Shared Venzer Botanical Minimalist UI component library consumed by both Web and Mobile.
- **Shared Sync Engine (`packages/sync-engine`)**: Offline-first SQLite local store, optimistic write mutations, queue replay, and bidirectional delta sync with Supabase PostgREST.
- **Shared DB Types (`packages/db-types`)**: Generated TypeScript database definitions matching Supabase PostgreSQL tables.

#### 2. Venzer Botanical Minimalist Design System
- **Color Palette Tokens**:
  - `Obsidian Carbon` (Background): `#040A0A`
  - `Soft Mint` (Surface / Cards): `#DEEEDA`
  - `Sage Pistachio` (Secondary / Borders): `#C7E0BA`
  - `Botanical Green` (Primary Action / Success): `#7AAA4A`
  - `Muted Sage` (Secondary Text / Muted Icons): `#90A999`
  - `Charcoal Slate` (Primary Headings / Text): `#38424C`
- **Layout & Anti-Clutter Rules**:
  - **Max Visual Component Groups**: Maximum 3 distinct visual cards/sections per screen.
  - **Row Density**: Maximum 3 data attributes per list row.
  - **Border Radius**: Consistent `24px` soft rounded containers (`rounded-3xl` / `borderRadius: 24`).
  - **High Whitespace**: Spacious, uncluttered financial overview.
- **Motion & Transitions**:
  - Strictly `<180ms` (target: `120ms`–`180ms`).
  - GPU-composited opacity and transform fades only.
  - Zero heavy animations, bouncy springs, or prolonged loading spinners.

#### 3. Core Functional Views

##### View 1: Net Worth Dashboard
- **Purpose**: High-level financial standing at a glance.
- **Data Ingestion**: Aggregate balances from `accounts` table (`balance_minor`), categorized by `account_type` (`ASSET`, `LIABILITY`, `EQUITY`).
- **Calculation**:
  $$\text{Net Worth} = \sum \text{Assets} - \sum \text{Liabilities}$$
- **Key Metrics**:
  - Total Net Worth in formatted currency (minor unit conversion).
  - Total Assets card vs Total Liabilities card (within 3 component group limit).
  - "Safe-to-Spend" Metric: Liquid liquidity (cash/bank asset accounts minus upcoming due bills and liability payments).
- **UI Constraints**: Max 3 component groups: (1) Net Worth & Safe-to-Spend Summary Card, (2) Asset Accounts Breakdown, (3) Liability Accounts Breakdown.

##### View 2: Cash Flow View
- **Purpose**: Monthly/periodic financial velocity and liquidity tracking.
- **Data Ingestion**: Transactions aggregated across `INCOME` and `EXPENSE` journal entry lines over selected billing or monthly cycles.
- **Calculation**:
  $$\text{Net Cash Flow} = \sum \text{Inflows} - \sum \text{Outflows}$$
- **Features**:
  - Monthly aggregation based on `transaction_date`.
  - Inflow vs Outflow category breakdown.
  - Trend indicator (surplus vs deficit).
- **UI Constraints**: Max 3 component groups: (1) Cash Flow Overview (Inflow, Outflow, Net), (2) Monthly Trajectory Chart/Timeline, (3) Top Expense Categories breakdown.

##### View 3: Transaction Entry View (Multi-Split Double-Entry Lite)
- **Purpose**: Core ledger data entry supporting multi-split allocations.
- **Required Fields**:
  - `transaction_date`: Date picker, defaulting to today.
  - `description`: Text (up to 255 chars).
  - `notes`: Optional string.
  - `idempotency_key`: Auto-generated UUID v4.
  - Dynamic `entries` array (minimum 2 entries):
    - `account_id`: Account selector (UUID).
    - `direction`: `DEBIT` or `CREDIT`.
    - `amount_minor`: Positive `BIGINT` minor units.
- **Real-Time Client Invariant Enforcement**:
  - Live calculation:
    $$\Delta = \sum \text{Debits} - \sum \text{Credits}$$
  - Visual status badge: Displays "Balanced" (Green `#7AAA4A`) when $\Delta = 0$; displays "Unbalanced: Difference [X]" (Red/Warning) when $\Delta \ne 0$.
  - Submit Button is disabled unless $\Delta = 0$ AND all `amount_minor > 0`.
- **Minor Unit Formatter/Parser**: User inputs human-readable decimal (e.g. `150.50`), parsed directly into minor units (`15050` paise) using integer arithmetic, preventing IEEE 754 float rounding errors.

##### View 4: IOU & Peer Lending Tracking View
- **Purpose**: Bilateral debt tracking, group expense splits, and partial loan settlements.
- **Data Ingestion**: `iou_records` table (`counterparty_name`, `direction`, `principal_minor`, `remaining_balance_minor`, `status`, `due_date`).
- **Features**:
  - Separate lists or tabs for "You Lent" (`direction = 'LENT'`, an Asset) and "You Borrowed" (`direction = 'BORROWED'`, a Liability).
  - Per-counterparty net rollup ("John owes you ₹4,500 across 3 splits").
  - Partial settlement action: Records a repayment transaction, reducing `remaining_balance_minor`, updating status (`OPEN` $\to$ `PARTIAL` $\to$ `SETTLED`).
  - Write-off action: Sets status to `WRITTEN_OFF`.
- **UI Constraints**: Max 3 component groups: (1) Net IOU Summary (Total Lent vs Total Borrowed), (2) Counterparties List (max 3 attributes per row: Name, Direction, Remaining Balance), (3) Quick Settlement / Add IOU Modal.

##### Mobile-Specific Capabilities
- **Local-First SQLite Storage**:
  - Local database (`finvault_local.db` with SQLCipher encryption support).
  - Sub-50ms writes: When a transaction is submitted offline, it is written immediately to local SQLite.
  - Optimistic UI update: UI refreshes instantly without waiting for network ACK.
- **Background Synchronization**:
  - Queue changesets locally in `pending_sync_queue`.
  - When network connects, sync engine batches pushes to Supabase and pulls remote changes where `updated_at > last_sync_timestamp`.
- **Biometric Security**:
  - Mobile app protected via biometric unlock (`expo-local-authentication`).

---

### 1.3 Extracted Specifications: R5 — Verification & Property-Based Testing

Extracted from `AGENTS.md`, `ORIGINAL_REQUEST.md`, `docs/02-ARCHITECTURE-AND-STACK.md`, `docs/04-DATABASE-SCHEMA.md`, and `.agents/rules/01-financial-ledger-safety.md`:

#### 1. Testing Framework Stack
- **Framework**: `Vitest` (fast, native ESM, Vite/Next.js/Turborepo compatible) + `fast-check` (TypeScript property-based testing).
- **Database Test Scripts**: PostgreSQL plpgsql test runner / Supabase local CLI integration verifying triggers, RLS, and RPCs.

#### 2. Test Suite 1: Double-Entry Multi-Split Balance Invariant
- **Invariant**:
  $$\sum_{i} \text{debit\_amount}_i = \sum_{j} \text{credit\_amount}_j$$
- **Property Test Specification (`fast-check`)**:
  - **Generator**:
    - Generates arbitrary integer $N \in [2, 20]$ entries.
    - Generates arbitrary minor unit totals $T \in [1, 10^{12}]$ (up to ₹10,000,000,000.00).
    - Randomly partitions $T$ into $K$ debit splits and $N-K$ credit splits such that $\sum \text{debits} \equiv \sum \text{credits} \equiv T$.
  - **Assertions**:
    - Validation engine marks valid balanced partitions as `valid: true`.
    - Mutating any single split by $\pm 1$ minor unit forces `valid: false` with exact mismatch reporting.
    - An empty entries array or single entry is strictly invalid.
    - Any entry with `amount_minor <= 0` is strictly rejected.

#### 3. Test Suite 2: Strict BIGINT Minor Units & Floating-Point Rejection
- **Invariant**: Floating-point numbers (`number` with decimals, IEEE 754 representations) must never be admitted into ledger operations. All currency calculations must be pure `bigint` minor units.
- **Property Test Specification (`fast-check`)**:
  - **Generator**:
    - Feeds randomized floats (e.g. `19.99`, `0.1 + 0.2`, `NaN`, `Infinity`, `-0.01`).
    - Feeds arbitrary currency string representations with varying decimal precisions (e.g. `"100.5"`, `"100.50"`, `"100.505"`).
  - **Assertions**:
    - Safe integer parser converts valid 2-decimal strings to exact `bigint` minor units (e.g., `"19.99"` $\to$ `1999n`, `"0.30"` $\to$ `30n`) without floating point artifacts.
    - Precision beyond 2 decimals (e.g. `"100.555"`) is either cleanly rejected or rounded via deterministic banker's rounding.
    - Non-numeric strings, negative numbers, `NaN`, and `Infinity` throw explicit domain validation errors.
    - Arithmetic operations (summing, ledger balance checks) operate strictly on `bigint`.

#### 4. Test Suite 3: Row-Level Security (RLS) Policy Isolation
- **Invariant**: In Supabase PostgreSQL, `auth.uid() = user_id` strictly prevents cross-tenant data leakage or tampering across all financial tables (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`).
- **Automated Test Matrix**:
  - Create two distinct simulated users: User A (`uuid-A`) and User B (`uuid-B`).
  - Verify SELECT: User A querying `accounts` or `transactions` receives zero rows belonging to User B.
  - Verify INSERT: User A attempting to insert a row with `user_id = uuid-B` is rejected by RLS policy.
  - Verify UPDATE / DELETE: User A cannot update or delete rows belonging to User B.
  - Verify Unauthenticated: Anonymous client requests (no JWT) receive HTTP 401 / empty result sets.

#### 5. Test Suite 4: Database Trigger & Server-Side RPC Invariant Verification
- **Invariant**: Server-side constraint trigger `verify_transaction_balance()` and RPC `post_transaction` reject any unbalanced payload, guaranteeing zero dirty writes even if client validation is bypassed.
- **SQL / RPC Test Specification**:
  - Call `post_transaction` with balanced entries $\implies$ transaction is committed; account balances updated.
  - Call `post_transaction` with debits $\ne$ credits $\implies$ transaction aborts with SQL error / HTTP 400; zero rows written; account balances untouched.
  - Call `post_transaction` with `amount_minor = 0` or negative $\implies$ check constraint violation (`CHECK (amount_minor > 0)`).

#### 6. Test Suite 5: Offline SQLite Writes & Sync Reconciliation
- **Invariant**: Client SQLite storage must support offline writes, queue operations, and deterministically reconcile with Supabase PostgreSQL without duplicates or data loss.
- **Property Test Specification**:
  - Create local SQLite instance mirroring PostgreSQL schema.
  - Insert $K$ offline transactions with client-generated UUIDs and `idempotency_key`.
  - Simulate network restoration:
    - Sync engine flushes queue via upsert.
    - Remote deltas are retrieved where `updated_at > last_sync_timestamp`.
  - Conflict simulation: Concurrent edits on same entity resolved via Last-Write-Wins (LWW) based on `updated_at` and `version` increment.
  - Invariant assertion: Post-sync, `SUM(balances)` in local SQLite equals `SUM(balances)` in cloud Supabase PostgreSQL.

---

### 1.4 Feature Discovered Catalog

| Feature ID | Category | Component / View | Requirements / Contracts | Constraints & Safety Rules |
| :--- | :--- | :--- | :--- | :--- |
| **FEAT-R4-01** | UI Library | `packages/ui` | Venzer design tokens: 6 botanical colors, `24px` radius, button/card/input primitives | Transitions $\le 180$ms; no heavy spring animations |
| **FEAT-R4-02** | Dashboard | Net Worth View | Aggregates Asset vs Liability accounts; displays Net Worth & Safe-to-Spend | Max 3 visual groups; currency formatted from minor units |
| **FEAT-R4-03** | Analytics | Cash Flow View | Aggregates Inflows vs Outflows over monthly/custom cycles | Max 3 visual groups; max 3 attributes per row |
| **FEAT-R4-04** | Entry Form | Transaction Entry | Multi-split journal entry form with live debit/credit balance indicator | Rejects unbalanced submit; integer minor unit parsing |
| **FEAT-R4-05** | Lending | IOU Tracking View | Bilateral debt tracking (LENT/BORROWED), net counterparty balance, settlements | Soft-delete support; status progression (`OPEN` $\to$ `SETTLED`) |
| **FEAT-R4-06** | Mobile Core | Expo Mobile Client | Local SQLite offline write (<50ms latency), optimistic UI, biometric login | Syncs in background via `@supabase/supabase-js` |
| **FEAT-R5-01** | Property Test | Ledger Balancing | `fast-check` generator of arbitrary N-way balanced/unbalanced splits | $\sum \text{debits} == \sum \text{credits}$ strictly enforced |
| **FEAT-R5-02** | Property Test | BIGINT Currency Safety | Validates string-to-minor parsing and rejection of floats/NaN/scientific notation | Zero floating-point arithmetic; minor units $> 0$ |
| **FEAT-R5-03** | Integration | Supabase RLS Isolation | Multi-user test suite verifying zero cross-tenant access across all tables | `auth.uid() = user_id` across 5 core tables |
| **FEAT-R5-04** | DB Constraint | Trigger / RPC Invariant | `verify_transaction_balance()` / `post_transaction` atomic validation | Database rolls back transaction on any mismatch |
| **FEAT-R5-05** | Sync Engine | Delta Sync & Offline Replay | SQLite queue replay, watermark pull, LWW conflict resolution | Idempotent UUIDs prevent duplicate transactions |

---

### 1.5 Edge Cases & Financial Traps

1. **Floating-Point Minor Unit Ingestion Trap**:
   - *Problem*: In JavaScript, `19.99 * 100` evaluates to `1998.9999999999998`. If truncated via `Math.floor()` or `parseInt()`, the user loses 1 cent/paisa (`1998` instead of `1999`).
   - *Requirement*: The string parser must split on `.` and compute minor units using exact integer arithmetic: `BigInt(major) * 100n + BigInt(minor.padEnd(2, '0').slice(0, 2))`.
2. **Zero-Amount or Negative Split Exploit**:
   - *Problem*: A transaction with Debit ₹100, Credit ₹150, Debit -₹50 technically balances ($\sum = 100 - 50 = 50$, Credits = 50 or Debits 100, Credits 100), but creates corrupted account states.
   - *Requirement*: Every entry must satisfy `amount_minor > 0`. Zero and negative splits must be rejected immediately at client input and enforced by database check constraint `CHECK (amount_minor > 0)`.
3. **Multi-Split Imbalance ($\pm 1$ Minor Unit)**:
   - *Problem*: Split bill calculations (e.g. dividing ₹100 among 3 people = 33.333...) leave 1 leftover paisa (`3333 * 3 = 9999` vs `10000`).
   - *Requirement*: Split calculator must allocate remainder (1 minor unit) to the primary payer or round-robin to ensure strict debit-credit balance.
4. **Offline Duplicate Ingestion**:
   - *Problem*: Tapping "Submit" repeatedly while offline on mobile could generate multiple queue items.
   - *Requirement*: Generate a unique `idempotency_key` (UUID v4) on form initialize. Retries submit the same key, which PostgreSQL and SQLite enforce with a `UNIQUE` constraint.
5. **Soft-Deleted Entity Resurrection**:
   - *Problem*: User deletes an IOU record or transaction offline (`is_deleted = true`). Remote sync pull without delete filter could overwrite local status.
   - *Requirement*: Both client SQLite and Supabase delta sync queries must account for `is_deleted` and apply soft-deletion tombstones.
6. **UI Density & Visual Clutter Violation**:
   - *Problem*: Complex fintech dashboards often cram 10+ widgets, cards, and tables into one screen, violating FinVault's Botanical Minimalist standard.
   - *Requirement*: Every screen is strictly capped at maximum 3 visual component groups and maximum 3 data attributes per row.

---

### 1.6 Documentation Inconsistencies & Legacy References

During the survey, several documentation files were found to contain legacy references to Python, Pytest, Hypothesis, and FastAPI that predate the Supabase architecture adoption (ADR-008):
- **`docs/06-TESTING-AND-QA.md` (lines 3–4)**: States: *"1. Property-Based Financial Testing: Use Pytest and Hypothesis to generate thousands of randomized monetary splits..."*
  - *Conflict*: `ORIGINAL_REQUEST.md`, `docs/02`, and `AGENTS.md` specify TypeScript, Vitest, and `fast-check`.
- **`.agents/skills/verify-and-record/SKILL.md` (line 9)**: States: *"1. Run pytest with property-based financial ledger tests."*
  - *Conflict*: Needs updating to run `pnpm test` (Vitest + `fast-check`).
- **`docs/08-STANDARDS-AND-CHANGELOG.md` (line 3)**: States: *"Pydantic v2 validation on FastAPI backend."*
  - *Conflict*: Backend validation is performed in Supabase Edge Functions (Deno / TypeScript) and PostgreSQL plpgsql functions.

---

## 2. Logic Chain

1. **Premise 1 (From ADR-008 & AGENTS.md)**: FinVault transitioned to a Supabase-backed PostgreSQL 16 cloud architecture with Google OAuth and offline-first client SQLite storage in a Turborepo monorepo.
2. **Premise 2 (From R4 & Rule 02)**: Frontend clients must provide high-fidelity financial control across Web (Next.js 14+) and Mobile (Expo Android) while enforcing the Venzer Botanical Minimalist design tokens, $\le 180$ms fluid micro-transitions, and uncluttered layouts (max 3 visual component groups).
3. **Premise 3 (From R5 & Rule 01)**: Financial safety is non-negotiable. Floating-point numbers are prohibited; all amounts are `BIGINT` minor units; ledger balancing ($\sum \text{debits} == \sum \text{credits}$) must be mathematically verified via property-based testing (`fast-check`) and enforced atomically at the database layer.
4. **Deduction 1 (Monorepo Architecture)**: Because both web and mobile require identical design tokens, minor unit arithmetic, and offline sync interfaces, a shared package structure (`packages/ui`, `packages/sync-engine`, `packages/db-types`) in Turborepo with pnpm is mandatory.
5. **Deduction 2 (Verification Layer)**: Because `fast-check` can generate thousands of edge-case transaction payloads within milliseconds in Vitest, property-based tests must be placed in a shared testing suite or within `packages/sync-engine` and `apps/web` to verify balance invariants, integer parsers, and sync reconciliation before database commit.
6. **Deduction 3 (Documentation Alignment)**: Legacy documentation referencing Pytest, Hypothesis, and FastAPI must be harmonized under the Living Plan Protocol (`.agents/rules/00-living-plan-protocol.md`) to reflect Vitest, fast-check, and Supabase.

---

## 3. Caveats & Assumptions

1. **No Existing Project Code**: The workspace currently contains only documentation and agent metadata. No prior frontend code or tests exist to preserve or migrate.
2. **Package Manager Tooling**: `corepack` is available (v0.36.0) on the host system to enable `pnpm`. Implementers should execute `corepack enable` prior to monorepo package installation.
3. **Supabase Local vs Cloud Execution**: Property tests with `fast-check` (ledger invariant logic, minor unit parsing, sync replay simulation) can execute completely standalone in Node.js without an active network connection or database instance. Integration tests for RLS policies and database triggers require either local Supabase CLI or an active test database instance.

---

## 4. Conclusion

The specification mining for R4 (Frontend Web Dashboard and Mobile Application) and R5 (Verification and Property-Based Testing) is complete. The system architecture, design tokens, view requirements, testing invariants, and edge cases have been cataloged with precision.

### Concrete Next Steps for Implementation
1. **Initialize Monorepo Structure**: Set up Turborepo with `pnpm-workspace.yaml`, root `package.json`, and `turbo.json`.
2. **Create Shared Packages**:
   - `packages/ui`: Venzer design tokens, Tailwind config, and core UI primitives.
   - `packages/sync-engine`: SQLite storage adapter, delta sync client, and LWW conflict resolver.
   - `packages/db-types`: Supabase database type definitions.
3. **Implement Web App (`apps/web`)**: Next.js 14+ with App Router, implementing Net Worth, Cash Flow, Transaction Entry, and IOU Tracking views with `@supabase/supabase-js`.
4. **Implement Mobile App (`apps/mobile`)**: React Native / Expo application with local SQLite offline writes and background sync.
5. **Implement Property-Based Test Suite**: Vitest + `fast-check` test suite covering multi-split ledger balancing, `BIGINT` minor unit integer parsing, RLS isolation, and offline sync reconciliation.
6. **Harmonize Documentation**: Update `docs/06-TESTING-AND-QA.md` and `.agents/skills/verify-and-record/SKILL.md` to reflect Vitest and `fast-check`.

---

## 5. Verification Method

To independently verify the observations and findings in this report:

1. **Verify Workspace Contents**:
   ```powershell
   Get-ChildItem -Path d:\programming\New_project -Recurse -File | Select-Object FullName
   ```
   *Expected outcome*: Only `AGENTS.md`, `CHANGELOG.md`, `TASKS.md`, `docs/*`, and `.agents/*` exist. No `apps/` or `packages/`.

2. **Verify Tooling Availability**:
   ```powershell
   node -v
   npm -v
   corepack -v
   ```
   *Expected outcome*: Node `v24.21.0`, npm `11.19.0`, Corepack `0.36.0`.

3. **Verify Design System Tokens in Rules**:
   Inspect `.agents/rules/02-frontend-mobile-standards.md` lines 8–16 and `docs/03-DESIGN-SYSTEM.md` lines 4–17 to confirm the exact Botanical Minimalist color hex values and `<180ms` transition constraint.

4. **Verify Database Trigger & Schema Contracts**:
   Inspect `docs/04-DATABASE-SCHEMA.md` lines 20–140 to confirm table definitions (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`) and the `verify_transaction_balance()` trigger signature.

5. **Verify Fast-Check & Vitest Mandate**:
   Inspect `ORIGINAL_REQUEST.md` lines 34–40 and `docs/02-ARCHITECTURE-AND-STACK.md` line 49.
