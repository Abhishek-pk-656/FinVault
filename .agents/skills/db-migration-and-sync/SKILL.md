# File: .agents/skills/db-migration-and-sync/SKILL.md

---

name: db-migration-and-sync
description: Creates safe Supabase PostgreSQL migrations, updates Deno Edge Functions, and synchronizes SQLite DDL and db-types with direct Supabase and Vercel CLI cloud operations.
---

# Skill: Database Migration & Sync Parity

1. Create a new timestamped SQL migration in `supabase/migrations/` enforcing `BIGINT` minor units, `ENABLE ROW LEVEL SECURITY`, and `auth.uid() = user_id` policies[cite: 2].
2. Verify compatibility with `trg_verify_transaction_balance`, `trg_update_account_balance`, and `post_transaction`[cite: 2].
3. Mirror the schema modification in `packages/sync-engine` SQLite DDL and `sync_queue` delta handlers[cite: 2].
4. Update shared TypeScript definitions in `packages/db-types`[cite: 2].
5. Run scoped verification first: `pnpm --filter @finvault/db-types typecheck && pnpm --filter @finvault/sync-engine test`.
6. **Cloud Deployment & Diagnostics**:
   - The agent is authenticated and authorized to execute cloud CLI commands directly:
     - `npx supabase db push --remote`: Push pending SQL migrations to the linked Supabase project (`mphsbsdlfmsffdxrgupr`).
     - `npx supabase functions deploy`: Deploy updated Deno Edge Functions to Supabase Cloud.
     - `npx vercel env ls`: Inspect and verify environment variables configured on Vercel.
     - `npx vercel logs`: Inspect live runtime execution and build logs for the linked deployment (`fin-vault-pied.vercel.app`).
