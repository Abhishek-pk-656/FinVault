## 2026-11-09T03:46:49Z

You are worker_m4, the implementation worker for FinVault Milestone 4 (Shared UI Library & Web Application Cockpit).

Working directory: d:\programming\New_project
State folder: d:\programming\New_project\.agents\teamwork\worker_m4

MANDATORY FIRST STEP:
Read the Original User Request file at:
d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
and the Master Project Scope at:
d:\programming\New_project\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write Ownership:
You have exclusive write ownership of:
- packages/ui/**
- apps/web/**
- PROJECT.md, TASKS.md, CHANGELOG.md (for tracking milestone progress)

Exhaustive Blueprint Inputs to Read:
1. d:\programming\New_project\.agents\teamwork\miner_m4_1\handoff.md (Venzer design tokens, micro-transitions, AmountInput BigInt handling, BalanceBadge, Card, Button, Dialog)
2. d:\programming\New_project\.agents\teamwork\explorer_m4_2\handoff.md (App Router structure, 4 cockpit views wireframes, responsive navigation shell, max 3 visual groups)
3. d:\programming\New_project\.agents\teamwork\explorer_m4_3\handoff.md, data-layer-blueprint.md, build-pipeline-blueprint.md (Safe BigInt serialization, Supabase SSR client/actions, pre-validation, Tailwind config, build pipeline)

Scope of Work & Tasks:
1. Shared UI Library (`packages/ui`):
   - Update `packages/ui/src/tokens.ts` with authoritative Venzer tokens (#040A0A, #DEEEDA, #C7E0BA, #7AAA4A, #90A999, #38424C, #E06A55).
   - Implement/enhance `AmountInput.tsx` with buffered string state for fluid decimal typing without float math, bound to `valueMinor: bigint` via `parseDecimalToMinor` and `formatMinorToDecimal`.
   - Implement/enhance `BalanceBadge.tsx` displaying live delta (Green `#7AAA4A` for Balanced, Terracotta `#E06A55` for Difference).
   - Implement `Card.tsx` (24px soft rounded-3xl), `Button.tsx` (12px rounded-xl, 150ms ease-out transitions), `Dialog.tsx` (modal for settlement and confirmations), `List.tsx` / `ListItem.tsx` (enforcing max 3 data attributes per row).
   - Export all components cleanly in `packages/ui/src/index.tsx`.

2. Next.js 14 Web Cockpit (`apps/web`):
   - Configure `apps/web/tailwind.config.ts` with Venzer color tokens, 24px container radius, 12px control radius, and 150ms transitions.
   - Implement `apps/web/src/lib/money/serialization.ts`: safe BigInt serialization utilities (converting domain models to string minor unit DTOs for RSC boundaries, eliminating `TypeError: Do not know how to serialize a BigInt`).
   - Implement Supabase data actions in `apps/web/src/lib/supabase/actions.ts`: pre-validating double-entry balance before calling `post_transaction` RPC, and executing `settle_iou` RPC.
   - Implement responsive Navigation shell in `apps/web/src/components/navigation/`: Desktop sidebar and mobile bottom tab bar, strictly respecting the max 3 visual component groups rule.
   - Implement View 1: Net Worth Cockpit (`apps/web/src/app/page.tsx`): Hero net worth card, Assets breakdown card, Liabilities breakdown card.
   - Implement View 2: Cash Flow View (`apps/web/src/app/cash-flow/page.tsx`): Monthly trajectory card (Savings Rate, Daily Burn Rate), Inflow streams card, Outflow streams card.
   - Implement View 3: Multi-Split Transaction Entry (`apps/web/src/app/transactions/page.tsx`): Header card (Date, Description, live `BalanceBadge`, Auto-Balance helper), dynamic multi-leg splits entry card (add/remove legs, account selector, AmountInput with live sub-50ms BalanceBadge update), recent transactions audit card.
   - Implement View 4: IOU & Peer Debt Tracking (`apps/web/src/app/ious/page.tsx`): Peer debt summary card, active IOUs card (with remaining balance progress bar and One-Click Settle button), settled IOUs card, and One-Click Settlement Modal invoking contra clearing logic.
   - Implement View 5: Login Page (`apps/web/src/app/login/page.tsx`): Minimalist authentication card with Google OAuth sign-in.

3. Scope & Living Documentation Updates:
   - In `PROJECT.md`: mark M3 as `DONE` and M4 as `IN_PROGRESS`.
   - In `TASKS.md`: update checklist to reflect M3 completion and M4 implementation progress.
   - In `CHANGELOG.md`: document M3 completion and M4 UI library & web application features.

4. Mandatory Verification Commands:
   Run each command and document verbatim output in handoff.md:
   - `pnpm --filter @finvault/ui typecheck` (Exit code 0)
   - `pnpm --filter @finvault/web typecheck` (Exit code 0)
   - `pnpm --filter @finvault/web build` (Exit code 0)
   - `node --experimental-strip-types tests/e2e/runner.ts` (63/63 passing, Exit code 0)
   - `node --test packages/sync-engine/tests/client-schema.test.ts` (10/10 passing, Exit code 0)
   - `node --test packages/sync-engine/tests/sync-engine.test.ts` (23/23 passing, Exit code 0)
   - `node .agents/teamwork/explorer_m1_3/verify-m1.js` (86/86 passing, Exit code 0)

5. Handoff:
   Write your complete 5-component handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification Method) with all command logs and verification results to:
   d:\programming\New_project\.agents\teamwork\worker_m4\handoff.md
   Update progress.md throughout and notify parent orchestrator via send_message upon completion.
