# AGENTS.md — Antigravity Root Agent Router & Guardrails

## Project Mission

You are building and maintaining **FinVault**, a privacy-focused personal finance, money lending (IOU), bills, and multi-asset wealth management platform running across Web and Android (with iOS support later).

- **Target Platforms:** Responsive Web (`Next.js 14+`) + Mobile (`React Native / Expo` targeting Android first, iOS ready) in a shared TypeScript monorepo (`Turborepo`), backed by a **Supabase (PostgreSQL 16 + pgvector)** cloud backend with **Google OAuth (Gmail)** and on-device **SQLite** offline-first sync.
- **Deployment Posture:** Phase 1 uses Supabase free tier for zero-friction cloud database & auth without requiring an active local server. Self-hosted Docker PostgreSQL + FastAPI is preserved on the roadmap for future air-gapped deployments.

## Directory Structure & Progressive Disclosure

To stay well within Antigravity's context limits, never dump all specs into a single prompt. Load files progressively via `@filename` pointers:

- `AGENTS.md` (This file): Always-on root router, global rules, and boundary guardrails.
- `.agents/rules/*.md`: Context-triggered rules loaded automatically when touching specific file globs or model decisions.
- `.agents/skills/*/SKILL.md`: Reusable executable procedures for tasks like migrations, refactoring, and changelog updates.
- `docs/`: Modular specification files (`01` through `11`).

## Modular Documentation Pointers

- **Product & Roadmap:** `@docs/01-PRD-AND-ROADMAP.md`
- **Architecture & Stack:** `@docs/02-ARCHITECTURE-AND-STACK.md`
- **Design System & UI/UX:** `@docs/03-DESIGN-SYSTEM.md`
- **Database Schema & Migrations:** `@docs/04-DATABASE-SCHEMA.md`
- **Security & Compliance:** `@docs/05-SECURITY-AND-COMPLIANCE.md`
- **Testing & QA:** `@docs/06-TESTING-AND-QA.md`
- **Deployment & Observability:** `@docs/07-DEPLOYMENT-AND-OBSERVABILITY.md`
- **Standards & Changelog:** `@docs/08-STANDARDS-AND-CHANGELOG.md`
- **API Contracts & DTOs:** `@docs/09-API-CONTRACTS.md`
- **Architecture Decision Records:** `@docs/10-ADR.md`
- **Environment & Tooling:** `@docs/11-ENV-AND-MCP.md`

## Terminal & Execution Guardrails

1. **Never run destructive commands** (`rm -rf`, `DROP DATABASE`) without explicit user confirmation.
2. **Double-Entry Ledger Invariant:** Every financial transaction must satisfy `SUM(debits) == SUM(credits)`. Never modify transaction tables without running property tests.
3. **No Floating-Point Money:** All monetary amounts must be stored and computed in `BIGINT` minor units (cents/paise).
4. **Living Plan Protocol (`.agents/rules/00-living-plan-protocol.md`):** Whenever architectural changes, library swaps, or scope adjustments occur, the agent must propose them, obtain user approval, update affected documentation, and log them in `docs/10-ADR.md` and `CHANGELOG.md`.
