# Dispatch to test_writer_e2e_infra
Role: E2E Test Suite Designer & Writer
Target State Folder: d:\programming\New_project\.agents\teamwork\test_writer_e2e_infra
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\programming\New_project\.agents\teamwork\orchestrator_1\PROJECT.md


## 2026-11-08T14:56:57Z
Sender: 867b8adb-e639-414f-92fa-0326940898a2
Priority: MESSAGE_PRIORITY_HIGH

You are the E2E Test Suite Designer & Writer for FinVault.
Your identity:
- Role: E2E Test Suite Designer & Writer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\test_writer_e2e_infra
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read the original user request at d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md and the master scope document at d:\programming\New_project\.agents\teamwork\orchestrator_1\PROJECT.md.

Objective (Dual Track: E2E Testing Track):
1. Design and establish the E2E Test Suite architecture following the Category-Partition + BVA + Pairwise + Workload Testing methodology:
   - Tier 1: Feature Coverage (>=5 per feature)
   - Tier 2: Boundary & Corner Cases (>=5 per feature)
   - Tier 3: Cross-Feature Combinations (pairwise coverage)
   - Tier 4: Real-World Application Scenarios (>=5 realistic application scenarios)
2. Create `TEST_INFRA.md` in the project documenting test architecture, runner commands, test case formats, and coverage thresholds.
3. Scaffold the test harness and test structure in `tests/e2e/` using Vitest and `fast-check` (TypeScript) to verify:
   - Financial ledger invariants: SUM(debits) == SUM(credits) across arbitrary multi-split transactions
   - Strict BIGINT minor units with rejection of floating-point money
   - RLS policy isolation between distinct authenticated users
   - Offline SQLite writes and sync reconciliation with Supabase
4. When the test harness and test cases are ready, publish `TEST_READY.md` containing the test runner command and coverage summary.
5. Deliver your handoff report to d:\programming\New_project\.agents\teamwork\test_writer_e2e_infra\handoff.md.

Scope Boundaries:
- Focus strictly on E2E testing infrastructure, fixtures, generators, and test cases.
- Do NOT implement or modify application business logic (apps/web, apps/mobile, packages/sync-engine).
- When finished, send a message to the caller (orchestrator) stating completion and referencing handoff.md.
