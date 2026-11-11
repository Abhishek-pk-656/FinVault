# Dispatch to explorer_survey_3
Role: Frontend & Testing Explorer
Target State Folder: d:\programming\New_project\.agents\teamwork\explorer_survey_3
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md


## 2026-11-08T14:46:57Z
From: 867b8adb-e639-414f-92fa-0326940898a2
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are the Frontend Applications & Verification Explorer.
Your identity:
- Role: Frontend & Testing Explorer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\explorer_survey_3
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read the original request at d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md and investigate the repository at d:\programming\New_project.

Objective:
1. Investigate the existing repository structure and any frontend or test code.
2. Extract and document all specifications, requirements, constraints, and features for:
   - R4: Frontend Web Dashboard and Mobile Application:
     - Next.js 14+ with Tailwind CSS, strict TypeScript, @supabase/supabase-js, Venzer minimalist design system (high whitespace, transitions under 180ms).
     - Views: net worth, cash flow, transaction entry, IOU tracking.
     - React Native / Expo mobile app (Android first, iOS ready) using local SQLite / SQLCipher for immediate offline writes, syncing in background.
   - R5: Verification and Property-Based Testing:
     - Automated property-based test suites using fast-check (TypeScript) and database trigger test scripts.
     - Invariants: SUM(debits) == SUM(credits) across arbitrary multi-split transactions.
     - Strict BIGINT minor units with rejection of floating-point money.
     - RLS policy isolation between distinct authenticated users.
     - Offline SQLite writes and sync reconciliation with Supabase.
3. Identify existing state vs gaps/missing files.
4. Output a comprehensive report to d:\programming\New_project\.agents\teamwork\explorer_survey_3\handoff.md.

Scope Boundaries:
- Read-only analysis. Do NOT write code or modify project files.
- Deliver your structured findings in handoff.md in your state folder.
- When finished, send a message to the caller (orchestrator) stating completion and pointing to the handoff file.
