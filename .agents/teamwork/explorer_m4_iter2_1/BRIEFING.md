# BRIEFING — 2026-11-09T04:26:00Z

## Mission
Investigate and design type-safe fix blueprints for React Server Component (RSC) BigInt serialization violations across Dashboard and Cash Flow pages.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_1
- Original parent: 867b8adb-e639-414f-92fa-0326940898a2
- Milestone: Milestone 4 Iteration 2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code/tests.
- Write only metadata files (.md) in designated state folder.
- Produce exact file diff blueprints and DTO specifications in handoff.md.
- Double-Entry Ledger Invariant and No Floating-Point Money: minor units kept as string across RSC boundary, parsed to bigint/minor units for formatting safely on client.

## Current Parent
- Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2
- Updated: 2026-11-09T04:19:01Z

## Investigation State
- **Explored paths**:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/components/net-worth/NetWorthHeroCard.tsx`
  - `apps/web/src/components/net-worth/AssetsBreakdownCard.tsx`
  - `apps/web/src/components/net-worth/LiabilitiesBreakdownCard.tsx`
  - `apps/web/src/app/cash-flow/page.tsx`
  - `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`
  - `apps/web/src/components/cash-flow/InflowStreamsCard.tsx`
  - `apps/web/src/components/cash-flow/OutflowStreamsCard.tsx`
  - `apps/web/src/app/ious/page.tsx`
  - `apps/web/src/app/transactions/page.tsx`
  - `apps/web/src/lib/money/serialization.ts`
  - `apps/web/src/lib/supabase/actions.ts`
  - `apps/web/package.json`
- **Key findings**:
  1. `NetWorthHeroCard.tsx` accepts `bigint` props (`netWorthMinor`, `safeToSpendMinor`, `totalAssetsMinor`, `totalLiabilitiesMinor`), leading `page.tsx` to cast `summary.*` to `BigInt(...)`. This crashes React Flight JSON serialization at runtime.
  2. `CashFlowPage` uses literal BigInts (`12000000n`, etc.) in `InflowItem` and `OutflowItem`, and passes `totalInflowsMinor: bigint` and `totalOutflowsMinor: bigint` to `'use client'` components (`CashFlowSummaryCard`, `InflowStreamsCard`, `OutflowStreamsCard`).
  3. `settleIOUAction` in `apps/web/src/lib/supabase/actions.ts:84` casts `amountMinor` via `Number(amountMinor)`, violating Rule 01 (No Floating-Point Money).
  4. `apps/web/package.json:7` runs `rmSync('.next')` before `next build`, causing Windows NTFS `EPERM` race conditions.
  5. Other views (`/ious`, `/transactions`, `AssetsBreakdownCard`, `LiabilitiesBreakdownCard`) already conform to the string-serialized DTO pattern (`SerializedAccount`, `SerializedTransaction`, `SerializedIOURecord`).
- **Unexplored areas**: None. Codebase review is complete.

## Key Decisions Made
- Prop interfaces for `NetWorthHeroCard`, `CashFlowSummaryCard`, `InflowStreamsCard`, and `OutflowStreamsCard` will strictly take string-encoded minor units (`string`), avoiding any native `bigint` values crossing the RSC React Flight serialization boundary.
- Inside client components, string minor units will be safely parsed via `BigInt(str || '0')` and formatted with `formatMinorToDecimal(...)`.
- Add `SerializedCashFlowItem`, `SerializedInflowItem`, and `SerializedOutflowItem` DTOs to `apps/web/src/lib/money/serialization.ts`.

## Artifact Index
- `BRIEFING.md` — Agent state and persistent memory
- `progress.md` — Liveness heartbeat and step tracking
- `handoff.md` — Complete 5-component handoff report with exact diff blueprints
