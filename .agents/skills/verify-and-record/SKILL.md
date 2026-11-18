---
name: verify-and-record
description: Executes two-speed verification across the 5-tier test suite, updates TASKS.md and CHANGELOG.md, and automatically commits and pushes verified work to GitHub.
---

# Skill: Verify, Record & Push
1. **Scoped Fast Gate (Inner Loop):** Run `pnpm --filter <modified-package> typecheck` and `pnpm --filter <modified-package> test` during development; fix any failures before running monorepo-wide tasks.
2. **Full Monorepo Gate (Outer Loop):** Run `pnpm turbo typecheck && pnpm turbo test` to verify a 100% pass rate across all 5 tiers (unit, integration, E2E, and backend/frontend/mobile adversarial suites). Abort immediately if any test or typecheck fails.
3. **Record Progress:** Mark completed items `[x]` in `TASKS.md` and append a concise entry to `CHANGELOG.md`.
4. **Automated Git Commit & Push Gate:**
   - Run `git status` to verify no `.env`, `*.db`, `*.sqlite`, `*.finvault`, or secret files are staged.
   - Stage all verified changes (`git add .`).
   - Create a conventional commit summarizing the completed task (e.g., `feat(<scope>): ...`, `fix(<scope>): ...`, or `chore(<scope>): ...`).
   - Push the commit to the remote repository (`git push`).
