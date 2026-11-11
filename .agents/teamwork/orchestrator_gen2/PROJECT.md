# Project: FinVault

## Architecture
FinVault is a local-first, privacy-preserving personal finance, money lending (IOU), bills, and wealth management platform across Web (Next.js 14+) and Mobile (React Native / Expo Android).

### System Topology
1. **Monorepo (Turborepo + pnpm)**:
   - `packages/db-types`: Generated & unified TypeScript definitions for Supabase PostgreSQL and SQLite schemas.
   - `packages/sync-engine`: Local-first SQLite adapter, mutation outbox queue (`sync_queue`), bidirectional delta sync protocol, and LWW conflict resolution.
   - `packages/ui`: Venzer Botanical Minimalist design tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`), layout primitives (<180ms transitions, max 3 visual component groups), and UI components.
   - `apps/web`: Responsive desktop cockpit in Next.js 14+ App Router with `@supabase/supabase-js`, rendering Net Worth, Cash Flow, Multi-Split Transaction Entry, and IOU Tracker views.
   - `apps/mobile`: React Native / Expo application (Android first, iOS ready) with immediate local SQLite writes (<50ms latency) and background sync.
2. **Backend & Cloud (Supabase)**:
   - Managed PostgreSQL 16 with `uuid-ossp` and `pgvector`.
   - All monetary fields stored strictly as `BIGINT` minor units (paise/cents). Floating-point money is completely prohibited.
   - Server-side double-entry integrity: PostgreSQL `DEFERRABLE INITIALLY DEFERRED` constraint trigger aborts any transaction where $\sum \text{debits} \ne \sum \text{credits}$ prior to commit.
   - Automatic account balance maintenance trigger dynamically updating balances according to accounting signs.
   - User bootstrap trigger provisioning default accounts on signup.
   - Row Level Security (RLS) policies strictly isolating each user's financial data by `auth.uid() = user_id`.
   - PostgREST auto-generated REST API and Supabase Edge Functions (Deno) for custom validation.
   - Google OAuth (Gmail) authentication.
3. **Future Scope**:
   - Self-hosted Docker Compose + FastAPI preserved for air-gapped deployments on future roadmap.

---

## Feature Inventory

Every feature from the Survey phase is enumerated below with an explicit Milestone assignment.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Living Plan Protocol Alignment | Formal 4-step Propose-Approve-Propagate protocol for architecture and documentation changes | M1 | Survey (Miner 1) |
| 2 | Financial Ledger Safety Rule Enforcement | Rule 01 enforcing integer minor units (`BIGINT`), double-entry equality, and idempotency | M1 | Survey (Miner 1) |
| 3 | Frontend Standards Rule Enforcement | Rule 02 enforcing Botanical Minimalist tokens, max 3 visual groups, and <180ms transitions | M1 | Survey (Miner 1) |
| 4 | Plan Evolution Skill Alignment | Realign `.agents/skills/evolve-plan/SKILL.md` to reflect living documentation procedures | M1 | Survey (Miner 1) |
| 5 | DB Migration & Sync Skill Alignment | Realign `.agents/skills/db-migration-and-sync/SKILL.md` from legacy Alembic to Supabase SQL migrations | M1 | Survey (Miner 1) |
| 6 | Verify & Record Skill Alignment | Realign `.agents/skills/verify-and-record/SKILL.md` from legacy pytest to Vitest + fast-check | M1 | Survey (Miner 1) |
| 7 | Turborepo Monorepo Scaffolding | Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example` | M1 | Survey (Miner 1) |
| 8 | Documentation Realignment | Update `docs/05`, `06`, `07`, `08` to Supabase/Vitest/fast-check while preserving Docker/FastAPI as future roadmap | M1 | Survey (Miner 1) |
| 9 | Minor Currency Unit `BIGINT` Storage | PostgreSQL schema storing all monetary amounts as 64-bit integer minor units (paise/cents), zero floats | M2 | Survey (Miner 2) |
| 10 | Core Chart of Accounts Schema | `accounts` table classifying ASSET, LIABILITY, EQUITY, INCOME, EXPENSE with currency and balance | M2 | Survey (Miner 2) |
| 11 | Transaction Header & Idempotency | `transactions` table with unique UUID idempotency key, date, description, notes, and soft-delete | M2 | Survey (Miner 2) |
| 12 | Journal Entries & Multi-Split Allocation | `journal_entries` table with debit/credit directions and minor unit check constraints | M2 | Survey (Miner 2) |
| 13 | Peer Lending & IOU Ledger Schema | `iou_records` table tracking debts, counterparties, directions (LENT/BORROWED), and balances | M2 | Survey (Miner 2) |
| 14 | Sinking Funds & Savings Goals Schema | `sinking_funds` table tracking targets, allocations, dates, and completion status | M2 | Survey (Miner 2) |
| 15 | Optimistic Concurrency & Soft-Delete | Version column tracking and `is_deleted` tombstones on all syncable entities | M2 | Survey (Miner 2) |
| 16 | Supabase Row Level Security (RLS) | Comprehensive RLS policies on all 5 tables enforcing strict `auth.uid() = user_id` isolation | M2 | Survey (Miner 2) |
| 17 | Cross-Tenant FK Integrity | Composite unique constraints and foreign keys preventing cross-tenant account references | M2 | Survey (Miner 2) |
| 18 | Server-Side Deferred Constraint Trigger | PL/pgSQL constraint trigger `trg_verify_transaction_balance` aborting transactions with debits != credits | M2 | Survey (Miner 2) |
| 19 | Account Balance Maintenance Trigger | PostgreSQL trigger `trg_update_account_balance` keeping account balances updated on journal insert/delete | M2 | Survey (Miner 2) |
| 20 | Atomic Transaction RPC (`post_transaction`) | Stored function atomically inserting transaction header and balanced journal entries | M2 | Survey (Miner 2) |
| 21 | User Bootstrap Account Provisioning Trigger | PostgreSQL trigger `trg_on_auth_user_created` provisioning Cash, Bank, Expense, Income on signup | M2 | Survey (Miner 2) |
| 22 | Client SQLite Schema Parity | Mirrored SQLite DDL with 64-bit integer minor units and identical table structures | M2 | Survey (Miner 2) |
| 23 | Client Mutation Queue Outbox (`sync_queue`) | Local SQLite table tracking pending offline mutations for sync replay | M2 | Survey (Miner 2) |
| 24 | Shared Database Types Package | `packages/db-types` defining TypeScript types for all Supabase tables, views, and SQLite schemas | M2 | Survey (Miner 1 & 2) |
| 25 | Supabase Auth with Google OAuth | Google OAuth (Gmail) sign-in flow with PKCE session handling and secure token storage | M3 | Survey (Miner 2) |
| 26 | PostgREST Client Data Layer | Auto-generated REST query client helpers via `@supabase/supabase-js` | M3 | Survey (Miner 2) |
| 27 | Supabase Edge Functions | Deno / TypeScript Edge Functions for transaction validation and sync reconciliation | M3 | Survey (Miner 2) |
| 28 | Atomic IOU Settlement RPC | Database RPC for partial/full IOU settlements and automatic journal entries | M3 | Survey (Miner 2) |
| 29 | Bidirectional Delta Sync Engine | Push queued mutations and pull remote changes where `updated_at > last_sync_timestamp` | M3 | Survey (Miner 2) |
| 30 | Last-Write-Wins (LWW) Conflict Resolution | Deterministic reconciliation using timestamps, versions, and UUIDs | M3 | Survey (Miner 2) |
| 31 | Venzer Botanical Minimalist Design Tokens | `packages/ui` tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`), 24px radius, <180ms transitions | M4 | Survey (Explorer 3) |
| 32 | Shared Layout & Anti-Clutter Components | Card and layout primitives strictly enforcing max 3 visual component groups and max 3 attributes per row | M4 | Survey (Explorer 3) |
| 33 | Web Dashboard: Net Worth View | View aggregating Asset vs Liability balances and Safe-to-Spend liquidity | M4 | Survey (Explorer 3) |
| 34 | Web Dashboard: Cash Flow View | View tracking periodic Inflows vs Outflows and monthly net savings trajectory | M4 | Survey (Explorer 3) |
| 35 | Web Dashboard: Multi-Split Entry Form | Form with live debit/credit balance indicator ($\Delta = 0$), minor unit parsing, submit disabled if unbalanced | M4 | Survey (Explorer 3) |
| 36 | Web Dashboard: IOU Tracker View | View managing bilateral debts, counterparty totals, and settlement actions | M4 | Survey (Explorer 3) |
| 37 | Mobile Application (Expo / React Native) | React Native / Expo Android app with native navigation and local SQLite integration | M5 | Survey (Explorer 3) |
| 38 | Mobile Offline Immediate Writes | Sub-50ms optimistic offline transaction and IOU logging to local SQLite | M5 | Survey (Explorer 3) |
| 39 | Mobile Background Sync Engine Integration | Background sync of queued SQLite mutations when device comes online | M5 | Survey (Explorer 3) |
| 40 | Mobile Biometric Security Integration | Optional biometric unlock via `expo-local-authentication` | M5 | Survey (Explorer 3) |
| 41 | E2E & Property-Based Test Infrastructure | Comprehensive test harness executing Tiers 1-4 tests (Vitest + `fast-check`) | M6 / E2E Track | Survey (Explorer 3) |
| 42 | Future Scope Docker/FastAPI Documentation | Retaining self-hosted FastAPI and Docker Compose in `docs/02`, `docs/07`, and `docs/10-ADR.md` | M1 | Survey (Miner 1) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Governance, Documentation & Monorepo Foundation | Update `AGENTS.md`, `TASKS.md`, `CHANGELOG.md`, rules, skills, and `docs/01`–`11` to reflect Supabase architecture; preserve Docker/FastAPI as future roadmap; scaffold Turborepo root (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`). | None | IN_PROGRESS |
| M2 | Supabase PostgreSQL Schema, Security, Triggers & Client SQLite Parity | Supabase DDL migrations in `supabase/migrations/` with `BIGINT` minor units, core tables, RLS policies, deferred constraint trigger for $\sum debits == \sum credits$, balance trigger, user bootstrap trigger, `post_transaction` RPC; client SQLite schema in `packages/sync-engine`; TypeScript types in `packages/db-types`. | M1 | PLANNED |
| M3 | Shared Packages, Auth, Sync Engine & Edge Functions | Offline-first sync engine in `packages/sync-engine` (SQLite storage, mutation outbox queue, push/pull delta protocol, LWW conflict resolution); Supabase Auth Google OAuth helpers; Supabase Edge Functions for validation. | M1, M2 | PLANNED |
| M4 | Shared UI Library & Web Application Cockpit | `packages/ui` Venzer Botanical Minimalist component library; Next.js 14+ App Router cockpit in `apps/web` implementing Net Worth, Cash Flow, Multi-Split Transaction Entry (with live balance badge), and IOU Tracker views. | M1, M2, M3 | PLANNED |
| M5 | Mobile Application (Expo / React Native) | React Native / Expo Android mobile app in `apps/mobile` with local SQLite immediate offline writes (<50ms latency), background sync to Supabase, and mobile views for all 4 core financial domains. | M1, M2, M3, M4 | PLANNED |
| M6 | Final Verification & Adversarial Coverage Hardening | Phase 1: Pass 100% of the E2E Test Suite published in `TEST_READY.md` (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5). | M1–M5, TEST_READY.md | PLANNED |

In parallel:
- **E2E Testing Track**: E2E Testing Orchestrator constructs the opaque-box test suite (Tiers 1-4) derived from `ORIGINAL_REQUEST.md`, publishing `TEST_READY.md`.

---

## Interface Contracts

### 1. `packages/db-types` ↔ Backend & Frontend
Exports TypeScript database definitions:
- `Account`: `{ id: string, user_id: string, name: string, type: 'ASSET'|'LIABILITY'|'EQUITY'|'INCOME'|'EXPENSE', currency: string, balance_minor: bigint, is_archived: boolean, created_at: string, updated_at: string, version: bigint }`
- `Transaction`: `{ id: string, user_id: string, idempotency_key: string, transaction_date: string, description: string, notes?: string, is_reconciled: boolean, is_deleted: boolean, created_at: string, updated_at: string, version: bigint }`
- `JournalEntry`: `{ id: string, user_id: string, transaction_id: string, account_id: string, amount_minor: bigint, direction: 'DEBIT'|'CREDIT', created_at: string }`
- `IOURecord`: `{ id: string, user_id: string, counterparty_name: string, counterparty_contact?: string, direction: 'LENT'|'BORROWED', principal_minor: bigint, remaining_balance_minor: bigint, currency: string, status: 'OPEN'|'PARTIAL'|'SETTLED'|'WRITTEN_OFF', due_date?: string, notes?: string, is_deleted: boolean, created_at: string, updated_at: string, version: bigint }`
- `SinkingFund`: `{ id: string, user_id: string, name: string, target_amount_minor: bigint, allocated_amount_minor: bigint, target_date?: string, currency: string, is_completed: boolean, created_at: string, updated_at: string, version: bigint }`

### 2. `packages/sync-engine` ↔ Client Applications (`apps/web`, `apps/mobile`)
- `initDatabase(path?: string): Promise<DatabaseHandle>`
- `enqueueMutation(mutation: SyncMutation): Promise<void>`
- `syncWithRemote(supabaseClient: SupabaseClient): Promise<SyncResult>`
- `getAccounts(): Promise<Account[]>`
- `postTransaction(tx: NewTransactionPayload): Promise<Transaction>`
- `settleIOU(iouId: string, amountMinor: bigint, accountId: string): Promise<void>`

### 3. `packages/ui` ↔ Client Applications (`apps/web`, `apps/mobile`)
- `Card`: Container with `rounded-3xl` (`24px`), soft mint surface (`#DEEEDA` or obsidian carbon `#040A0A`).
- `Button`: Botanical minimalist button (`#7AAA4A` action), transitions $\le 180$ms.
- `BalanceBadge`: Indicator displaying `Balanced` (green) or `Difference [X]` based on $\Delta = \sum debits - \sum credits$.
- `AmountInput`: Form input converting human decimal input string directly into integer minor units (`bigint`).

---

## Code Layout

```
d:\programming\New_project/
├── .agents/
│   ├── rules/
│   │   ├── 00-living-plan-protocol.md
│   │   ├── 01-financial-ledger-safety.md
│   │   └── 02-frontend-mobile-standards.md
│   ├── skills/
│   │   ├── db-migration-and-sync/SKILL.md
│   │   ├── evolve-plan/SKILL.md
│   │   └── verify-and-record/SKILL.md
│   └── teamwork/
├── apps/
│   ├── web/                     # Next.js 14+ App Router web cockpit
│   └── mobile/                  # React Native / Expo Android application
├── packages/
│   ├── db-types/                # Shared TypeScript database interfaces
│   ├── sync-engine/             # Offline SQLite store & delta sync protocol
│   └── ui/                      # Shared Venzer Botanical Minimalist UI components
├── supabase/
│   ├── migrations/              # Supabase PostgreSQL DDL, triggers & RLS
│   └── functions/               # Supabase Edge Functions (Deno / TypeScript)
├── tests/
│   └── e2e/                     # E2E & property-based test suites (Vitest + fast-check)
├── docs/                        # Modular architecture & PRD documentation
├── AGENTS.md
├── CHANGELOG.md
├── TASKS.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

