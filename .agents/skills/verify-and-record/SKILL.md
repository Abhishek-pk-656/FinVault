---
name: verify-and-record
description: Executes 4-layer verification (monorepo tests, live Web Playwright + Browser Subagent visual QA, live Mobile MCP/Maestro + logcat QA), updates TASKS.md and CHANGELOG.md, and commits/pushes only when all gates pass.
---

# Skill: 4-Layer Verify, Inspect, Record & Push
1. **Layer 1 — Monorepo Static, Math & Adversarial Gate (Always Required):**
   - Run `pnpm turbo typecheck && pnpm turbo test` and confirm 100% pass rate across all 5 tiers. Abort immediately on any failure.
2. **Layer 2 — Live Web Regression & Visual QA (Required whenever `apps/web` or `packages/ui` changed):**
   - Run `pnpm --filter @finvault/web test:e2e` (all Playwright regression specs must pass so older routes are never broken).
   - Start `apps/web` locally (`http://localhost:3000`) and use the Antigravity Browser Subagent (`/browser`) to open both the newly modified route and at least two existing routes (`/`, `/cash-flow`, `/transactions`, `/ious`).
   - Visually inspect screenshots to confirm zero console errors, zero 5xx network errors, zero layout clipping, and strict compliance with FinVault Botanical Minimalist tokens and max 3 component groups per view.
3. **Layer 3 — Live Mobile Regression, Visual & Crash QA (Required whenever `apps/mobile`, `packages/ui`, or `packages/sync-engine` changed):**
   - Run `adb devices` to check if `emulator-5554` (or a connected Android device) is active.
   - If active:
     - Clear logcat (`adb logcat -c`).
     - Run `pnpm --filter @finvault/mobile test:maestro` to replay all existing mobile regression flows.
     - Use `mobile-mcp` to inspect the live screen hierarchy and take a visual screenshot of the modified screen to confirm layout and Botanical Minimalist consistency.
     - Run `pnpm --filter @finvault/mobile qa:logcat-check` to confirm zero fatal Android or React Native JS exceptions.
   - If no emulator is booted, explicitly warn the user in the final summary that Layer 3 live mobile QA was skipped because `emulator-5554` was offline, and do NOT claim mobile UI was visually verified.
4. **Layer 4 — Record & Automated Git Gate:**
   - Mark completed tasks `[x]` in `TASKS.md` and append a concise entry to `CHANGELOG.md`.
   - Run `git status` to verify no `.env`, `.env.test.local`, `playwright/.auth/`, `*.db`, `*.sqlite`, or `*.finvault` files are staged.
   - Stage, commit with a conventional commit message, and run `git push` ONLY after Layers 1–3 pass.
