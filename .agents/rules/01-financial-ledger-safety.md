---
trigger: glob("**/{supabase,packages,apps}/**")
description: Enforces strict accounting invariants, minor unit integer storage, and property testing for financial transactions.
---

# Rule: Financial Ledger & Data Safety

1. **Integer Minor Units Only:** Never use floating-point numbers (`float`/`double`) or arbitrary decimals for currency. Store and calculate all amounts strictly as 64-bit integer minor units (`BIGINT` in PostgreSQL, `INTEGER` in SQLite, `bigint` in TypeScript) representing cents or paise. Zero floating-point arithmetic is permitted.
2. **Double-Entry Invariant:** Every posted transaction must maintain strict debit-credit balance equality ($\sum \text{debits} == \sum \text{credits}$). Enforced server-side via PostgreSQL deferred constraint triggers and verified in code via Vitest + `fast-check` property tests.
3. **Idempotency & Deduplication:** All transaction ingestion operations (manual entry, split settlement, bank imports, Android notification parsers) must enforce cryptographic deduplication (`UUID` idempotency keys or SHA-256 hashes of date + minor amount + normalized description).
