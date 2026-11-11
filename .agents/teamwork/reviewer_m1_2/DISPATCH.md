# Dispatch to reviewer_m1_2
Role: M1 Monorepo & Schema Reviewer
Target State Folder: d:\programming\New_project\.agents\teamwork\reviewer_m1_2
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\programming\New_project\PROJECT.md
Worker Report: d:\programming\New_project\.agents\teamwork\worker_m1\handoff.md


## 2026-11-08T15:24:09Z
You are the M1 Monorepo & Schema Reviewer for FinVault.
Your identity:
- Role: M1 Monorepo & Schema Reviewer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\reviewer_m1_2
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read the original request at d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md, the master scope document at d:\programming\New_project\PROJECT.md, TEST_READY.md, and the worker handoff at d:\programming\New_project\.agents\teamwork\worker_m1\handoff.md.

Objective:
1. Review the monorepo configuration (package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, tsconfig.json).
2. Review the schema in supabase/migrations/20261108000000_init_finvault_schema.sql and client schema in packages/sync-engine:
   - Ensure 100% of monetary amounts are BIGINT minor units with zero floating-point arithmetic.
   - Verify double-entry deferred constraint trigger trg_verify_transaction_balance (DEFERRABLE INITIALLY DEFERRED) with explicit exception raising on imbalance.
   - Verify Row Level Security (RLS) policies on all tables.
3. Review shared packages (packages/db-types, packages/sync-engine, packages/ui) and application structures (apps/web, apps/mobile).
4. Run `node .agents/teamwork/explorer_m1_3/verify-m1.js` and `tsc --noEmit --project packages/db-types/tsconfig.json`.
5. Issue a clear verdict: APPROVE or REQUEST_CHANGES in your handoff.md.
6. Deliver your report to d:\programming\New_project\.agents\teamwork\reviewer_m1_2\handoff.md.

When finished, send a message to the caller (orchestrator) stating your verdict and referencing your handoff.md.
