## 2026-11-08T16:08:39Z
You are Explorer 3 (teamwork_explorer) for Milestone 2: Client SQLite Parity & Migration Harness.

CRITICAL REQUIREMENT: Read d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.

Context:
In Milestone 2, packages/sync-engine must guarantee 100% schema parity with Supabase PostgreSQL 16 for offline-first operation on Android/iOS (SQLite / SQLCipher) and Web (WASM SQLite / IndexedDB).
Your tasks:
1. Examine packages/sync-engine/src/schema.sql, client-schema.sql, schema.ts, and index.ts.
2. Verify SQLite DDL parity:
   - 6 tables: accounts, transactions, journal_entries, iou_records, sinking_funds, sync_queue.
   - 64-bit INTEGER types for all minor unit money fields.
   - CHECK constraints matching PostgreSQL.
   - Foreign keys: ON DELETE CASCADE on journal_entries(transaction_id), ON DELETE RESTRICT on journal_entries(account_id).
   - Indexing: indexes on user_id, date, status, account_id, transaction_id.
3. Design or verify client-side database initialization:
   - Safe execution of DDL (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
   - SQLite balance triggers or client-side balance update helpers on journal insertion/mutation.
   - Verification test harness for automated in-memory testing (`node:sqlite`).
4. Formulate concrete implementation blueprints for the worker.

Read:
- d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\programming\New_project\PROJECT.md
- d:\programming\New_project\packages/sync-engine/src/schema.sql
- d:\programming\New_project\packages/sync-engine/src/schema.ts
- d:\programming\New_project\packages/sync-engine/src/index.ts
- d:\programming\New_project\supabase/migrations/20261108000000_init_finvault_schema.sql

Do NOT write code or modify files directly. Produce your findings and recommendations in:
d:\programming\New_project\.agents\teamwork\explorer_m2_3\handoff.md
Send a message to the orchestrator when finished.
