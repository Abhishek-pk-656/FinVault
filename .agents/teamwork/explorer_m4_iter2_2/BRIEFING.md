# BRIEFING — 2026-11-09T04:26:00Z

## Mission
Investigate and design exact blueprints for fixing Server Action float cast in apps/web/src/lib/supabase/actions.ts and Windows build script race condition in apps/web/package.json.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2
- Original parent: 867b8adb-e639-414f-92fa-0326940898a2
- Milestone: Milestone 4 Iteration 2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT write or edit source code or test files. Only write metadata files (.md) in state folder.
- Follow Rule 01 (Double-Entry Ledger Invariant) & Rule 02 (BIGINT minor units / No floating point money).

## Current Parent
- Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2
- Updated: 2026-11-09T04:26:00Z

## Investigation State
- **Explored paths**:
  - `apps/web/src/lib/supabase/actions.ts` (lines 63-96, `settleIOUAction`)
  - `apps/web/src/components/ious/SettlementModal.tsx` (lines 45-60)
  - `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql` (lines 160-303, `settle_iou` RPC definition)
  - `apps/web/package.json` (lines 5-11, `"build"` script)
  - Root `package.json` & `turbo.json`
  - Windows NTFS file locking behavior on Node.js `fs.rmSync`
- **Key findings**:
  1. `apps/web/src/lib/supabase/actions.ts:84`: Line 84 explicitly casts `amountMinor` via `Number(amountMinor)`. `SettlementModal.tsx` passes a string `settlement_amount_minor: amountMinor.toString()`. `settleIOUAction` parses it to `BigInt` to validate positive balance (`amountMinor <= 0n`), but then downcasts to IEEE-754 double precision float before invoking PostgREST RPC `settle_iou`. In PostgreSQL, `settle_iou` expects `p_settlement_amount_minor BIGINT`. PostgREST accepts string-encoded numbers for `BIGINT` and converts them losslessly. Changing line 84 to `p_settlement_amount_minor: amountMinor.toString()` restores strict integer safety matching `submitTransactionAction`.
  2. `apps/web/package.json:7`: The script `"build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"` causes Windows NTFS `EPERM: operation not permitted, mkdir ...` errors. On Windows NTFS, file/folder deletion is asynchronous (`FILE_FLAG_DELETE_ON_CLOSE`), leaving directories in a "delete pending" state. When `next build` immediately starts and invokes webpack, parallel compilers fail to recreate directories under `.next`. Removing the `rmSync` prefix and setting `"build": "next build"` eliminates this race condition completely, enabling clean Next.js 14 builds.
- **Unexplored areas**:
  - None within the assigned scope. All investigation targets explored and verified.

## Key Decisions Made
- Confirmed exact file diff blueprint for `apps/web/src/lib/supabase/actions.ts`.
- Confirmed exact file diff blueprint for `apps/web/package.json`.
- Confirmed independent verification commands and invalidation conditions.

## Artifact Index
- `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2\BRIEFING.md` — Persistent working memory
- `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2\progress.md` — Liveness and progress tracking
- `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2\DISPATCH.md` — Dispatch history
- `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2\handoff.md` — Structured 5-component handoff report
