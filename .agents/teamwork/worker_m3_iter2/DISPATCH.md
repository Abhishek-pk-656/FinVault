## 2026-11-09T03:18:43Z
You are Worker M3 Iteration 2 for FinVault Milestone 3 (Shared Packages, Auth, Sync Engine & Edge Functions).

## Working Directory & State Folder
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\worker_m3_iter2
- Create your state folder and keep progress.md and handoff.md there.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Mandatory Inputs & Blueprints to Read
1. ORIGINAL_REQUEST.md: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
2. Master Project Plan: d:\programming\New_project\PROJECT.md
3. Gate Status & Reviewer Feedback: d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md
4. Reviewer 2 Report: d:\programming\New_project\.agents\teamwork\reviewer_m3_2\handoff.md
5. Explorer 1 Blueprint (Web & Mobile Auth): d:\programming\New_project\.agents\teamwork\explorer_m3_iter2_1\handoff.md
6. Explorer 2 Blueprint (Sync Reconcile Validation): d:\programming\New_project\.agents\teamwork\explorer_m3_iter2_2\handoff.md
7. Explorer 3 Blueprint (IOU Settlement Clearing Account): d:\programming\New_project\.agents\teamwork\explorer_m3_iter2_3\handoff.md

## Exclusive Write Ownership
You have exclusive write ownership of the following paths:
- apps/web/src/middleware.ts
- apps/mobile/src/lib/supabase/client.ts
- apps/mobile/src/lib/auth/oauth.ts
- apps/mobile/src/lib/supabase/secure-store-adapter.ts
- supabase/functions/sync-reconcile/index.ts
- supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql
- packages/sync-engine/src/operations/ious.ts
- packages/sync-engine/tests/sync-engine.test.ts
- tests/stress/m3-challenger2-edge-stress.ts

Do NOT write to files outside these boundaries.

## Remediation Tasks to Apply
Apply the exact, verified blueprints provided by Explorers 1, 2, and 3:

1. Web Middleware Cookie Removal Bug (apps/web/src/middleware.ts):
   - Replace `{ name, value, ...options }` in `remove(name, options)` on lines 30 and 36 with `{ name, value: '', ...options }` matching server.ts and callback/route.ts.

2. Mobile Extensionless Module Specifiers (apps/mobile):
   - In `apps/mobile/src/lib/supabase/client.ts` line 3: change `'./secure-store-adapter.ts'` to `'./secure-store-adapter'`.
   - In `apps/mobile/src/lib/auth/oauth.ts` line 2: change `'../supabase/client.ts'` to `'../supabase/client'`.

3. iOS Keychain 2048-Byte Chunking Adapter (apps/mobile/src/lib/supabase/secure-store-adapter.ts):
   - Implement the 1024-byte chunking adapter with metadata tracking, automatic cleanup of stale chunks, and explicit error re-throwing as designed by Explorer 1.

4. Edge Function Double-Entry Validation Hardening (supabase/functions/sync-reconcile/index.ts):
   - Implement Explorer 2's blueprint: require `entries.length >= 2`, valid non-empty `account_id`, `direction IN ('DEBIT', 'CREDIT')`, strictly positive minor units (`amount_minor > 0n`), `debits > 0n && credits > 0n`, and `debits === credits`. Preserve error routing and strings required by test harnesses.

5. IOU Clearing Account Semantics (supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql):
   - Implement Explorer 3's blueprint: in `settle_iou` RPC (lines 226-246), remove the fallback to `'Opening Balance Equity'`, so `'IOU Clearing'` (`ASSET` for LENT, `LIABILITY` for BORROWED) is dynamically provisioned if not already present.

6. Client IOU Operations (packages/sync-engine/src/operations/ious.ts):
   - Implement Explorer 3's matching logic: remove `'Opening Balance Equity'` fallback, dynamically creating `'IOU Clearing'` (`ASSET` for LENT, `LIABILITY` for BORROWED).

7. Test Suite Alignments:
   - In `tests/stress/m3-challenger2-edge-stress.ts`: update test 4.1.5 (lines 954-977) and `PostgresSettleIOUSimulator` (lines 1065-1072) to drop equity fallback and assert dynamic `'IOU Clearing'` creation.
   - In `packages/sync-engine/tests/sync-engine.test.ts`: add/update test verifying `settleIOU` provisions `'IOU Clearing'` without equity pollution.

## Verification & Handoff
Execute ALL verification commands and include full terminal outputs in your handoff.md:
1. node .agents/teamwork/explorer_m1_3/verify-m1.js (86/86)
2. npx tsc --noEmit --project tsconfig.json (0 errors)
3. npx tsc --noEmit --project packages/db-types/tsconfig.json (0 errors)
4. npx tsc --noEmit --project packages/sync-engine/tsconfig.json (0 errors)
5. node --test packages/sync-engine/tests/client-schema.test.ts (10/10)
6. node --test packages/sync-engine/tests/sync-engine.test.ts (all pass)
7. node --experimental-strip-types tests/e2e/runner.ts (63/63)
8. node --experimental-strip-types tests/stress/m1-invariant-stress.ts (42/42)
9. node --experimental-strip-types tests/stress/m2-adversarial-stress.ts (34/34)
10. node --experimental-strip-types tests/stress/m2-challenger1-stress.ts (43/43)
11. node --experimental-strip-types tests/stress/m3-challenger1-sync-stress.ts (128/128)
12. node --experimental-strip-types tests/stress/m3-challenger2-edge-stress.ts (97/97)
13. node --experimental-strip-types tests/stress/m3-auditor-stress.ts (all pass)

Write your report to `d:\programming\New_project\.agents\teamwork\worker_m3_iter2\handoff.md`.
Notify the orchestrator via send_message when complete.
