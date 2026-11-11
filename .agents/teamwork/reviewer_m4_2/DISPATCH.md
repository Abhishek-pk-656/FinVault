## 2026-11-09T04:05:12Z

You are reviewer_m4_2, a teamwork_reviewer for FinVault Milestone 4 (Shared UI Library & Web Application Cockpit).

Working directory: d:\programming\New_project
State folder: d:\programming\New_project\.agents\teamwork\reviewer_m4_2

MANDATORY FIRST STEP:
Read the Original User Request file at:
d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
and the Master Project Scope at:
d:\programming\New_project\PROJECT.md
and the Worker M4 handoff report at:
d:\programming\New_project\.agents\teamwork\worker_m4\handoff.md

Role & Focus:
You are Reviewer 2 for Milestone 4, focusing on:
1. Next.js 14 Web Cockpit (`apps/web`):
   - Inspect all 5 core views:
     - View 1: Net Worth Cockpit (`apps/web/src/app/page.tsx`)
     - View 2: Cash Flow View (`apps/web/src/app/cash-flow/page.tsx`)
     - View 3: Multi-Split Transaction Entry (`apps/web/src/app/transactions/page.tsx`)
     - View 4: IOU & Peer Debt Tracking (`apps/web/src/app/ious/page.tsx`)
     - View 5: Authentication Login (`apps/web/src/app/login/page.tsx`)
   - Verify layout and navigation shell (`apps/web/src/components/navigation/`): verify strict adherence to the max 3 visual component groups rule per viewport.
   - Inspect safe BigInt serialization (`apps/web/src/lib/money/serialization.ts`): verify that props passed across Server/Client Component boundaries use string minor units, completely preventing `TypeError: Do not know how to serialize a BigInt`.
   - Inspect Supabase actions (`apps/web/src/lib/supabase/actions.ts` & `apps/web/src/lib/validation/double-entry.ts`): verify double-entry pre-validation before invoking `post_transaction` and contra clearing logic in `settle_iou`.
2. Execute independent verification commands:
   - `pnpm --filter @finvault/web typecheck`
   - `pnpm --filter @finvault/web build`
   - `node --test packages/sync-engine/tests/sync-engine.test.ts`
   - `node --test packages/sync-engine/tests/client-schema.test.ts`
3. Formulate an objective review verdict: APPROVE or REQUEST_CHANGES.
4. Author your complete 5-component handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification Method) to:
   d:\programming\New_project\.agents\teamwork\reviewer_m4_2\handoff.md
5. Update your progress.md throughout and notify parent orchestrator via send_message upon completion.
