# TEST_INFRA.md — FinVault E2E & Invariant Test Architecture

## 1. Overview & Verification Philosophy

FinVault is a local-first, privacy-focused financial platform operating across web and mobile. To prevent catastrophic financial discrepancies, data corruption, or cross-tenant leaks, the testing architecture is designed using an opaque-box, contract-driven methodology integrating:
- **Category-Partitioning:** Systematic partition of domain spaces (Account Types, Transaction Modalities, Currencies).
- **Boundary Value Analysis (BVA):** Testing minimum minor units (1 paise/cent), maximum 64-bit limits ($9 \times 10^{18}$), zero-amount boundaries, and float precision limits.
- **Pairwise Combinatorial Testing:** All-pairs combination of execution modes, tenant contexts, transaction shapes, and account classes.
- **Real-World Workload Scenarios:** Multi-step transactional workflows modeling realistic user behavior (salary splits, dinner splits, offline travel, sinking fund fulfillment, bilateral peer debt).
- **Property-Based Testing (`fast-check`):** Invariant testing over thousands of pseudo-random inputs to verify that $\sum \text{debits} == \sum \text{credits}$ holds universally.

---

## 2. Core Invariants Tested

| Invariant | Specification | Enforcement Mechanism |
|-----------|---------------|-----------------------|
| **Double-Entry Lite Invariant** | Every transaction must balance: $\sum \text{debits} == \sum \text{credits}$. | Server PostgreSQL Deferred Constraint Trigger (`trg_verify_transaction_balance`) + Client Pre-Commit Invariant |
| **Strict BIGINT Minor Units** | Zero floating-point money. All amounts stored as 64-bit integers (`paise`/`cents`). | Database type `BIGINT CHECK (amount_minor > 0)` + Lossless string-to-bigint parser |
| **Row-Level Security (RLS)** | Strict multi-tenant isolation by `auth.uid() = user_id`. | Supabase PostgreSQL RLS Policies on all tables + Cross-tenant Foreign Key restrictions |
| **Offline-First SQLite Parity** | Immediate offline writes with ACID atomicity and mutation queuing. | Native SQLite client storage + `sync_queue` outbox + LWW conflict reconciliation |

---

## 3. Test Suite Directory Structure

```
tests/e2e/
├── infra/
│   ├── harness.ts                  # Unified test runner adapter (Vitest + Node:test BDD syntax)
│   ├── fast-check.ts               # Property-based testing engine with arbitrary generators & shrinkers
│   ├── ledger-oracle.ts            # Mathematical reference oracle for double-entry bookkeeping & balance signs
│   ├── sqlite-harness.ts           # Native client SQLite engine matching packages/sync-engine schema
│   ├── supabase-oracle.ts          # PostgreSQL 16 & PostgREST mock enforcing RLS, triggers & foreign keys
│   ├── sync-oracle.ts              # Bidirectional push/pull delta sync reconciler with LWW resolution
│   └── generators.ts               # Fast-check arbitrary generators for transactions, IOUs, accounts
├── tier1-feature-coverage/
│   ├── ledger-invariants.test.ts   # T1: Double-entry equality, multi-split balance, accounting equation (6 tests)
│   ├── bigint-money.test.ts        # T1: Integer minor units, float rejection, lossless string conversion (6 tests)
│   ├── rls-isolation.test.ts       # T1: Cross-user data isolation across accounts, txs, IOUs, funds (6 tests)
│   ├── offline-sqlite.test.ts      # T1: SQLite schema parity, sub-50ms writes, balance updates, outbox queue (6 tests)
│   └── sync-reconciliation.test.ts # T1: Push outbox, pull deltas, LWW conflict resolution, idempotency (5 tests)
├── tier2-boundary-and-corner-cases/
│   ├── ledger-boundary.test.ts     # T2: 1-paise split, 100-way split, Int64 max, zero/neg rejection, delta 1 (7 tests)
│   ├── bigint-boundary.test.ts     # T2: IEEE 754 safe integer limits, float/scientific notation rejection (6 tests)
│   ├── rls-corner-cases.test.ts    # T2: Anon session block, spoofed user_id, cross-tenant FK hijacking, load (5 tests)
│   └── sqlite-sync-corner.test.ts  # T2: Corrupted payload recovery, stale version LWW, empty queue, 5-split (5 tests)
├── tier3-cross-feature-combinations/
│   └── pairwise-combinations.test.ts # T3: All-pairs coverage of Account × Modality × Mode × Tenant × Currency (6 tests)
├── tier4-workload-scenarios/
│   └── workload-scenarios.test.ts  # T4: 5 End-to-end multi-step real-world application user journeys (5 tests)
└── runner.ts                       # Master test suite runner executing all 63 test cases and printing report
```

---

## 4. Test Execution Commands

The test harness is designed to execute seamlessly in both Node.js (v20+) native ESM environment and Vitest:

### Running via Master Runner (Recommended)
```bash
node --experimental-strip-types tests/e2e/runner.ts
```

### Running Individual Test Suites
```bash
# Tier 1: Feature Coverage
node --experimental-strip-types --test tests/e2e/tier1-feature-coverage/ledger-invariants.test.ts
node --experimental-strip-types --test tests/e2e/tier1-feature-coverage/bigint-money.test.ts
node --experimental-strip-types --test tests/e2e/tier1-feature-coverage/rls-isolation.test.ts
node --experimental-strip-types --test tests/e2e/tier1-feature-coverage/offline-sqlite.test.ts
node --experimental-strip-types --test tests/e2e/tier1-feature-coverage/sync-reconciliation.test.ts

# Tier 2: Boundary & Corner Cases
node --experimental-strip-types --test tests/e2e/tier2-boundary-and-corner-cases/ledger-boundary.test.ts
node --experimental-strip-types --test tests/e2e/tier2-boundary-and-corner-cases/bigint-boundary.test.ts
node --experimental-strip-types --test tests/e2e/tier2-boundary-and-corner-cases/rls-corner-cases.test.ts
node --experimental-strip-types --test tests/e2e/tier2-boundary-and-corner-cases/sqlite-sync-corner.test.ts

# Tier 3: Pairwise Combinations
node --experimental-strip-types --test tests/e2e/tier3-cross-feature-combinations/pairwise-combinations.test.ts

# Tier 4: Real-World Workload Scenarios
node --experimental-strip-types --test tests/e2e/tier4-workload-scenarios/workload-scenarios.test.ts
```

### Running with Vitest (when packages are installed)
```bash
pnpm test
# or
vitest run tests/e2e
```

---

## 5. Test Case Inventory & Metrics Summary

| Tier | Suite / Feature Area | File Path | Tests | Status |
|------|----------------------|-----------|-------|--------|
| **Tier 1** | Ledger Invariants | `tests/e2e/tier1-feature-coverage/ledger-invariants.test.ts` | 6 | PASS |
| **Tier 1** | BIGINT Money Units | `tests/e2e/tier1-feature-coverage/bigint-money.test.ts` | 6 | PASS |
| **Tier 1** | Supabase RLS Isolation | `tests/e2e/tier1-feature-coverage/rls-isolation.test.ts` | 6 | PASS |
| **Tier 1** | Client SQLite Offline Writes | `tests/e2e/tier1-feature-coverage/offline-sqlite.test.ts` | 6 | PASS |
| **Tier 1** | Bidirectional Delta Sync | `tests/e2e/tier1-feature-coverage/sync-reconciliation.test.ts` | 5 | PASS |
| **Tier 2** | Ledger Boundary Cases | `tests/e2e/tier2-boundary-and-corner-cases/ledger-boundary.test.ts` | 7 | PASS |
| **Tier 2** | BIGINT & Safe Integer Limits | `tests/e2e/tier2-boundary-and-corner-cases/bigint-boundary.test.ts` | 6 | PASS |
| **Tier 2** | RLS & Tenant Edge Cases | `tests/e2e/tier2-boundary-and-corner-cases/rls-corner-cases.test.ts` | 5 | PASS |
| **Tier 2** | SQLite & Sync Corner Cases | `tests/e2e/tier2-boundary-and-corner-cases/sqlite-sync-corner.test.ts` | 5 | PASS |
| **Tier 3** | Pairwise Combinations | `tests/e2e/tier3-cross-feature-combinations/pairwise-combinations.test.ts` | 6 | PASS |
| **Tier 4** | Real-World Application Workloads | `tests/e2e/tier4-workload-scenarios/workload-scenarios.test.ts` | 5 | PASS |
| **TOTAL** | **Full E2E Suite** | **11 Test Suites** | **63** | **100% PASS** |

---

## 6. Coverage & Quality Gates

To ensure software integrity, the following gates are established:
1. **100% Pass Requirement:** All 63 test cases must pass on every build and CI execution.
2. **Zero Invariant Deviation:** Any transaction that results in $\sum \text{debits} \ne \sum \text{credits}$ is an immediate blocking defect.
3. **Zero Floating-Point Leakage:** Any usage of IEEE 754 floating-point numbers in journal tables or monetary calculation functions triggers immediate failure.
4. **Tenant Isolation:** Any cross-tenant data visibility or unauthorized mutation triggers immediate blocking security escalation.
5. **Offline Write Latency:** Offline SQLite writes must complete in $< 50$ms.
