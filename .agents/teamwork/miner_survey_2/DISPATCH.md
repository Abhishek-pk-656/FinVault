# Dispatch to miner_survey_2
Role: Database & Sync Spec Miner
Target State Folder: d:\programming\New_project\.agents\teamwork\miner_survey_2
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md


## 2026-11-08T14:46:50Z
You are the Database, Ledger Invariants, Auth & Sync Spec Miner.
Your identity:
- Role: Database & Sync Spec Miner
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\miner_survey_2
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read the original request at d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md and investigate the repository at d:\programming\New_project.

Objective:
1. Investigate any existing schema or docs related to database, ledger, auth, and sync.
2. Extract and document all specifications, requirements, constraints, and features for:
   - R2: Supabase PostgreSQL Schema, Security, and Ledger Invariants:
     - All monetary amounts stored as BIGINT minor units (paise/cents), NO floating-point money.
     - Row Level Security (RLS) policies strictly isolating each user's financial data.
     - Double-Entry Lite ledger integrity: PostgreSQL triggers/functions rejecting any transaction where SUM(debits) != SUM(credits) prior to commit.
     - Client SQLite / SQLCipher schema mirroring PostgreSQL with identical BIGINT types and constraints.
   - R3: Authentication, Backend Services, and Sync:
     - Supabase Auth with Google OAuth (Gmail).
     - PostgREST auto-generated REST API and Supabase Edge Functions (Deno) for custom validation.
     - Offline-first delta synchronization between client SQLite storage and Supabase cloud PostgreSQL with clean conflict resolution.
3. Identify existing state vs gaps/missing files.
4. Output a comprehensive report to d:\programming\New_project\.agents\teamwork\miner_survey_2\handoff.md.

Scope Boundaries:
- Read-only analysis. Do NOT write code or modify project files.
- Deliver your structured findings in handoff.md in your state folder.
- When finished, send a message to the caller (orchestrator) stating completion and pointing to the handoff file.
