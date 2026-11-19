# Changelog — FinVault

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-11-18
### Changed
- **Agent Instruction Suite & Token Efficiency Realignment**: Streamlined root operational router [`AGENTS.md`](file:///d:/programming/New_project/AGENTS.md) and `.agents/rules/` (`00-living-plan-protocol.md`, `01-financial-ledger-safety.md`, `02-frontend-mobile-standards.md`, `03-sync-and-rls-parity.md`) to surgical, contract-first progressive disclosure pointers, optimizing token efficiency.
- **Architectural Documentation Synchronization**:
  - Synchronized [`docs/02-ARCHITECTURE-AND-STACK.md`](file:///d:/programming/New_project/docs/02-ARCHITECTURE-AND-STACK.md), [`docs/06-TESTING-AND-QA.md`](file:///d:/programming/New_project/docs/06-TESTING-AND-QA.md), and [`docs/07-DEPLOYMENT-AND-OBSERVABILITY.md`](file:///d:/programming/New_project/docs/07-DEPLOYMENT-AND-OBSERVABILITY.md) to reflect the active baseline: Turborepo + pnpm monorepo, Supabase Cloud PostgreSQL 16 with RLS, Google OAuth PKCE, Deno Edge Functions, `packages/sync-engine` LWW outbox, `packages/ui`, `apps/web` with BigInt RSC safety, `apps/mobile` with `ExpoSQLiteAdapter` (<0.3ms write latency) & biometrics, and the 5-tier 196-test suite.
  - Formally documented that Python FastAPI, Alembic, Pytest, and Hypothesis are reserved strictly for the Phase 3 AI/ML sidecar service (categorization, OCR, embedding pipelines) and are never used in Phase 1–2 ledger or web/mobile tasks.
- **Workspace Test Runner Harmonization**: Synchronized `@finvault/sync-engine` test script to native `node --test` harness matching Node.js SQLite integration, ensuring `pnpm turbo test` and `pnpm turbo typecheck` pass across all 5 workspace packages with zero errors and 196/196 test verification passing cleanly.
- **Automated Verification, Record & Push Gate**: Upgraded `.agents/skills/verify-and-record/SKILL.md` and `AGENTS.md` to automate Git conventional commit and push upon completion of the 5-tier verification suite.
- **Milestone 7 CI/CD & Deployment Readiness**:
  - Created GitHub Actions automated CI gate (`.github/workflows/ci.yml`) enforcing frozen lockfile, Turborepo typecheck, and full 196-test verification suite on push and PR to `main`.
  - Modernized CI workflow for Ubuntu 24.04 runners and Node.js 22 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` execution flags.
  - Resolved `apps/mobile` TypeScript `process.env` type resolution by introducing `apps/mobile/env.d.ts` and `@types/node`.
  - Audited Supabase Deno Edge Functions and added root convenience scripts (`supabase:link`, `supabase:push`, `supabase:deploy-functions`).
  - Configured Vercel web cockpit (`apps/web/vercel.json`) with Next.js framework preset and security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
  - Configured Expo EAS standalone Android APK profile (`apps/mobile/eas.json`), package identifier `com.finvault.app`, and biometric/sqlite plugins in `apps/mobile/app.json`.
  - Declared `fast-check` in root and mobile workspaces and configured `.npmrc` (`shamefully-hoist=true`) to guarantee clean ESM module resolution for root-level test runners during GitHub Actions CI.
  - **Vercel Cloud Deployment Hardening & 500 Error Remediation**:
    - Diagnosed Vercel runtime `500: Internal Server Error` caused by disabled `outputFileTracing` and unhandled session lookups on unauthenticated routes.
    - Environment-gated Windows NTFS asset flush plugins and `outputFileTracing: false` to local Windows non-Vercel runs (`process.platform === 'win32' && !process.env.VERCEL`), allowing Vercel serverless builds to perform standard client module tracing.
    - Hardened `apps/web/src/middleware.ts` with early exclusion of `/_next` data/asset requests, `try/catch` guard over Supabase auth calls, and support for demo session cookies.
    - Hardened all `apps/web` Server Components (`/`, `/cash-flow`, `/transactions`, `/ious`) with server-side `isAuthenticatedSession()` redirect guards so unauthenticated requests cleanly navigate to `/login` with zero 500 crashes.
    - Updated `apps/web/src/app/login/page.tsx` demo button to set `finvault-demo` cookie for local interactive testing.
  - **Linked Cloud CLI Capabilities Protocol**: Updated `.agents/skills/db-migration-and-sync/SKILL.md` and `docs/11-ENV-AND-MCP.md` documenting authenticated agent execution for `npx supabase db push --remote`, `npx supabase functions deploy`, `npx vercel env ls`, and `npx vercel logs`.
  - **Milestone 7.6 Expo EAS Android APK Configuration & Plugin Fix**:
    - Removed redundant `"expo-sqlite"` config plugin entry in `apps/mobile/app.json` (autolinked natively in Expo SDK 51) while preserving `ExpoSQLiteAdapter` in `package.json`.
    - Added `"cli": { "appVersionSource": "local" }` in `apps/mobile/eas.json` to resolve EAS CLI versioning warnings while keeping preview APK configuration.
    - Verified `apps/mobile` configuration with `expo config --json` and configured live Supabase project credentials in `apps/mobile/.env`.
    - Provisioned Botanical Minimalist launcher and adaptive icon PNG assets in `apps/mobile/assets/` to satisfy Android prebuild asset generation.
    - Configured Metro bundler `resolveRequest` hook in `apps/mobile/metro.config.js` to alias `node:sqlite` to `apps/mobile/src/shims/node-sqlite-shim.js`, allowing React Native / Hermes release bundling while preserving Node.js test runner compatibility.
  - Added `ADR-011: Managed Cloud Deployment Topology (Supabase Cloud + Vercel + Expo EAS APK)` in `docs/10-ADR.md` and updated `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md` with full deployment and rollback playbooks.

## [1.1.0] - 2026-11-11
### Added
- **Milestones 1–6 Core Platform Release**: Complete implementation and full verification of the FinVault privacy-first personal finance platform across Web and Android.
- **Monorepo Foundation & Governance (Milestone 1)**: Turborepo monorepo structure with pnpm workspaces, strict TypeScript bases, living plan protocols (`.agents/rules/`), and aligned architectural specifications (`docs/01`–`docs/11`).
- **Database Architecture & Ledger Invariants (Milestone 2)**:
  - Supabase PostgreSQL schema with `BIGINT` minor currency units (paise/cents), prohibiting floating-point money.
  - Server-side `DEFERRABLE INITIALLY DEFERRED` constraint trigger enforcing $\sum \text{debits} == \sum \text{credits}$.
  - Balance maintenance triggers with optimistic concurrency versioning, user signup bootstrap triggers, and atomic `post_transaction` RPC.
  - Strict Row Level Security (RLS) isolating user data by `auth.uid() = user_id`.
  - Client SQLite symmetrical schema parity and TypeScript definitions in `packages/db-types`.
- **Sync Engine & Cloud Functions (Milestone 3)**:
  - Offline-first delta sync engine in `packages/sync-engine` featuring mutation outbox queuing (`sync_queue`), push/pull reconciliation, and deterministic Last-Write-Wins (LWW) conflict resolution.
  - Supabase Edge Functions (`validate-transaction`, `sync-reconcile`) and Google OAuth PKCE auth flow.
- **Shared Design System & Web Cockpit (Milestone 4)**:
  - Botanical Minimalist UI component library (`packages/ui`) adhering to Venzer tokens, 24px container radius, 12px control radius, and <180ms transitions.
  - Lossless `BigInt` currency parsing/formatting and real-time sub-50ms `BalanceBadge`.
  - Next.js 14 Web Cockpit (`apps/web`) with safe RSC `BigInt` serialization, Server Actions, and 5 interactive views (Net Worth, Cash Flow, Multi-Split Transactions, IOU Contra Clearing, and Auth).
- **Mobile Application (Milestone 5)**:
  - React Native / Expo application (`apps/mobile`) for Android (iOS ready) featuring isomorphic UUID generation and hardware biometrics (`expo-local-authentication`).
  - High-performance `ExpoSQLiteAdapter` with sub-millisecond offline write latency (0.29ms mean, well below the 50ms SLA).
  - Background delta sync on AppState foregrounding and periodic intervals.
- **Master Test Verification Suite (Milestone 6)**:
  - 196/196 passing automated tests (100% pass rate) across Tiers 1–4 E2E suites and Tier 5 Backend/Frontend adversarial hardening suites.
- **Milestone 7 Initialization**: Pre-push git audit, comprehensive secret scanning, hardened `.gitignore`, synchronized `.env.example` templates, and deployment readiness.

## [1.0.0] - 2026-03-05
### Added
- Initial project blueprint and governance structure for Antigravity IDE.
- Progressive disclosure documentation suite (`docs/01` through `docs/11`).
- Living Plan & Propose-Approve-Propagate Protocol (`.agents/rules/00-living-plan-protocol.md`).
- FinVault Botanical Minimalist Design System with `<180ms` fluid micro-transitions (`ADR-007`).
- Double-Entry Lite financial ledger specification in `BIGINT` minor units (`ADR-001`).
