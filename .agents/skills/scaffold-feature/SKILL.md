---
name: scaffold-feature
description: Builds new FinVault features across shared UI, Web, and Mobile with mandatory Playwright and Maestro regression tests in a single deterministic pass.
---

# Skill: Cross-Platform Feature Scaffolding
1. **Types & Sync First:** Update or verify data contracts in `packages/db-types` and local SQLite queries in `packages/sync-engine`.
2. **Shared Primitives Second:** Build or extend shared components/utilities in `packages/ui` using FinVault Botanical Minimalist tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`) and lossless `BigInt` string buffers.
3. **Web & Mobile Views Third:** Implement the Next.js view (`apps/web`) and Expo screen (`apps/mobile`) enforcing max 3 visual component groups per view, max 3 data points per row, `24px`/`12px` radii, `<180ms` transitions, and semantic `testID` props.
4. **Regression Tests (Mandatory):**
   - Add unit/adversarial tests for BigInt serialization, AST layout limits, and offline SQLite rollback.
   - Add or extend a Playwright spec in `apps/web/e2e/` covering the new web user flow.
   - Add or extend a Maestro YAML flow in `apps/mobile/.maestro/` covering the new mobile user flow.
5. **Scoped Check:** Run `pnpm --filter <modified-pkg> typecheck` and `pnpm --filter <modified-pkg> test` before invoking `verify-and-record`.
