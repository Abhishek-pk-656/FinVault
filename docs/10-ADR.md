# Architecture Decision Records (ADR) — FinVault

## ADR-001: Double-Entry Lite Ledger in Integer Minor Units
* **Status:** Accepted
* **Context:** Preventing floating-point rounding errors in financial calculations.
* **Decision:** Store all monetary values as `BIGINT` minor units (cents/paise) and enforce account-to-account journaling.

## ADR-006: Pure Local Wi-Fi (LAN / mDNS) & USB Sync without External Mesh VPNs
* **Status:** Superseded / Deferred to Phase 2 (Self-Hosted Roadmap)
* **Context:** Initial design assumed an always-running desktop server on the local Wi-Fi LAN.
* **Decision:** Superseded by ADR-008 for initial Phase 1 deployment to remove the requirement for an active local host server. Retained as an alternative mode for pure offline/air-gapped users in later phases.

## ADR-007: FinVault Botanical Minimalist Design System & Fast <180ms Micro-Transitions
* **Status:** Accepted
* **Context:** Ensuring consistent, uncluttered UI/UX inspired by clean fintech standards.
* **Decision:** Adopt the botanical mint/sage & obsidian color palette, enforce strict anti-clutter rules (max 3 visual groups per screen), and limit all micro-transitions to `<180ms` with zero heavy animations.

## ADR-008: Adoption of Supabase (PostgreSQL 16) with Google OAuth as Initial Cloud Backend
* **Status:** Accepted
* **Context:** Running a continuous local desktop server (Docker + FastAPI) introduces high friction for initial usage and mobile synchronization. The user requested a free cloud database option with Google/Gmail login.
* **Decision:** Adopt Supabase free tier as the initial backend:
  1. PostgreSQL 16 underlying database preserves the existing relational schema, `BIGINT` minor units, and `pgvector` capabilities.
  2. Built-in Google OAuth provides one-click Gmail sign-in.
  3. PostgREST auto-generated REST API + Supabase Edge Functions eliminate the need to run and maintain a separate FastAPI server initially.
  4. Row-Level Security (RLS) ensures strict tenant data isolation.
  5. Mobile and Web clients retain local-first SQLite offline storage, syncing up to Supabase via `@supabase/supabase-js`.
  6. Standard PostgreSQL foundation ensures zero lock-in: exportable to self-hosted Postgres anytime.

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
