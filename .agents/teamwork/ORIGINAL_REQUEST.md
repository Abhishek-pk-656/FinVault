# Original User Request

## Approved Task Prompt — 2026-11-08T14:43:30Z

FinVault is a local-first, privacy-preserving personal finance, money lending (IOU), bills, and multi-asset wealth management production application running across Web and Android, powered by a Supabase cloud PostgreSQL backend with Google OAuth and offline-first SQLite client storage. The team will deliver governance and documentation files, database schema with RLS and triggers, web dashboard, mobile application, sync engine, and property-based test suites.

Working directory: d:\programming\New_project
Integrity mode: development

## Requirements

### R1. Project Governance and Documentation Suite
Create and align project governance, operational constitution, and architecture documentation reflecting the Supabase-backed architecture (documenting self-hosted FastAPI and Docker Compose as future scope):
- AGENTS.md, TASKS.md, CHANGELOG.md
- .agents/rules/00-living-plan-protocol.md, .agents/rules/01-financial-ledger-safety.md, .agents/rules/02-frontend-mobile-standards.md
- .agents/skills/evolve-plan/SKILL.md, .agents/skills/db-migration-and-sync/SKILL.md, .agents/skills/verify-and-record/SKILL.md
- docs/01-PRD-AND-ROADMAP.md through docs/11-ENV-AND-MCP.md

### R2. Supabase PostgreSQL Schema, Security, and Ledger Invariants
Configure Supabase PostgreSQL database schema with Row Level Security (RLS) policies ensuring each user's financial data is strictly isolated.
Store all monetary amounts as BIGINT minor units (paise/cents) with no floating-point money.
Implement PostgreSQL Database Functions and Triggers enforcing Double-Entry Lite ledger integrity: reject any transaction where SUM(debits) != SUM(credits) prior to commit.
Provide matching client SQLite / SQLCipher schema for offline mobile storage.

### R3. Authentication, Backend Services, and Sync
Configure Supabase Auth with Google OAuth for user login (Gmail authentication).
Utilize Supabase auto-generated REST API (PostgREST) and deploy Supabase Edge Functions (Deno) for custom server-side validation and business logic.
Implement offline-first delta synchronization between client SQLite storage and Supabase cloud PostgreSQL, resolving conflicts cleanly when reconnecting.

### R4. Frontend Web Dashboard and Mobile Application
Implement monorepo frontend with Next.js 14+, Tailwind CSS, and strict TypeScript using `@supabase/supabase-js`, following the Venzer minimalist design system (high whitespace, transitions under 180ms) with views for net worth, cash flow, transaction entry, and IOU tracking.
Implement React Native / Expo mobile app (Android first, iOS ready) using local SQLite / SQLCipher for immediate offline writes, syncing to Supabase in the background via `@supabase/supabase-js`.

### R5. Verification and Property-Based Testing
Implement automated property-based test suites using fast-check (TypeScript) and database trigger test scripts to verify:
- Financial ledger invariants: SUM(debits) == SUM(credits) across arbitrary multi-split transactions
- Strict BIGINT minor units with rejection of floating-point money
- RLS policy isolation between distinct authenticated users
- Offline SQLite writes and sync reconciliation with Supabase

## Verification Resources
No external test suites or fixtures provided. The team must generate synthetic financial transactions, test fixtures, and property-based test generators (fast-check) for automated verification.

## Acceptance Criteria

### Governance & Documentation
- [ ] AGENTS.md, TASKS.md, CHANGELOG.md, all rules in .agents/rules/, all skills in .agents/skills/, and docs/01 through docs/11 are created and document the Supabase architecture while recording self-hosted FastAPI as future roadmap.
- [ ] Turborepo monorepo configuration with pnpm and shared packages (packages/ui, packages/sync-engine, packages/db-types) is established.

### Database & Ledger Safety
- [ ] Supabase SQL migrations define the complete schema with all monetary fields typed as BIGINT minor units.
- [ ] PostgreSQL triggers / database functions enforce SUM(debits) == SUM(credits) and abort non-balancing transactions server-side.
- [ ] Row Level Security (RLS) policies are active and tested to verify cross-user data isolation.
- [ ] SQLite client schema mirrors the PostgreSQL schema with identical BIGINT types and constraints.

### Backend, Auth & Sync
- [ ] Supabase Auth is configured to support Google OAuth sign-in.
- [ ] Supabase Edge Functions deploy and handle custom transaction validation logic.
- [ ] Sync mechanism correctly replicates offline SQLite transactions to Supabase and reconciles remote deltas.

### Web & Mobile Applications
- [ ] Next.js web application builds with strict TypeScript and renders net worth, cash flow, transaction entry, and IOU tracker views using `@supabase/supabase-js`.
- [ ] React Native / Expo mobile application builds, performs offline writes to SQLite, and synchronizes with Supabase when online.

### Testing & Invariant Verification
- [ ] Property-based tests (fast-check) verify ledger balancing and BIGINT arithmetic without floating-point errors.
- [ ] End-to-end or integration tests verify RLS isolation and offline-to-online sync flow.



## Follow-up — 2026-11-09T02:56:24Z

The quota limit has reset and the server has restarted. Please resume operations where you left off (Milestone 3 review / Milestone 4).


## Follow-up — 2026-11-09T08:01:07Z

The quota reset period has completed and the server has restarted. Please resume all operations where you left off (Milestone 4 gate review / Milestone 5 mobile app).


## Follow-up — 2026-11-09T13:05:17Z

The quota reset period has finished and the server has restarted. Please resume all operations where you left off (Milestone 5 Mobile App implementation).
