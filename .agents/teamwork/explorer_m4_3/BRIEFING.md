# BRIEFING — 2026-11-09T03:45:00Z

## Mission
Formulate Supabase Data Layer, SSR/Client integration, BigInt serialization, transaction/IOU RPC handlers, and frontend build pipeline for Next.js 14 cockpit.

## 🔒 My Identity
- Archetype: explorer
- Roles: Supabase Data Layer, SSR/Client Integration & Frontend Build Explorer
- Working directory: d:\programming\New_project
- State folder: d:\programming\New_project\.agents\teamwork\explorer_m4_3
- Original parent: 867b8adb-e639-414f-92fa-0326940898a2
- Milestone: Milestone 4 (Shared UI Library & Web Application Cockpit)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly enforce BigInt minor units for money (no floating-point money)
- Enforce Double-Entry Ledger Invariant (SUM(debits) == SUM(credits))
- Safe BigInt serialization between Server and Client Components (Next.js 14)
- Keep state files within .agents/teamwork/explorer_m4_3/
- Deliver complete 5-component handoff report to handoff.md

## Current Parent
- Conversation ID: 867b8adb-e639-414f-92fa-0326940898a2
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `docs/02-ARCHITECTURE-AND-STACK.md`, `docs/09-API-CONTRACTS.md`
  - `packages/db-types/src/index.ts` (database generic, RPC interfaces)
  - `packages/ui/src/` (design tokens, AmountInput, BalanceBadge, Card, Button)
  - `apps/web/src/` (middleware, auth callbacks, supabase SSR client/server)
  - `supabase/migrations/` (post_transaction RPC, settle_iou RPC)
- **Key findings**:
  - Next.js RSC Flight protocol throws `TypeError: Do not know how to serialize a BigInt` if `bigint` is passed across Server-to-Client component boundaries. Designed string-encoded minor BigInt DTOs (`SerializedAccount`, `SerializedTransaction`, etc.) and recursive serialization mappers with zero floating-point operations.
  - Supabase SSR integration in `apps/web` requires separate `createServerClient` for Server Components (read-only cookie store with try/catch) and Server Actions (mutable cookie store).
  - Transaction submission pre-validates `entries.length >= 2`, positive amounts, debits > 0, credits > 0, and `debits === credits` before invoking `post_transaction` RPC.
  - IOU settlement validates amount > 0 and <= remaining balance, invoking `settle_iou` RPC which creates dynamic `IOU Clearing` contra accounts.
  - Tailwind config in `apps/web` maps Venzer botanical minimalist tokens and extends to packages/ui content path.
  - `pnpm install` successfully established all monorepo links.
- **Unexplored areas**: none. All requirements scoped and analyzed.

## Key Decisions Made
- Use string-encoded minor units in DTOs (`SerializedAccount`, etc.) across the RSC Flight boundary to guarantee 100% precision without floating-point conversion.
- Use Next.js 14 Server Actions (`'use server'`) for mutation endpoints (`submitTransactionAction`, `settleIOUAction`) with automatic path revalidation (`revalidatePath('/')`).

## Artifact Index
- DISPATCH.md — incoming dispatch instructions
- progress.md — liveness and progress tracking
- data-layer-blueprint.md — comprehensive Supabase SSR, BigInt serialization, services, and RPC blueprints
- build-pipeline-blueprint.md — Tailwind CSS configuration, build verification commands, and environment variables
- handoff.md — final 5-component handoff report
