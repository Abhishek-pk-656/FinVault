---
name: db-migration-and-sync
description: Procedure for creating safe database migrations, configuring PostgreSQL triggers/RLS, and ensuring client SQLite parity.
---

# Skill: Database Migration & Sync

When executing this skill:
1. Create timestamped PostgreSQL SQL migrations under `supabase/migrations/<timestamp>_<name>.sql`.
2. Ensure all monetary columns are typed as `BIGINT NOT NULL` minor units with check constraints (`> 0` for journal entries).
3. Bind the deferred constraint trigger `trg_verify_transaction_balance` on `journal_entries` for double-entry integrity.
4. Define Row Level Security (RLS) policies on every table with `USING (auth.uid() = user_id)`.
5. Update client SQLite schema DDL in `packages/sync-engine` to maintain 1:1 parity with PostgreSQL tables and constraints.
6. Regenerate database TypeScript interfaces in `packages/db-types`.
7. Preserve self-hosted Alembic migration notes under "Future Roadmap" only.
