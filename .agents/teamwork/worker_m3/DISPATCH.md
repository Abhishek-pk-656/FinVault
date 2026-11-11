## 2026-11-08T16:57:08Z
You are Worker M3 for FinVault Milestone 3 (Shared Packages, Auth, Sync Engine & Edge Functions).

## Working Directory & State Folder
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\worker_m3
- Create your state folder and keep progress.md and handoff.md there.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Mandatory Background & Specification Reading
Before modifying or creating any code, read the following files:
1. ORIGINAL_REQUEST.md: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
2. Master Project Plan: d:\programming\New_project\PROJECT.md
3. Explorer 1 Report (Sync Engine & Operations Blueprint): d:\programming\New_project\.agents\teamwork\explorer_m3_1\handoff.md
4. Explorer 2 Report (Supabase Auth & OAuth Blueprint): d:\programming\New_project\.agents\teamwork\explorer_m3_2\handoff.md
5. Explorer 3 Report (Edge Functions & Security Hardening Blueprint): d:\programming\New_project\.agents\teamwork\explorer_m3_3\handoff.md

## Exclusive Write Ownership
You have exclusive write ownership of the following paths:
- packages/sync-engine/src/**
- packages/sync-engine/tests/sync-engine.test.ts
- packages/db-types/src/index.ts
- supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql
- supabase/functions/validate-transaction/index.ts
- supabase/functions/sync-reconcile/index.ts
- apps/web/src/lib/supabase/**
- apps/web/src/app/auth/callback/route.ts
- apps/web/src/middleware.ts
- apps/mobile/src/lib/supabase/**
- apps/mobile/src/lib/auth/**

Do NOT write to files outside these boundaries.

## Detailed Implementation Tasks
Implement the concrete, verified blueprints provided by Explorers 1, 2, and 3:

1. Storage Abstraction & Node 24 Native Adapter (packages/sync-engine/src/storage/):
   - adapter.ts: SQLiteStorageAdapter, QueryResult, RunResult, DatabaseHandle.
   - node-sqlite-adapter.ts: NodeSQLiteAdapter wrapping Node 24 native DatabaseSync with stmt.setReadBigInts(true) for lossless 64-bit integer retrieval, exec(), run(), query(), queryOne(), transaction() with BEGIN/COMMIT/ROLLBACK.
   - memory-sqlite-adapter.ts: in-memory helper for testing.

2. Outbox Queue Lifecycle (packages/sync-engine/src/outbox/outbox-queue.ts):
   - OutboxQueueManager managing sync_queue table.
   - Deterministic status progression: PENDING -> IN_FLIGHT -> SYNCED / FAILED.
   - Increment retry_count on failure; transition to FAILED after MAX_SYNC_RETRIES (5).

3. Bidirectional Delta Synchronization (packages/sync-engine/src/sync/):
   - delta-sync.ts: executeDeltaSync() and syncWithRemote().
   - Push: iterates pending mutations in chronological order (created_at ASC), pre-checks server idempotency to prevent duplicates, handles both production @supabase/supabase-js and test harness SupabaseOracle.
   - Pull: queries modified remote records after lastSyncTimestamp, deterministic Last-Write-Wins (LWW) conflict resolution by version (primary) and updated_at (secondary). Ignores stale remote records. Reconciles soft deletes (is_deleted).

4. Client Financial Operations (packages/sync-engine/src/operations/ & index.ts):
   - initDatabase(dbPath?, adapter?): runs client SQLite DDL, composite indexes, compatibility triggers, enforces foreign_keys = ON.
   - getAccounts(userId?): returns active non-archived accounts with native bigint balance_minor.
   - postTransaction(tx, userId?): client double-entry validation (validateTransactionBalance), atomic transaction writing header + journal entries + dynamic account balance updates (computeAccountBalanceDelta) + enqueuing mutation into sync_queue in <50ms.
   - settleIOU(iouId, amountMinor, accountId, userId?): validates amount <= remaining balance, contra clearing entry, updates IOU remaining balance and status (SETTLED / PARTIAL), records transaction and sync mutation atomically.
   - enqueueMutation(mutation): writes to sync_queue.
   - Barrel export in packages/sync-engine/src/index.ts cleanly exporting all types, adapters, operations, and balance utils.

5. Comprehensive Unit Test Suite (packages/sync-engine/tests/sync-engine.test.ts):
   - Test all 22 features discovered by Explorer 1:
     - Storage adapter query/run/transaction with BigInt precision (> 2^53 - 1)
     - initDatabase schema creation
     - enqueueMutation and status lifecycle (PENDING -> IN_FLIGHT -> SYNCED / FAILED)
     - getAccounts filtering archived accounts
     - postTransaction atomic multi-split with balance delta updates and rollback on imbalance
     - settleIOU full and partial repayments
     - Delta sync push with idempotency deduplication
     - Delta sync pull with LWW conflict resolution
     - Corrupted payload isolation
     - Empty queue sync

6. Database Migration (supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql):
   - Security hardening on post_transaction: reject anon callers, prevent tenant spoofing, revoke EXECUTE from PUBLIC/anon, grant to authenticated and service_role.
   - Atomic settle_iou RPC: row locking FOR UPDATE, validate amount <= remaining_balance, contra clearing account lookup/creation, double-entry transaction posting, balance update, audit logging, revoke from PUBLIC/anon, grant to authenticated and service_role.

7. Supabase Edge Functions:
   - supabase/functions/validate-transaction/index.ts: handle OPTIONS preflight with CORS headers, enforce POST, strict zero-float minor unit validation (prohibit decimals, commas, scientific notation), double-entry invariant verification, structured responses.
   - supabase/functions/sync-reconcile/index.ts: handle OPTIONS preflight with CORS headers, verify Authorization Bearer header, batch mutation validation with zero-float checks.

8. Auth Types & Utilities:
   - packages/db-types/src/index.ts: add UserProfile, AuthUserSession, AuthStatus.
   - apps/web/src/lib/supabase/client.ts & server.ts: @supabase/ssr browser and server clients.
   - apps/web/src/app/auth/callback/route.ts: PKCE code exchange Route Handler.
   - apps/web/src/middleware.ts: session refresh middleware.
   - apps/mobile/src/lib/supabase/secure-store-adapter.ts & client.ts: SecureStore adapter and Supabase client.
   - apps/mobile/src/lib/auth/oauth.ts & biometrics.ts: Google OAuth and biometric authentication helpers.

## Verification & Handoff
Execute ALL verification commands and include the complete terminal output in your handoff.md:
1. node .agents/teamwork/explorer_m1_3/verify-m1.js (must pass 86/86)
2. npx tsc --noEmit --project tsconfig.json (0 errors)
3. npx tsc --noEmit --project packages/db-types/tsconfig.json (0 errors)
4. npx tsc --noEmit --project packages/sync-engine/tsconfig.json (0 errors)
5. node --test packages/sync-engine/tests/client-schema.test.ts (10/10)
6. node --test packages/sync-engine/tests/sync-engine.test.ts (all tests pass)
7. node --experimental-strip-types tests/e2e/runner.ts (63/63)
8. node --experimental-strip-types tests/stress/m1-invariant-stress.ts (42/42)
9. node --experimental-strip-types tests/stress/m2-adversarial-stress.ts (34/34)
10. node --experimental-strip-types tests/stress/m2-challenger1-stress.ts (43/43)

Write your handoff report to d:\programming\New_project\.agents\teamwork\worker_m3\handoff.md following standard sections: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
Notify the orchestrator via send_message when complete.
