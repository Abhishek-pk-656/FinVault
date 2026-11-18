# Testing & Verification Strategy — FinVault

## 1. Test Architecture & Toolchain (Active Baseline: Milestones 1–6)
* **Monorepo Test Orchestration:** Turborepo (`pnpm turbo test`) executing workspace package test suites (`@finvault/sync-engine`, `@finvault/mobile`).
* **Master E2E & Invariant Test Suite:** Node.js native test runner (`node:test`) + `fast-check` property testing harness executing 196/196 test cases with zero skips across all 5 verification tiers.
* **Property-Based Testing Engine:** **`fast-check`** (TypeScript) generating thousands of randomized transactions, split allocations, and edge cases to prove double-entry balance and BigInt invariants mathematically.
* **Database & Ledger Safety Verification:** Invariant oracles (`LedgerOracle`, `SupabaseOracle`, `SyncOracle`) asserting server-side `DEFERRABLE INITIALLY DEFERRED` constraint triggers, balance maintenance, RLS cross-tenant isolation, and atomic RPCs (`post_transaction`, `settle_iou`).
* **Mobile & SQLite Verification:** `tests/mobile/mobile.test.ts` and adversarial stress harnesses verifying sub-millisecond offline writes (<50ms SLA), atomic rollback on imbalance, and hardware biometric gating.
* **Reserved AI/ML Scope:** Python FastAPI, Pytest, and Hypothesis are reserved strictly for Phase 3 AI/ML sidecar testing. Never use Python test frameworks for Phase 1–2 monorepo verification.

---

## 2. 5-Tier Verification Suite (196/196 Tests Passing)

### Tier 1: Feature Coverage (30 Tests)
* **Double-Entry Invariant (`ledger-invariants.test.ts`):** `fast-check` property tests verifying 2-leg, 3-leg, and arbitrary multi-split transactions ($2 \le N \le 20$) preserve $\sum \text{debits} == \sum \text{credits}$ and reject unbalanced entries.
* **Strict Integer Minor Units (`bigint-money.test.ts`):** Verifies all financial amounts require native `BigInt` minor units (cents/paise), rejects floating-point numbers, and proves lossless decimal conversion.
* **RLS Tenant Isolation (`rls-isolation.test.ts`):** Proves accounts, transactions, journal entries, IOUs, and sinking funds are isolated by `auth.uid() = user_id`.
* **Offline SQLite Storage (`offline-sqlite.test.ts`):** Verifies schema initialization, sub-50ms write latency, dynamic balance maintenance, and `sync_queue` outbox queuing.
* **Sync Reconciliation (`sync-reconciliation.test.ts`):** Verifies push delta replays, pull delta ingestion, and LWW version resolution.

### Tier 2: Boundary & Corner Cases (22 Tests)
* **Ledger Boundaries (`ledger-boundary.test.ts`):** Minimum unit (1 paise) splits, 100-way multi-splits, Int64 Max boundaries, zero/negative rejection, and 1-paise discrepancy detection.
* **BigInt Numeric Limits (`bigint-boundary.test.ts`):** Arithmetic beyond `Number.MAX_SAFE_INTEGER`, scientific notation rejection, invalid formatting, and Int64 Max parsing.
* **RLS Corner Cases (`rls-corner-cases.test.ts`):** Anonymous session blocking, cross-tenant IOU tampering prevention, foreign account injection rejection, and interleaved multi-tenant concurrency.
* **SQLite Sync Corner Cases (`sqlite-sync-corner.test.ts`):** Corrupted outbox payload isolation, version tie-breakers, idempotency key deduplication, and multi-split sync integrity.

### Tier 3: Pairwise Combinations (6 Tests)
* Cross-product combinations verifying Account Types (Asset, Liability, Equity, Income, Expense) $\times$ Transaction Splits $\times$ Sync States $\times$ Currencies (INR, USD).

### Tier 4: Real-World Workload Scenarios (5 Tests)
* End-to-end user workflows: Monthly salary inflows & budget allocation, group dinner bill splits with bilateral IOUs and multi-stage repayments, multi-day offline travel spending reconciliation, sinking fund goal progression, and bilateral peer lending.

### Tier 5: Adversarial Hardening (69 Tests)
* **Backend Adversarial Suite (`tier5-backend-adversarial.ts` — 44 Tests):**
  - Supabase Edge Functions (`validate-transaction`, `sync-reconcile`): CORS, method guards, payload fuzzing, floating-point injection rejection, and authorization checks.
  - Sync Engine Outbox: Max retry transitions (`PENDING` $\to$ `FAILED` at 5 retries), LWW tie-breaking by timestamp and ID, and IOU contra clearing.
  - PostgreSQL Triggers & RPCs: Balance rollback on `DELETE`, immutable column guards on `UPDATE`, `post_transaction` atomicity, and append-only audit log verification.
* **Frontend Adversarial Suite (`tier5-frontend-adversarial.ts` — 25 Tests):**
  - UI money utilities & Botanical Minimalist tokens.
  - RSC safe BigInt serialization and pre-commit double-entry validation.
  - Web Server Actions & Next.js middleware route matching.
  - Mobile SQLite parameter normalization, biometric fallback, and AST verification confirming $\le 3$ visual component groups across all 5 web views and 5 mobile screens.

### Mobile Specialized Harnesses & Parity (64 Tests)
* `tests/mobile/mobile.test.ts` (10 tests), `tests/mobile/adversarial-stress.test.ts` (20 tests), `tests/mobile/adversarial.stress.ts` (11 tests), `packages/sync-engine/tests/sync-engine.test.ts` (23 tests).

---

## 3. Verification Execution Commands

```bash
# Full monorepo typecheck & build gate
pnpm turbo typecheck
pnpm turbo build

# Workspace package test execution
pnpm turbo test

# Master 5-tier 196-test verification runner
node --experimental-strip-types tests/e2e/runner.ts
node --experimental-strip-types tests/e2e/tier5-backend-adversarial.ts
node --experimental-strip-types tests/e2e/tier5-frontend-adversarial.ts
node --test tests/mobile/mobile.test.ts
node --test tests/mobile/adversarial-stress.test.ts
```
