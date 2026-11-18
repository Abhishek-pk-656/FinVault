# AGENTS.md — FinVault Root Router & Execution Guardrails

## 1. Project & Active Stack Truth (Phases 1–2)

FinVault is an offline-first personal finance, IOU lending, bill, and wealth management platform.

- **Monorepo:** Turborepo + pnpm workspaces (`tsconfig.base.json`)[cite: 2].
- **Backend & Database (`supabase/`):** Supabase Cloud PostgreSQL 16, Row-Level Security (`auth.uid() = user_id`), Google OAuth (PKCE), and Deno Edge Functions (`supabase/functions/`)[cite: 2]. (Note: Python FastAPI & `pgvector` are strictly reserved for Phase 3 AI/ML sidecar services; never generate Python/Alembic code for Phase 1–2 tasks)[cite: 1, 2, 3].
- **Shared Packages:** `packages/db-types` (TypeScript schema interfaces), `packages/sync-engine` (SQLite DDL, `sync_queue` outbox, LWW delta sync), `packages/ui` (Botanical Minimalist primitives & BigInt currency utilities)[cite: 2].
- **Applications:** `apps/web` (Next.js 14+ App Router) and `apps/mobile` (Expo / React Native with `ExpoSQLiteAdapter` & hardware biometrics)[cite: 2].

## 2. Model & Token Efficiency Protocol (Zero Quality Compromise)

1. **Surgical Context Reads:** Never read all files in `docs/` at once. Load only the specific `@docs/...` file required for the active task[cite: 1].
2. **Contract-First Edits:** Before modifying `apps/web` or `apps/mobile`, read `packages/db-types` and `packages/ui` first to prevent type mismatches and redundant component creation[cite: 2].
3. **Two-Speed Verification Loop:**
   - **Inner Loop (During file edits):** Run scoped checks (`pnpm --filter <workspace> typecheck` and `pnpm --filter <workspace> test`) to validate changes in a single turn.
   - **Outer Loop (Before task completion):** Execute the `verify-and-record` skill to run the full 5-tier monorepo suite (`pnpm turbo typecheck && pnpm turbo test`), update `TASKS.md` and `CHANGELOG.md`, and automatically commit and push the verified changes to GitHub.

## 3. Non-Negotiable Quality Invariants

1. **Zero Floating-Point Money:** Store and compute all currency in `BIGINT` minor units (paise/cents). Use lossless string-buffered `BigInt` serialization across RSC and API boundaries[cite: 2].
2. **Double-Entry Integrity:** Every transaction must satisfy `SUM(debits) == SUM(credits)` enforced by `trg_verify_transaction_balance` and `post_transaction`[cite: 2].
3. **Destructive Command Ban:** Never execute `rm -rf`, `DROP TABLE`, or `supabase db reset` without explicit user confirmation[cite: 1].

## 4. Progressive Disclosure Pointers

- Product & Roadmap: `@docs/01-PRD-AND-ROADMAP.md`[cite: 1]
- Architecture & Stack: `@docs/02-ARCHITECTURE-AND-STACK.md`[cite: 1]
- Botanical Design System: `@docs/03-DESIGN-SYSTEM.md`[cite: 1]
- Database & Triggers: `@docs/04-DATABASE-SCHEMA.md`[cite: 1]
- Security & RLS: `@docs/05-SECURITY-AND-COMPLIANCE.md`[cite: 1]
- 5-Tier QA & Adversarial Tests: `@docs/06-TESTING-AND-QA.md`[cite: 1, 2]
- CI/CD & Cloud Deployment: `@docs/07-DEPLOYMENT-AND-OBSERVABILITY.md`[cite: 1]
- Standards & Changelog: `@docs/08-STANDARDS-AND-CHANGELOG.md`[cite: 1]
- API & Sync Contracts: `@docs/09-API-CONTRACTS.md`[cite: 1]
- Architecture Decisions: `@docs/10-ADR.md`[cite: 1]
- Environment & Config: `@docs/11-ENV-AND-MCP.md`[cite: 1]
