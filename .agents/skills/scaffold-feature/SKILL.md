# File: .agents/skills/scaffold-feature/SKILL.md
---
name: scaffold-feature
description: Builds new FinVault features across shared UI, Web, and Mobile in a single deterministic pass without rework.
---

# Skill: Cross-Platform Feature Scaffolding
1. **Types & Sync First:** Update or verify data contracts in `packages/db-types` and local SQLite queries in `packages/sync-engine`[cite: 2].
2. **Shared Primitives Second:** Build or extend shared components/utilities in `packages/ui` using Botanical Minimalist tokens and lossless `BigInt` string buffers[cite: 2].
3. **Web & Mobile Views Third:** Implement the Next.js view (`apps/web`) and Expo screen (`apps/mobile`) enforcing max 3 visual component groups per view and `<180ms` transitions[cite: 1, 2].
4. **Adversarial & Unit Tests:** Add test coverage for BigInt serialization, AST layout limits, and offline SQLite rollback, then run `pnpm --filter` tests before invoking `verify-and-record`[cite: 2].