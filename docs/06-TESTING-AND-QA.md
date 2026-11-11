# Testing & Verification Strategy — FinVault

## 1. Test Architecture & Toolchain
* **Primary Test Runner:** **Vitest** configured across Turborepo workspace packages (`packages/*`, `apps/*`).
* **Property-Based Testing Engine:** **`fast-check`** (TypeScript) generating thousands of randomized transactions, split allocations, and edge cases to prove invariants mathematically.
* **Database & Trigger Verification:** SQL trigger test scripts validating PostgreSQL constraint triggers, balance calculations, and RLS isolation.
* **E2E Testing:** Playwright for desktop web cockpit and Expo testing utilities for React Native mobile flows.

---

## 2. Verification Tiers

### Tier 1: Unit & Invariant Testing (Vitest + `fast-check`)
* **Double-Entry Invariant:** `fast-check` generates multi-leg transactions with random amounts (1 to $10^{12}$ minor units) across $N$ splits ($2 \le N \le 20$), verifying:
  $$\sum_{i} \text{amount}_{\text{debit}, i} == \sum_{j} \text{amount}_{\text{credit}, j}$$
* **Strict Integer Minor Units:** Asserts all amounts are integers (`bigint`); rejects any input with fractional values, `NaN`, or floating-point numbers.
* **Design Token Compliance:** Asserts shared UI components in `packages/ui` only emit Botanical Minimalist tokens and transitions $\le 180\text{ms}$.

### Tier 2: Supabase Schema, Triggers & RLS Integration
* **Constraint Trigger Abort Test:** Verifies that inserting an unbalanced transaction into `journal_entries` causes `trg_verify_transaction_balance` to raise an explicit exception and rollback the commit.
* **Account Balance Update Test:** Verifies that posting or deleting journal entries accurately updates `accounts.balance_minor` according to account type rules.
* **RLS Cross-Tenant Isolation:** Verifies that User A cannot read, insert, update, or delete records belonging to User B.

### Tier 3: Sync Engine & Conflict Resolution
* **Mutation Outbox Queue:** Verifies optimistic local SQLite writes persist to `sync_queue`.
* **LWW Conflict Resolution:** Generates concurrent edits with varying timestamps to confirm deterministic state convergence.
* **Idempotency Replay:** Replaying previously synced mutations produces no duplicate entries.

### Tier 4: End-to-End Application Flows
* **Web Cockpit:** Playwright tests verifying Net Worth aggregation, Cash Flow calculations, multi-split transaction entry with live balance validation badge, and IOU ledger settlements.
* **Mobile App:** Tests verifying offline transaction entry in SQLite and automatic sync when network connectivity is simulated.

---

## 3. Future Roadmap: Self-Hosted Backend Testing
* Retains `Pytest` and `Hypothesis` test harness specifications for the future self-hosted Python FastAPI backend.
