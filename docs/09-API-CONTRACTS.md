# API Contracts & Data Access — FinVault

## 1. Data Access Overview
FinVault interacts with the cloud backend through the official **Supabase Client (`@supabase/supabase-js`)**:
- Direct queries leverage PostgREST with automatic Row-Level Security (RLS) enforcement.
- Custom operations that require transactional atomicity use Supabase Database RPCs or Supabase Edge Functions.

---

## 2. Authentication Contracts
- **Provider:** Google OAuth (`supabase.auth.signInWithOAuth({ provider: 'google' })`).
- **Session:** JWT managed securely in browser cookies (`@supabase/ssr`) and device SecureStore (`expo-secure-store`).

---

## 3. Database RPC Contracts

### Post Balanced Transaction (`rpc/post_transaction`)
Posts a transaction and its balanced journal entries atomically:
```json
{
  "idempotency_key": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "transaction_date": "2026-11-08",
  "description": "Office Supplies",
  "entries": [
    { "account_id": "acc-uuid-1", "amount_minor": 150000, "direction": "DEBIT" },
    { "account_id": "acc-uuid-2", "amount_minor": 150000, "direction": "CREDIT" }
  ]
}
```
*Validation:* Rejects with HTTP 400 if `SUM(debits) != SUM(credits)`.

---

## 4. Delta Synchronization Contract
Offline clients sync changes using version watermarks:
- **Pull:**
  `SELECT * FROM transactions WHERE user_id = auth.uid() AND updated_at > :last_sync_timestamp;`
- **Push:**
  Batch upsert local queued changesets with client UUIDs. Supabase returns committed server timestamps.
