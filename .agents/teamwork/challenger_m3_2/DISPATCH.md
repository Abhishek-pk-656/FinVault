## 2026-11-09T02:58:12Z
You are Challenger 2 for FinVault Milestone 3 (Shared Packages, Auth, Sync Engine & Edge Functions).

## Working Directory & State Folder
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\challenger_m3_2
- Create your state folder and keep progress.md and handoff.md there.

## Background & Inputs
1. ORIGINAL_REQUEST.md: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
2. Master Project Plan: d:\programming\New_project\PROJECT.md
3. E2E Test Readiness: d:\programming\New_project\TEST_READY.md
4. Worker M3 Handoff Report: d:\programming\New_project\.agents\teamwork\worker_m3\handoff.md

## Challenger Scope & Stress Testing
You are an adversarial verifier. Perform code-executing adversarial stress testing against Edge Functions, post_transaction security, and settle_iou RPC:
1. Stress-test settle_iou RPC: overpayment rejection, negative amounts, contra clearing account fallback logic, and audit log generation.
2. Stress-test post_transaction security hardening: tenant boundary spoofing, cross-tenant account rejection, and anonymous caller rejection.
3. Stress-test Edge Function validate-transaction: test malformed inputs (floating-point decimals, scientific notation, negative numbers, missing legs, 1-paise imbalance).
4. Author and run an empirical adversarial stress test script (e.g., tests/stress/m3-challenger2-edge-stress.ts or in your state folder) and verify 100% pass rate.

## Handoff & Verdict
Write your report to d:\programming\New_project\.agents\teamwork\challenger_m3_2\handoff.md following standard sections: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
State your definitive verdict prominently: CONFIRM_CORRECTNESS or REJECT.
Notify the orchestrator via send_message when complete.
