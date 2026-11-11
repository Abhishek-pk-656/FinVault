# Coding Standards & Change Protocol — FinVault

## 1. Type Safety & Validation Standards
* **Monorepo Strict TypeScript:** Every package in the workspace enforces `strict: true`, `noImplicitAny: true`, and `exactOptionalPropertyTypes: true` in `tsconfig.base.json`.
* **Database Type Synchronization:** All database types are generated from PostgreSQL schema and exported via `packages/db-types` for type-safe PostgREST client queries.
* **Edge Functions & API Validation:** Supabase Edge Functions validate incoming JSON payloads using **Zod** schemas.
* **Monetary Values Rule:** All monetary fields in code and database must use integer minor units (`bigint`). Floating-point types (`number` with decimals) for currency are prohibited.

## 2. Code Quality & Formatting
* **Linting & Formatting:** ESLint with TypeScript rules and Prettier configured across the monorepo.
* **Design System Conformance:** Frontend code in `apps/web`, `apps/mobile`, and `packages/ui` must adhere to `.agents/rules/02-frontend-mobile-standards.md` (Botanical Minimalist tokens, $\le 3$ visual groups, transitions $\le 180\text{ms}$).

## 3. Changelog & Architecture Evolution Mandate
* **Living Plan Protocol:** Architectural adjustments must follow `.agents/rules/00-living-plan-protocol.md`.
* **Changelog Updates:** Completed milestones, architectural adjustments, and library changes must be documented in `CHANGELOG.md` under `[Unreleased]` and recorded in `docs/10-ADR.md`.

---

## 4. Future Scope: Self-Hosted Backend Standards
* **Python Backend:** Pydantic v2 data models, `mypy` strict type checking, and `Black` formatting reserved for the self-hosted FastAPI backend on the future roadmap.
