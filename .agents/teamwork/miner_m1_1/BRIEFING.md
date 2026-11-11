# BRIEFING — 2026-11-08T15:03:00Z

## Mission
Discover, probe, and document the complete specification and line-by-line edit instructions for Milestone 1: Governance & Documentation Realignment across all rules, skills, governance files, and docs (01 through 11).

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: M1 Governance & Docs Spec Miner
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\miner_m1_1
- Original parent: 867b8adb-e639-414f-92fa-0326940898a2
- Milestone: M1 Governance & Documentation Realignment

## 🔒 Key Constraints
- Read-only analysis: do NOT write code or modify project files outside .agents/teamwork/miner_m1_1/
- Align documentation and skills with Supabase (PostgreSQL 16, Google OAuth, PostgREST) and Vitest + fast-check, removing stale references to FastAPI, Pytest, Hypothesis, Loguru, Alembic (moving FastAPI / self-hosted Docker to roadmap)
- Complete database trigger function in docs/04-DATABASE-SCHEMA.md with explicit RAISE EXCEPTION and constraint trigger binding
- Produce concrete line-by-line edit and content specification for Worker to apply

## Current Parent
- Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2
- Updated: 2026-11-08T15:03:00Z

## Task Summary
- **What to build**: Full specification and line-by-line edit map for Milestone 1 Governance & Documentation Realignment
- **Success criteria**: All files identified, analyzed, stale references flagged with exact replacement text, schema trigger completed, and clear handoff report delivered to handoff.md
- **Interface contracts**: PROJECT.md, ORIGINAL_REQUEST.md
- **Code layout**: PROJECT.md

## Key Decisions Made
- Confirmed defective rule globs (`**/backend/**`, `**/frontend/**`) preventing rule triggering; specified updates to `**/{supabase,packages,apps}/**` and `**/{apps/web,apps/mobile,packages/ui}/**`.
- Enforced strict `BIGINT` minor units (removing `NUMERIC(19,4)` allowance) to maintain architectural invariant.
- Formulated deferred constraint trigger `trg_verify_transaction_balance` using `DEFERRABLE INITIALLY DEFERRED` with explicit `RAISE EXCEPTION` for debit/credit imbalance and zero-entry transactions.
- Supplemented `docs/04` with balance maintenance trigger, user bootstrap trigger, `post_transaction` RPC, and client SQLite schema with `sync_queue`.
- Realigned `docs/05`, `06`, `07`, `08` and skills (`db-migration-and-sync`, `verify-and-record`) to Supabase, Vitest + fast-check, Turborepo, while cleanly preserving self-hosted Docker/FastAPI in future scope.
- Aligned `TASKS.md` directly with the master M1–M6 roadmap in `PROJECT.md`.

## Artifact Index
- DISPATCH.md — Dispatch instructions from orchestrator
- BRIEFING.md — Persistent context & situational awareness
- progress.md — Liveness & step progress tracking
- handoff.md — Final deliverable handoff report containing Features Discovered, Edge Cases, 5-component report, and exact replacement contents for Worker
