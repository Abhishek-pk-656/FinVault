# Dispatch to miner_m1_1
Role: M1 Governance & Docs Spec Miner
Target State Folder: d:\programming\New_project\.agents\teamwork\miner_m1_1
Original Request: d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md
Scope Document: d:\programming\New_project\.agents\teamwork\orchestrator_1\PROJECT.md


## 2026-11-08T14:56:36Z
You are the M1 Governance & Documentation Spec Miner.
Your identity:
- Role: M1 Governance & Docs Spec Miner
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\miner_m1_1
- Parent Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2

Read the original request at d:\programming\New_project\.agents\teamwork\ORIGINAL_REQUEST.md and the master scope document at d:\programming\New_project\.agents\teamwork\orchestrator_1\PROJECT.md.

Objective for Milestone 1 (Governance & Documentation Realignment):
1. Plan the exact updates for:
   - AGENTS.md, TASKS.md, CHANGELOG.md
   - .agents/rules/00-living-plan-protocol.md, 01-financial-ledger-safety.md, 02-frontend-mobile-standards.md
   - .agents/skills/evolve-plan/SKILL.md, db-migration-and-sync/SKILL.md, verify-and-record/SKILL.md
   - docs/01-PRD-AND-ROADMAP.md through docs/11-ENV-AND-MCP.md
   - Specifically fix all stale references to FastAPI, Pytest, Hypothesis, Loguru, and Alembic in docs/05, 06, 07, 08 and the skills, aligning them with Supabase (PostgreSQL 16, Google OAuth, PostgREST) and Vitest + fast-check, while preserving self-hosted FastAPI and Docker Compose in the "Future Roadmap" sections.
   - Complete the trigger function in docs/04-DATABASE-SCHEMA.md with explicit RAISE EXCEPTION and constraint trigger binding.
2. Produce a concrete, line-by-line edit and content specification for the Worker to apply.
3. Deliver your structured analysis to d:\programming\New_project\.agents\teamwork\miner_m1_1\handoff.md.

Scope Boundaries:
- Read-only analysis. Do NOT write code or modify project files.
- When finished, send a message to the caller (orchestrator) stating completion and referencing handoff.md.
