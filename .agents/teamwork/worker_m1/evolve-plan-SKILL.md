---
name: evolve-plan
description: Procedure for proposing and executing changes to the project plan, architecture, or documentation suite.
---

# Skill: Evolve Project Plan

When executing this skill:
1. Review the requested change from the user, verifying adherence to `.agents/rules/00-living-plan-protocol.md`.
2. Check that core invariants (no floating-point money, double-entry equality, RLS tenant isolation) are preserved.
3. Identify all affected documentation files in `docs/` (`01` through `11`).
4. Draft a proposal detailing rationale, advantages, disadvantages, and impacted packages.
5. Prompt the user for explicit approval.
6. Once approved, propagate changes across affected `docs/*.md`, `docs/10-ADR.md`, `TASKS.md`, and `CHANGELOG.md`.
