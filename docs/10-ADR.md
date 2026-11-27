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

## ADR-011: Managed Cloud Deployment Topology (Supabase Cloud + Vercel + Expo EAS APK)
* **Status:** Accepted
* **Context:** The platform requires reliable, automated, zero-maintenance production hosting across Web (desktop/mobile browser), Mobile (Android standalone APK), and Cloud Database/Edge compute, guarded by continuous integration.
* **Decision:**
  1. **Continuous Integration (GitHub Actions):** `.github/workflows/ci.yml` executes on every push and PR to `main`, validating frozen pnpm dependencies, strict TypeScript typecheck across all workspaces, and the 5-tier 196-test suite before merging or deploying.
  2. **Database & Edge Logic (Supabase Cloud):** PostgreSQL 16 schema, deferred constraint triggers, RLS policies, and Deno Edge Functions (`validate-transaction`, `sync-reconcile`) deployed via official Supabase CLI (`pnpm supabase:link`, `pnpm supabase:push`, `pnpm supabase:deploy-functions`).
  3. **Web Cockpit (Vercel):** Next.js 14+ deployed on Vercel (`apps/web/vercel.json`) with strict security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`), connecting seamlessly to Supabase via `@supabase/ssr` environment variables.
  4. **Mobile Client (Expo EAS Standalone APK):** Configured via `apps/mobile/eas.json` with `preview` profile generating direct Android `.apk` binaries for sideloading and internal testing, paired with `com.finvault.app` bundle package and biometric plugins (`expo-local-authentication`, `expo-sqlite`).

## ADR-012: Store-Tagged Virtual Jars with Priority Pausing & Atomic Auto Top-Up
* **Status:** Accepted
* **Context:** Users want goal-based virtual Jars tied to real bank/cash accounts without creating dozens of real sub-accounts or breaking double-entry ledger integrity when an urgent expense exceeds a Jar's balance.
* **Decision:** Model Jars as store-tagged allocations (`sinking_fund_allocations`) mapped to underlying `ASSET` accounts rather than separate bank transfers:
  1. Each account exposes both its **Real Balance** and its Jar-adjusted **`Free` balance** (`Real - Active Jars - Card Bill Reserves`).
  2. Users assign drag-to-reorder priority to Jars; if a wallet's `Free` balance falls below `0`, lower-priority Jars pause visually (gray slice) without mutating historical balances.
  3. On Jar overspend, an atomic **Auto Top-Up** pulls the exact deficit from the tagged wallet's `Free` balance while retaining the Jar's full spend ledger (`Saved`, `Topped Up`, `Total Spent`, `Remaining`).

## ADR-013: Credit Card Bill Reserve Mechanism for Jar-Funded Card Swipes
* **Status:** Accepted
* **Context:** Paying for a Jar-budgeted purchase with a credit card reduces the Jar's remaining allowance immediately, but actual cash does not leave the bank account until the credit card statement is paid—creating a risk of double-spending that cash.
* **Decision:** Introduce `card_bill_reserves` linked to the spending transaction, credit card (`LIABILITY`), Jar, and designated bank wallet (`ASSET`). When a Jar-funded expense uses a credit card, the spent `BIGINT` minor amount is deducted from the Jar and earmarked as a `Card Bill Reserve` inside the bank wallet's liquidity breakdown until the card bill settlement releases it.

## ADR-014: Client-Side AES-256-GCM Encrypted Banking & Card Info Vault
* **Status:** Accepted
* **Context:** Daily-driver finance users frequently need quick access to account numbers, IFSC codes, and card details alongside their wallet balances, but storing plaintext credentials in Supabase or unencrypted SQLite violates privacy-first security principles.
* **Decision:** Store sensitive account/card details in `vault_secrets` exclusively as client-encrypted **AES-256-GCM** ciphertext with per-record IV and salt metadata. Secrets remain masked by default, require hardware biometric verification (`expo-local-authentication` / WebAuthn gate) to decrypt and reveal in memory, and trigger an automatic 45-second clipboard clear after copying.

## ADR-015: Zero-Cost Visual Design Pipeline (Google Stitch + Local FigCraft Source of Truth)
* **Status:** Accepted
* **Context:** Implementing multi-tab mobile and web V1 screens directly from prose specs risks layout drift and token inconsistency, while paid Figma seat/plugin tooling adds unnecessary friction.
* **Decision:** Standardize on a zero-cost three-stage visual pipeline:
  1. **Google Stitch** for rapid screen exploration across Batch 1 (core daily loop) and Batch 2 (secondary flows).
  2. **FigCraft** (`docs/designs/finvault-v1.figcraft`) as the version-controlled, local master editable design source of truth enforcing Botanical Minimalist tokens and `<= 3` visual groups per screen.
  3. **Antigravity MCP Implementation** translating finalized FigCraft specs directly into `packages/ui`, `apps/web`, and `apps/mobile`.
