# Progress: Explorer M4 Iteration 2 (RSC BigInt Serialization Fix Blueprint)

Last visited: 2026-11-09T04:27:00Z

## Status
- [x] Initialized DISPATCH.md, BRIEFING.md, and progress.md
- [x] Read context: ORIGINAL_REQUEST.md, PROJECT.md, reviewer_m4_2 handoff.md, GATE_STATUS.md
- [x] Investigate `apps/web/src/app/page.tsx` & `NetWorthHeroCard.tsx`
  - Identified root cause: `NetWorthHeroCardProps` expected `bigint`, causing `page.tsx` to invoke `BigInt(...)` on `summary.*` strings before passing them across RSC boundary.
  - Designed new `NetWorthHeroCardProps` accepting string minor units.
  - Designed client-side parsing (`BigInt(string || '0')`) and formatting via `formatMinorToDecimal`.
- [x] Investigate `apps/web/src/app/cash-flow/page.tsx` & cash flow cards
  - Identified root cause: `inflows`/`outflows` arrays contain `amountMinor: bigint` literals; `totalInflowsMinor` and `totalOutflowsMinor` are `bigint`s passed directly across RSC boundary to `'use client'` components.
  - Designed string-encoded DTOs (`SerializedCashFlowItem`, `SerializedInflowItem`, `SerializedOutflowItem`) and updated component prop signatures.
- [x] Investigate `apps/web/src/lib/supabase/actions.ts` & `package.json`
  - Identified `p_settlement_amount_minor: Number(amountMinor)` float leak in `settleIOUAction`.
  - Identified Windows NTFS race condition with `rmSync('.next')` in `package.json`.
- [x] Synthesize findings & compile 9 diff blueprints
- [x] Write `handoff.md` following 5-component protocol
- [x] Send completion message to parent orchestrator
