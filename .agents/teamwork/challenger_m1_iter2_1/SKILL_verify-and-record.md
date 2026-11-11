---
name: verify-and-record
description: Procedure for running test suites, verifying financial invariants with Vitest and fast-check, and updating TASKS.md and CHANGELOG.md.
---

# Skill: Verify and Record

When executing this skill:
1. Run property-based financial ledger tests using Vitest and `fast-check`: `pnpm test` (or `pnpm --filter @finvault/sync-engine test`).
2. Verify PostgreSQL constraint triggers by executing automated migration and trigger validation scripts.
3. Verify monorepo build and type safety: `pnpm turbo build` and `pnpm typecheck`.
4. Update `TASKS.md` marking completed deliverables.
5. Record release notes in `CHANGELOG.md` under `[Unreleased]` and update `docs/10-ADR.md` when architectural decisions change.
