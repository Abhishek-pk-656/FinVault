# Dispatch: Worker M4 Iteration 2 — Remediation & Hardening

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & Inputs
- `ORIGINAL_REQUEST.md`: `d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md`
- `PROJECT.md`: `d:\programming\New_project\PROJECT.md`
- Gate Status: `d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md`
- Explorer 1 Blueprint: `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_1\handoff.md`
- Explorer 2 Blueprint: `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_2\handoff.md`
- Explorer 3 Audit: `d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_3\handoff.md`
- State Folder: `d:\programming\New_project\.agents\teamwork\worker_m4_iter2`

## Write Ownership
You have exclusive write ownership of:
- `apps/web/src/lib/money/serialization.ts`
- `apps/web/src/components/net-worth/NetWorthHeroCard.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`
- `apps/web/src/components/cash-flow/InflowStreamsCard.tsx`
- `apps/web/src/components/cash-flow/OutflowStreamsCard.tsx`
- `apps/web/src/app/cash-flow/page.tsx`
- `apps/web/src/lib/supabase/actions.ts`
- `apps/web/package.json`

## Tasks to Execute:
1. **`apps/web/src/lib/money/serialization.ts`**:
   Add and export `SerializedCashFlowItem`, `SerializedInflowItem`, and `SerializedOutflowItem` matching Explorer 1 Blueprint 1.
2. **`apps/web/src/components/net-worth/NetWorthHeroCard.tsx`**:
   Update `NetWorthHeroCardProps` to accept string minor units (`netWorthMinor: string`, etc.). Parse to BigInt locally inside the component (`BigInt(netWorthMinor || '0')`) and format with `formatMinorToDecimal(netWorthBn)` per Explorer 1 Blueprint 2.
3. **`apps/web/src/app/page.tsx`**:
   Remove `BigInt(...)` casts across the RSC boundary. Pass `summary.netWorthMinor`, `summary.safeToSpendMinor`, etc. directly as strings per Explorer 1 Blueprint 3. Preserve the `{/* Group 1: ... */}`, `{/* Group 2: ... */}`, `{/* Group 3: ... */}` comments.
4. **`apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`**:
   Update `CashFlowSummaryCardProps` to accept string minor units (`inflowsMinor: string`, `outflowsMinor: string`). Parse to BigInt locally inside the component (`BigInt(inflowsMinor || '0')`), compute net and basis points savings rate safely without float money, and format with `formatMinorToDecimal` per Explorer 1 Blueprint 4.
5. **`apps/web/src/components/cash-flow/InflowStreamsCard.tsx` & `OutflowStreamsCard.tsx`**:
   Update `InflowItem` and `OutflowItem` to use `amountMinor: string`. In component bodies, parse `BigInt(item.amountMinor || '0')` for aggregation and formatting per Explorer 1 Blueprints 5 & 6.
6. **`apps/web/src/app/cash-flow/page.tsx`**:
   Update mock items to use string amounts (`amountMinor: '12000000'`, etc.). Sum with `BigInt(...)` and pass strings (`.toString()`) to `CashFlowSummaryCard` per Explorer 1 Blueprint 7. Preserve `{/* Group 1: ... */}` visual group comments.
7. **`apps/web/src/lib/supabase/actions.ts`**:
   In `settleIOUAction` (line 84), replace `p_settlement_amount_minor: Number(amountMinor)` with `p_settlement_amount_minor: amountMinor.toString()` per Explorer 1 Blueprint 8 / Explorer 2 Blueprint 1.
8. **`apps/web/package.json`**:
   In line 7, replace `"build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"` with `"build": "next build"` per Explorer 1 Blueprint 9 / Explorer 2 Blueprint 2.

## Verification Checklist (Must run all and report results in handoff.md):
1. `pnpm --filter @finvault/web typecheck` (0 errors)
2. `pnpm --filter @finvault/web build` (Exit code 0, 9/9 routes compiled cleanly)
3. `node --experimental-strip-types tests/stress/m4-challenger2-cockpit-stress.ts` (All passed)
4. `node --experimental-strip-types tests/stress/m4-auditor-stress.ts` (All passed)
5. `node --experimental-strip-types tests/e2e/runner.ts` (63/63 passed)
6. `node --test packages/sync-engine/tests/sync-engine.test.ts` (23/23 passed)
7. `node --test packages/sync-engine/tests/client-schema.test.ts` (10/10 passed)
8. `node .agents/teamwork/explorer_m1_3/verify-m1.js` (86/86 passed)


## 2026-11-09T04:28:16Z
[System Message Received - Worker M4 Iteration 2 Dispatch]
Task: Implement verified remediation blueprints for Milestone 4 (Shared UI Library & Web Application Cockpit).
Parent: 867b8adb-e639-414f-92fa-0326940898a2
