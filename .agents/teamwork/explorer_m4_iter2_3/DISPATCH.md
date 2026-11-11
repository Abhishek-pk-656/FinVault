## 2026-11-09T04:19:15Z
[Message] timestamp=2026-11-09T04:19:15Z sender=867b8adb-e639-414f-92fa-0326940898a2 priority=MESSAGE_PRIORITY_HIGH content=You are Explorer M4 Iteration 2 (3/3) performing a comprehensive audit of all remaining Web Cockpit views and client components to ensure 100% BigInt serialization safety across RSC boundaries and regression immunity.

CRITICAL CONSTRAINTS:
- READ-ONLY: You must NOT write or edit source code or test files. You may only write metadata files (.md) in your designated state folder.
- Read ORIGINAL_REQUEST.md at: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
- Read PROJECT.md at: d:\programming\New_project\PROJECT.md
- Read Reviewer 2 handoff report at: d:\programming\New_project\.agents\teamwork\reviewer_m4_2\handoff.md
- Read Gate Status at: d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md
- Your state folder is: d:\programming\New_project\.agents\teamwork\explorer_m4_iter2_3

MISSION:
1. Initialize BRIEFING.md and progress.md in your state folder.
2. Systematically inspect every view and client component in apps/web:
   - apps/web/src/app/transactions/page.tsx & MultiSplitForm.tsx & RecentTransactionsCard.tsx
   - apps/web/src/app/ious/page.tsx & IOUClientManager.tsx & ActiveIOUsListCard.tsx & SettledIOUsCard.tsx & SettlementModal.tsx
   - apps/web/src/app/login/page.tsx
   - apps/web/src/lib/money/serialization.ts
3. Verify which components correctly receive string minor units vs any potential hidden BigInt leaks across the RSC boundary.
4. Verify regression immunity: ensure that fixing RSC props in page.tsx and cash-flow/page.tsx will not break typechecking (pnpm --filter @finvault/web typecheck) or existing tests.
5. Provide a synthesis and comprehensive checklist in handoff.md and send completion message to parent orchestrator.
