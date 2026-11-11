# Live Execution Tracker (TASKS.md)

## Master Execution Roadmap

### Milestone 1: Governance, Documentation & Monorepo Foundation
- [x] **M1.1: Governance Rules & Skills Realignment**
  - [x] Realign `.agents/rules/00-living-plan-protocol.md`, `01-financial-ledger-safety.md`, and `02-frontend-mobile-standards.md`.
  - [x] Realign `.agents/skills/evolve-plan`, `db-migration-and-sync`, and `verify-and-record`.
  - [x] Realign `AGENTS.md`, `TASKS.md`, and `CHANGELOG.md`.
- [x] **M1.2: Architecture Documentation Realignment**
  - [x] Update `docs/04-DATABASE-SCHEMA.md` with complete deferred constraint trigger and RPC specs.
  - [x] Update `docs/05`, `docs/06`, `docs/07`, `docs/08` to Supabase, Vitest + `fast-check`, and Turborepo.
  - [x] Add ADR-009 and ADR-010 to `docs/10-ADR.md`.
- [x] **M1.3: Turborepo Monorepo Scaffolding**
  - [x] Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`.
  - [x] Scaffold `packages/db-types`, `packages/sync-engine`, and `packages/ui`.
  - [x] Scaffold `apps/web` (Next.js 14+) and `apps/mobile` (Expo React Native).
  - [x] Scaffold `supabase/migrations/` and `supabase/functions/`.

### Milestone 2: Supabase Schema, Triggers, RLS & Client SQLite Parity
- [x] **M2.1: Supabase PostgreSQL DDL & Migrations**
  - [x] Tables: `accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`, `audit_logs` with `BIGINT` minor units.
  - [x] RLS policies on all tables enforcing `auth.uid() = user_id` with explicit `WITH CHECK`.
  - [x] Deferred constraint trigger `trg_verify_transaction_balance` aborting unbalanced entries (`NUMERIC(38,0)`).
  - [x] Balance maintenance trigger `trg_update_account_balance` with `version = version + 1`.
  - [x] User bootstrap trigger `trg_on_auth_user_created` with Opening Balance Equity.
  - [x] Atomic `post_transaction` stored procedure.
- [x] **M2.2: Client SQLite Schema & DB Types**
  - [x] SQLite DDL in `packages/sync-engine` with `sync_queue` table and compatibility trigger.
  - [x] TypeScript interfaces in `packages/db-types` with strict BigInt minor units and Supabase `Database` generic.

### Milestone 3: Shared Packages, Auth, Sync Engine & Edge Functions
- [x] **M3.1: Supabase Auth & Google OAuth Integration**
- [x] **M3.2: Offline-First Delta Sync Engine (`packages/sync-engine`)**
  - [x] Mutation outbox queue and push/pull delta protocol.
  - [x] Last-Write-Wins (LWW) deterministic conflict resolution.
- [x] **M3.3: Supabase Edge Functions**

### Milestone 4: Shared UI Library & Web Application Cockpit
- [x] **M4.1: Botanical Minimalist Component Library (`packages/ui`)**
  - [x] Tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`, `#E06A55`), 24px container radius, 12px control radius, <180ms transitions.
  - [x] Card, Button, AmountInput (with BigInt string buffering), BalanceBadge ($\Delta = \text{debits} - \text{credits}$), Dialog, and List primitives.
  - [x] Lossless BigInt currency utilities (`formatMinorToDecimal`, `parseDecimalToMinor`, `formatCurrency`).
- [x] **M4.2: Web Application Cockpit (`apps/web`)**
  - [x] Tailwind CSS configured with Venzer design tokens, 24px container radius, 12px control radius, 150ms transitions.
  - [x] Safe BigInt serialization layer for RSC boundaries (`apps/web/src/lib/money/serialization.ts`).
  - [x] Pre-validation and Supabase server actions (`apps/web/src/lib/supabase/actions.ts`).
  - [x] Responsive navigation shell (Desktop Sidebar + Mobile Bottom Tab Bar) with max 3 visual groups per view.
  - [x] View 1: Net Worth & Liquidity Cockpit (`/`).
  - [x] View 2: Cash Flow & Trajectory view (`/cash-flow`).
  - [x] View 3: Multi-Split Transaction Entry with sub-50ms live BalanceBadge (`/transactions`).
  - [x] View 4: IOU & Bilateral Debt Tracker with One-Click Contra Clearing Settlement (`/ious`).
  - [x] View 5: Authentication Login View with Google OAuth (`/login`).

### Milestone 5: Mobile Application (Expo / React Native)
- [x] **M5.1: Mobile Application Setup (`apps/mobile`)**
  - [x] Fixed discriminated union in `apps/mobile/src/lib/auth/biometrics.ts:21` and ambient types in `env.d.ts`.
  - [x] Configured `babel.config.js` and `tsconfig.json` with `allowImportingTsExtensions: true`.
  - [x] Implemented isomorphic UUID generator `generateUUID()` in `packages/sync-engine/src/utils/uuid.ts` removing `node:crypto`.
  - [x] Implemented Venzer design tokens in `apps/mobile/src/lib/theme/tokens.ts` and pure BigInt formatters in `format.ts`.
  - [x] Scaffolded UI primitives: `Card`, `Button`, `AmountInput`, `BalanceBadge` (live sub-50ms balance check), `StatPill`.
  - [x] Implemented 4 core screens conforming to $\le 3$ visual component groups: `NetWorthScreen`, `CashFlowScreen`, `TransactionEntryScreen` (with dynamic splits & auto-balance wizard), `IOUTrackerScreen` (with contra clearing `SettlementModal`), and `BiometricLockScreen`.
  - [x] Configured Bottom Tab Navigator with 150ms GPU-accelerated transitions and Root Stack Navigator.
- [x] **M5.2: Immediate Offline SQLite Writes (<50ms)**
  - [x] Implemented `ExpoSQLiteAdapter` in `apps/mobile/src/lib/storage/expo-sqlite-adapter.ts` with BigInt parameter normalization.
  - [x] Implemented `DatabaseProvider` and reactive hooks: `useAccounts.ts`, `useTransactions.ts`, `useIOUs.ts`.
  - [x] Offline transaction write latency verified at ~0.29ms mean, 1.81ms P99, well within sub-50ms SLA.
  - [x] Double-entry balancing and atomic rollback on out-of-balance entries verified.
- [x] **M5.3: Background Sync Integration**
  - [x] Implemented `useBackgroundSync.ts` with AppState foregrounding trigger and 60-second periodic delta sync.
  - [x] Verified automatic queuing of offline transactions and IOU settlements into `sync_queue` with status `'PENDING'`.
- [x] **M5.4: Mobile Biometric Security Integration**
  - [x] Integrated `expo-local-authentication` in `apps/mobile/src/lib/auth/biometrics.ts` and `BiometricLockScreen.tsx`.
  - [x] Supported hardware prompt with graceful fallback on headless/emulator environments.
- [x] **M5.5: Automated Mobile Verification & Stress Testing**
  - [x] Created `tests/mobile/mobile.test.ts` (10/10 tests pass in 32ms).
  - [x] Executed adversarial stress suites (31/31 tests pass).
  - [x] Monorepo build and master E2E runner pass 100%.

### Milestone 6: Final Verification & Test Suite Passing
- [x] **M6.1: E2E Test Suite Execution (Tiers 1–4)**
  - [x] 11 test suites comprising 63 test cases passing 100% via `node --experimental-strip-types tests/e2e/runner.ts`.
- [x] **M6.2: Adversarial Coverage Hardening (Tier 5)**
  - [x] Tier 5 Backend Adversarial Suite (`tests/e2e/tier5-backend-adversarial.ts`): 44/44 tests passing covering Edge Functions, triggers, RPCs, sync engine retries & LWW.
  - [x] Tier 5 Frontend Adversarial Suite (`tests/e2e/tier5-frontend-adversarial.ts`): 25/25 tests passing covering UI formatters, BigInt serialization, pre-commit validation, mobile storage normalization, and AST layout invariants.
  - [x] Total repository test verification: 196/196 tests passing across all suites with 100% success rate.

### Milestone 7: Git Push, CI/CD & Production Deployment
- [x] **M7.1: Git Repository Initialization & Secret Audit**
  - [x] Verify `.gitignore` strictly excludes credentials, SQLite databases, build artifacts, and secrets.
  - [x] Audit entire codebase for zero plaintext secrets, real JWT tokens, and hardcoded private keys.
  - [x] Ensure synchronized `.env.example` templates across root, `apps/web`, and `apps/mobile`.
  - [x] Stage and commit all codebase assets to `main` branch with conventional commit.
- [x] **M7.2: Remote Repository Linkage & Initial Push**
  - [x] Configure GitHub remote origin (`git remote add origin https://github.com/Abhishek-pk-656/FinVault.git`).
  - [x] Push local `main` branch to remote origin (`git push -u origin main`).
- [ ] **M7.3: CI/CD Pipeline & Automated Quality Gate**
  - [ ] Configure GitHub Actions workflow running monorepo build, linting, and 196-test master verification suite.
- [ ] **M7.4: Production Hosting & Deployment**
  - [ ] Deploy Next.js Web Cockpit on Vercel / Cloudflare Pages.
  - [ ] Configure EAS (Expo Application Services) build pipeline for Android APK/AAB distribution.
