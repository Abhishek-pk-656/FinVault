## 2026-11-09T09:02:32Z
You are Worker M4 Iteration 4 (worker_m4_iter4).
Your state folder is d:\programming\New_project\.agents\teamwork\worker_m4_iter4.
You MUST write all your progress updates to d:\programming\New_project\.agents\teamwork\worker_m4_iter4\progress.md and your final handoff report to d:\programming\New_project\.agents\teamwork\worker_m4_iter4\handoff.md.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & Inputs
Milestone 4 Iteration 3 failed due to a Forensic Auditor INTEGRITY VIOLATION because Next.js 14 on Windows NTFS intermittently produced `ENOENT: ...pages-manifest.json` and `page.js.nft.json` during builds.
Read:
- d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\programming\New_project\PROJECT.md
- d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md
- d:\programming\New_project\.agents\teamwork\orchestrator_1\DEAD_ENDS.md
- d:\programming\New_project\.agents\teamwork\auditor_m4_iter3\handoff.md
- d:\programming\New_project\.agents\teamwork\explorer_m4_iter4_2\handoff.md
- d:\programming\New_project\.agents\teamwork\explorer_m4_iter4_3\handoff.md
- d:\programming\New_project\.agents\skills\verify-and-record\SKILL.md

## Exclusive Write Ownership
You have exclusive write ownership of:
- `apps/web/next.config.mjs`
Do NOT modify any other files outside your assigned boundary.

## Objective & Task
Apply the verified 4-pillar blueprint to `apps/web/next.config.mjs`.

## Mandatory Verification Protocol
Execute the following verification commands from workspace root (`d:\programming\New_project`):
1. **Consecutive Next.js Web Builds (Run 5 consecutive times)**:
   `pnpm --filter @finvault/web build`
   Every single one of the 5 consecutive runs MUST exit with code 0 without any `ENOENT`, `EPERM`, or type errors.
2. **Full Monorepo Turborepo Build**:
   `pnpm build` (All 4 packages must build successfully with exit code 0).
3. **TypeScript Static Typecheck**:
   `pnpm --filter @finvault/web typecheck` (0 errors).
4. **All Mandated Stress & Invariant Test Suites**:
   - `node --experimental-strip-types tests/stress/m4-auditor-stress.ts` (17/17)
   - `node --experimental-strip-types tests/stress/m4-challenger1-stress.ts` (85/85)
   - `node --experimental-strip-types tests/stress/m4-challenger2-cockpit-stress.ts` (24/24)
   - `node --experimental-strip-types tests/e2e/runner.ts` (63/63)
   - `node --test packages/sync-engine/tests/sync-engine.test.ts` (23/23)
   - `node --test packages/sync-engine/tests/client-schema.test.ts` (10/10)
   - `node .agents/teamwork/explorer_m1_3/verify-m1.js` (86/86)

Record all verbatim logs and results in `d:\programming\New_project\.agents\teamwork\worker_m4_iter4\handoff.md` and message the orchestrator when complete.
