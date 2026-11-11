# BRIEFING — 2026-11-08T15:45:00Z

## Mission
Formulate exact BigInt integer arithmetic implementation without floating-point operations across `packages/ui/src/index.tsx` and `supabase/functions/validate-transaction/index.ts`, addressing Gate feedback and Reviewer 2 findings.

## 🔒 My Identity
- Archetype: Specification Miner / Explorer
- Roles: M1 Integer Arithmetic Fix Explorer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\miner_m1_iter2
- Original parent: 867b8adb-e639-414f-92fa-0326940898a2
- Milestone: M1 Integer Arithmetic Fix

## 🔒 Key Constraints
- Terminal & Execution Guardrails: Never run destructive commands without explicit confirmation.
- Double-Entry Ledger Invariant: SUM(debits) == SUM(credits).
- No Floating-Point Money: All monetary amounts must be stored and computed in BIGINT minor units (cents/paise).
- No floating-point operations (no `parseFloat`, `Number(val) / 100`, `Math.round(num * 100)`).
- Specification miner role: Read-only for project code, output detailed handoff and code replacement blueprint.

## Current Parent
- Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2
- Updated: 2026-11-08T15:45:00Z

## Task Summary
- **What to build**: Exact code blueprint for BigInt parsing, formatting, and edge function validation without float arithmetic.
- **Success criteria**: Zero floating-point operations, exact BigInt decimal parsing ("12.34" -> 1234n), BigInt formatting (1234n -> "12.34"), Edge function BigInt validation.
- **Interface contracts**: PROJECT.md, AGENTS.md, docs/04-DATABASE-SCHEMA.md, docs/09-API-CONTRACTS.md.
- **Code layout**: packages/ui/src/index.tsx, supabase/functions/validate-transaction/index.ts.

## Key Decisions Made
- `formatMinorToDecimal`: Uses BigInt division `absVal / 100n` and modulo `absVal % 100n` with zero floating-point operations. Normalizes negative signs cleanly so `-50n` becomes `"-0.50"`. Tested across 10,000 random BigInt fuzz values.
- `parseDecimalToMinor`: Splits on the first dot, extracts integer and fractional digits, pads with zero up to specified decimals, and computes `BigInt(int) * 100n + BigInt(frac)`. Truncates excess decimals without rounding errors.
- `supabase/functions/validate-transaction/index.ts`: Uses `amount_minor: string | bigint;`, accumulates with `let debits = 0n; let credits = 0n;`, rejects `amount <= 0n`, converts amounts using `BigInt(e.amount_minor)` which automatically throws if a float (e.g. 12.5) is passed. Serializes BigInt to strings (`.toString()`) in JSON responses to prevent runtime `TypeError: Do not know how to serialize a BigInt`. Completely eliminates the keyword `number` from the file.

## Artifact Index
- handoff.md — Comprehensive handoff report and code replacement blueprint.
- test_parse.js — Verification tests for decimal parsing edge cases.
- test_parse2.js — Additional edge case parsing verification.
- test_roundtrip.js — Round-trip and 10,000 fuzz test verification.
- test_validate.js — Edge function validation logic test harness.
