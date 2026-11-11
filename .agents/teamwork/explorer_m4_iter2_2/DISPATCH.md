# Dispatch: Explorer M4 Iter2 - Server Action Float Cast & Windows Build Script Fix

## Objective
Investigate and design exact, type-safe fix blueprints for:
1. `apps/web/src/lib/supabase/actions.ts:84`: Line casts `p_settlement_amount_minor: Number(amountMinor)`. In JavaScript, `Number` is an IEEE-754 double precision float, violating Rule 01 and AGENTS.md. Design change to pass `amountMinor.toString()` matching PostgREST BIGINT parameter format used in `submitTransactionAction`.
2. `apps/web/package.json`: Build script `"build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"` causes Windows NTFS `EPERM: operation not permitted, mkdir ...` race conditions when rebuilding. Design simplification to `"build": "next build"`.

## Context & Inputs
- `ORIGINAL_REQUEST.md`: `d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md`
- `PROJECT.md`: `d:\programming\New_project\PROJECT.md`
- Reviewer 2 Handoff Report: `d:\programming\New_project\.agents\teamwork\reviewer_m4_2\handoff.md`
- Challenger 2 Handoff Report: `d:\programming\New_project\.agents\teamwork\challenger_m4_2\handoff.md`
- Target Files: `apps/web/src/lib/supabase/actions.ts`, `apps/web/package.json`

## Requirements
1. Inspect `apps/web/src/lib/supabase/actions.ts` around `settleIOUAction`. Verify that PostgREST `settle_iou` RPC accepts string representation for `BIGINT` parameter without precision loss.
2. Inspect `apps/web/package.json`. Verify how Next.js handles internal `.next` cache and that removing `rmSync` ensures clean, deterministic builds on Windows with `pnpm --filter @finvault/web build`.
3. Provide exact file diffs and verification commands in handoff.md. Do NOT implement code directly.


## 2026-11-09T04:19:09Z
You are Explorer M4 Iteration 2 (2/3) investigating the Server Action float cast and Windows build script race condition discovered in Milestone 4.

CRITICAL CONSTRAINTS:
- READ-ONLY: You must NOT write or edit source code or test files. You may only write metadata files (.md) in your designated state folder.
- Read ORIGINAL_REQUEST.md at: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
- Read PROJECT.md at: d:\programming\New_project\PROJECT.md
- Read Reviewer 2 handoff report at: d:\programming\New_project\.agents\teamwork\reviewer_m4_2\handoff.md
- Read Challenger 2 handoff report at: d:\programming\New_project\.agents\teamwork\challenger_m4_2\handoff.md
- Read Gate Status at: d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md
- Your state folder is: d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2

MISSION:
1. Initialize BRIEFING.md and progress.md in your state folder.
2. Investigate apps/web/src/lib/supabase/actions.ts:
   - Examine line 84: p_settlement_amount_minor: Number(amountMinor).
   - Check Supabase RPC settle_iou definition in supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql and verify how PostgREST handles BIGINT arguments.
   - Design exact fix to pass amountMinor.toString() (or BigInt string) without float cast.
3. Investigate apps/web/package.json:
   - Examine build script with inline node -e "rmSync('.next')".
   - Verify why rmSync causes Windows NTFS EPERM file locking errors during next build.
   - Design exact fix to use "build": "next build" and verify build commands on Windows.
4. Output exact file diff blueprints in handoff.md and send completion message to parent orchestrator.
