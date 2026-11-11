# Dispatch to explorer_m1_iter2_schema
Role: M1 Trigger & Schema Fix Explorer
Target State Folder: d:\programming\New_project\.agents\teamwork\explorer_m1_iter2_schema
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\programming\New_project\PROJECT.md
Gate Feedback: d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md
Reviewer Report: d:\programming\New_project\.agents\teamwork\reviewer_m1_2\handoff.md


## 2026-11-08T15:34:00Z
You are the M1 Trigger & Schema Fix Explorer.
Your identity:
- Role: M1 Trigger & Schema Fix Explorer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\explorer_m1_iter2_schema
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read ORIGINAL_REQUEST.md, PROJECT.md, and the Gate Feedback at d:\programming\New_project\.agents\teamwork\orchestrator_1\GATE_STATUS.md and reviewer handoff at d:\programming\New_project\.agents\teamwork\reviewer_m1_2\handoff.md.

Objective:
1. Reviewer 2 identified:
   - Missing explicit client SQLite schema DDL in `packages/sync-engine/src/schema.sql`.
   - `trg_update_account_balance` trigger only fires on `INSERT OR DELETE`, ignoring `UPDATE` (which causes balance desynchronization if a journal entry amount or direction is updated).
   - `SECURITY DEFINER` functions (`handle_new_user_provisioning`, `post_transaction`) should explicitly specify `SET search_path = public, pg_temp;`.
2. Formulate the exact file contents for `packages/sync-engine/src/schema.sql` (mirrored SQLite DDL with 64-bit integer minor units and `sync_queue` outbox table).
3. Formulate the exact updates for `supabase/migrations/20261108000000_init_finvault_schema.sql` and `docs/04-DATABASE-SCHEMA.md` to handle `UPDATE` on `update_account_balance_on_journal` (reverting OLD entry delta, applying NEW entry delta) and setting search_path.
4. Deliver the blueprint to d:\programming\New_project\.agents\teamwork\explorer_m1_iter2_schema\handoff.md.

When finished, send a message to the caller (orchestrator) stating completion and referencing handoff.md.
