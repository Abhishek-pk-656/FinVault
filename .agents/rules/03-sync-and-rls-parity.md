# File: .agents/rules/03-sync-and-rls-parity.md
---
trigger: glob("{supabase/migrations/**,supabase/functions/**,packages/sync-engine/**,packages/db-types/**}")
description: Enforces symmetrical PostgreSQL/SQLite DDL, RLS isolation, and LWW outbox sync integrity.
---

# Rule: Dual-Schema Sync & RLS Parity
1. **Three-Way Schema Lock:** Any table or column change in `supabase/migrations/` MUST be mirrored in the same task across:
   - Client SQLite DDL in `packages/sync-engine` (preserving `<50ms` write SLA on `ExpoSQLiteAdapter`)[cite: 2].
   - TypeScript interfaces in `packages/db-types`[cite: 2].
2. **Mandatory RLS:** Every PostgreSQL table must enable Row-Level Security enforcing `auth.uid() = user_id`[cite: 2].
3. **Sync Engine Invariants:** Preserve `sync_queue` outbox atomicity, deterministic Last-Write-Wins (LWW) conflict resolution, and soft-delete tombstoning across Deno Edge Functions (`supabase/functions/`) and `packages/sync-engine`[cite: 2].