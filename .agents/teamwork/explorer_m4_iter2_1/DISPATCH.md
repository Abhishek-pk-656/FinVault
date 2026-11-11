# Dispatch: Explorer M4 Iter2 - RSC Boundary BigInt Serialization Fix

## Objective
Investigate and design exact, type-safe fix blueprints for the RSC boundary BigInt serialization violations discovered by Reviewer 2 in Milestone 4 Iteration 1:
1. `apps/web/src/app/page.tsx` passing `BigInt(summary.netWorthMinor)` etc. to client component `NetWorthHeroCard.tsx`.
2. `apps/web/src/app/cash-flow/page.tsx` passing native `bigint` amounts (`totalInflowsMinor: bigint`, `inflows: { amountMinor: bigint }[]`, etc.) to client components `CashFlowSummaryCard.tsx`, `InflowStreamsCard.tsx`, and `OutflowStreamsCard.tsx`.

## Context & Inputs
- `ORIGINAL_REQUEST.md`: `d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md`
- `PROJECT.md`: `d:\programming\New_project\PROJECT.md`
- Reviewer 2 Handoff Report: `d:\programming\New_project\.agents\teamwork\reviewer_m4_2\handoff.md`
- Gate Status: `d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md`
- Serialization DTOs: `apps/web/src/lib/money/serialization.ts`

## Requirements
1. Inspect `apps/web/src/app/page.tsx` and `apps/web/src/components/dashboard/NetWorthHeroCard.tsx`. Design props interface accepting string minor units (or `SerializedNetWorthSummary`), parsing/formatting on the client side with `formatMinorToDecimal` from `@finvault/ui`, eliminating any `BigInt(...)` instantiation in Server Component props.
2. Inspect `apps/web/src/app/cash-flow/page.tsx`, `CashFlowSummaryCard.tsx`, `InflowStreamsCard.tsx`, and `OutflowStreamsCard.tsx`. Define string-encoded DTO types for cash flow data (`inflowsMinor: string`, `outflowsMinor: string`, `inflows: { amountMinor: string, ... }[]`) and client component prop signatures.
3. Verify that `pnpm --filter @finvault/web typecheck` will compile cleanly with 0 errors under these changes.
4. Output detailed code diff blueprints in your handoff.md. Do NOT write code directly — recommend fix strategy.
