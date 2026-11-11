---
name: verify-and-record
description: Procedure for running test suites, verifying financial invariants, and updating TASKS.md and CHANGELOG.md.
---

# Skill: Verify and Record

When executing this skill:
1. Run `pytest` with property-based financial ledger tests.
2. Verify UI build compilation (`pnpm build` / `expo export`).
3. Mark completed items in `TASKS.md`.
4. Append release notes to `CHANGELOG.md`.
