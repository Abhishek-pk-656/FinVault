# File: .agents/rules/01-financial-ledger-safety.md

---

trigger: glob("{supabase/**,packages/sync-engine/**,packages/db-types/**}")
description: Enforces BIGINT minor units, double-entry trigger invariants, and SHA-256 idempotency across database and sync layers.
---

# Rule: Financial Ledger & Data Safety

1. **Strict Integer Minor Units:** All monetary columns, payloads, and calculations must use `BIGINT` minor units (`BigInt` in TS)[cite: 1, 2]. `float`, `double`, and `Number` arithmetic on currency are strictly forbidden[cite: 1, 2].
2. **Double-Entry Trigger & RPC Parity:** All ledger mutations must preserve `trg_verify_transaction_balance` (`DEFERRABLE INITIALLY DEFERRED` checking `SUM(debits) == SUM(credits)`), `trg_update_account_balance` (`version = version + 1`), and atomic execution via `post_transaction`[cite: 2].
3. **Idempotent Ingestion:** Enforce `SHA-256` deduplication hashes (`date + amount_minor + normalized_description`) on imported or synced transactions[cite: 1].
