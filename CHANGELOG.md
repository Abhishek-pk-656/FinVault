# Changelog — FinVault

All notable changes to this project will be documented in this file.

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
