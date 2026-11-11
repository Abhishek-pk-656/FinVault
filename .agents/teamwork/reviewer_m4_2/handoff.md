# Milestone 4 Independent Quality & Adversarial Review Report

**Reviewer:** Reviewer 2 (`reviewer_m4_2`)  
**Roles:** reviewer, critic  
**Target Milestone:** Milestone 4 (Shared UI Library & Web Application Cockpit)  
**Target Codebase:** `apps/web`, `packages/ui`, `packages/sync-engine`  
**Date:** 2026-11-09T04:16:00Z  
**Parent Agent:** Orchestrator (`867b8adb-e639-414f-92fa-0326940898a2`)  
**Verdict:** **REQUEST_CHANGES**

---

## 1. Observation

Direct observations from independent inspection, code analysis, and test executions:

### 1.1 RSC Server/Client Component Boundary BigInt Serialization Failure
- In `apps/web/src/app/page.tsx` (lines 18–24):
  ```tsx
  {/* Group 1: Hero Net Worth & Liquidity Card */}
  <NetWorthHeroCard
    netWorthMinor={BigInt(summary.netWorthMinor)}
    safeToSpendMinor={BigInt(summary.safeToSpendMinor)}
    totalAssetsMinor={BigInt(summary.totalAssetsMinor)}
    totalLiabilitiesMinor={BigInt(summary.totalLiabilitiesMinor)}
    currency={summary.currency}
  />
  ```
  `NetWorthHeroCard.tsx` begins with line 1: `'use client';` and defines props:
  ```ts
  interface NetWorthHeroCardProps {
    netWorthMinor: bigint;
    safeToSpendMinor: bigint;
    totalAssetsMinor: bigint;
    totalLiabilitiesMinor: bigint;
    currency?: string;
  }
  ```
  `summary` returned by `fetchNetWorthSummary()` was already serialized with string-encoded minor units (`SerializedNetWorthSummary`). However, the server component explicitly converts these strings into native `BigInt(...)` before passing them as props across the React Server Component (RSC) boundary to the client component.

- In `apps/web/src/app/cash-flow/page.tsx` (lines 9–42):
  `CashFlowSummaryCard.tsx`, `InflowStreamsCard.tsx`, and `OutflowStreamsCard.tsx` all declare `'use client';` at line 1.
  The server component `CashFlowPage` creates arrays of `InflowItem` and `OutflowItem` containing native `bigint` literals (e.g. `amountMinor: 12000000n`), computes `totalInflowsMinor: bigint` and `totalOutflowsMinor: bigint`, and passes them directly to `CashFlowSummaryCard`, `InflowStreamsCard`, and `OutflowStreamsCard`:
  ```tsx
  <CashFlowSummaryCard
    inflowsMinor={totalInflowsMinor}
    outflowsMinor={totalOutflowsMinor}
    currency="₹"
  />
  <InflowStreamsCard inflows={inflows} currency="₹" />
  <OutflowStreamsCard outflows={outflows} currency="₹" />
  ```
- Node verbatim evaluation:
  ```powershell
  node -e "JSON.stringify({ val: 100n })"
  # Output: TypeError: Do not know how to serialize a BigInt
  ```
  Next.js React Server Components serialize client component props via the React Flight protocol (JSON stream). Passing raw `bigint` objects from Server Components into Client Components causes a runtime crash with `TypeError: Do not know how to serialize a BigInt`.

### 1.2 Floating-Point Money Conversion in Server Action
- In `apps/web/src/lib/supabase/actions.ts` (line 84):
  ```ts
  export async function settleIOUAction(input: SettleIOUInput) {
    const amountMinor = BigInt(input.settlement_amount_minor);
    ...
    const { data, error } = await (supabase as any).rpc('settle_iou', {
      p_iou_id: input.iou_id,
      p_settlement_amount_minor: Number(amountMinor),
      p_account_id: input.account_id,
      p_notes: input.notes ?? null,
    });
  ```
  Line 84 explicitly casts `amountMinor` using `Number(amountMinor)`. In JavaScript, `Number` is an IEEE-754 double precision float (53-bit mantissa). In contrast, line 42 in `submitTransactionAction` properly serializes BigInts as numeric strings (`amount_minor: e.amount_minor.toString()`).
  PostgreSQL's `settle_iou` RPC accepts `p_settlement_amount_minor BIGINT`, which PostgREST accepts as a string representation without precision loss.

### 1.3 Web Cockpit Production Build Failure on Windows
- Command: `pnpm --filter @finvault/web build`
- Definition in `apps/web/package.json` (line 7):
  ```json
  "build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"
  ```
- Verbatim execution output:
  ```
  > @finvault/web@0.1.0 build D:\programming\New_project\apps\web
  > node -e "try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}" && next build

    ▲ Next.js 14.2.35

     Creating an optimized production build ...
  Failed to compile.

  Error: EPERM: operation not permitted, mkdir 'D:\programming\New_project\apps\web\.next\static\chunks'
  > Build failed because of webpack errors
  Exit status 1
  ```
  On Windows NTFS filesystems, `rmSync('.next')` leaves file/directory deletion asynchronous. When `next build` immediately tries to recreate directories within the same process chain, Windows denies permission (`EPERM`), aborting the build.
  When `pnpm exec next build` is executed directly without the pre-clean deletion command, Next.js builds successfully (`✓ Compiled successfully`, all 9 routes generated).

### 1.4 Verification Test Execution Results
- `pnpm --filter @finvault/web typecheck`: Exit code 0 (zero errors).
- `node --test packages/sync-engine/tests/sync-engine.test.ts`: Exit code 0 (23/23 passed, 296ms).
- `node --test packages/sync-engine/tests/client-schema.test.ts`: Exit code 0 (10/10 passed, 245ms).
- `node --experimental-strip-types tests/e2e/runner.ts`: Exit code 0 (63/63 passed, 11 suites).
- `node .agents/teamwork/explorer_m1_3/verify-m1.js`: Exit code 0 (86/86 passed).
- Layout & Anti-Clutter Compliance: All 5 views (`/`, `/cash-flow`, `/transactions`, `/ious`, `/login`) strictly present $\le 3$ visual component groups per viewport, and `ListItem` enforces $\le 3$ data attributes per row.
- Double-Entry Pre-validation: `apps/web/src/lib/validation/double-entry.ts` enforces $\ge 2$ entries, positive non-zero amounts, both debit & credit sides, and exact equality $\sum debits == \sum credits$.

---

## 2. Logic Chain

1. **RSC BigInt Hazard (Observation 1.1)**:
   - *Observation*: The dispatch prompt instructed: *"verify that props passed across Server/Client Component boundaries use string minor units, completely preventing TypeError: Do not know how to serialize a BigInt"*.
   - *Logic*: In Next.js 14 App Router, Server Components stream props to Client Components using React Flight, which uses JSON serialization. In JavaScript, `JSON.stringify(BigInt)` throws a fatal `TypeError`. In `apps/web/src/app/page.tsx` and `apps/web/src/app/cash-flow/page.tsx`, native `bigint` values are passed as props into client components (`NetWorthHeroCard`, `CashFlowSummaryCard`, `InflowStreamsCard`, `OutflowStreamsCard`).
   - *Deduction*: When dynamic request rendering occurs at runtime, Next.js will crash with `TypeError: Do not know how to serialize a BigInt`. This directly breaks the stated contract and milestone acceptance criteria.

2. **Ledger Float Safety Invariant (Observation 1.2)**:
   - *Observation*: Rule 01 and AGENTS.md mandate *"No Floating-Point Money: All monetary amounts must be stored and computed in BIGINT minor units (cents/paise)"*.
   - *Logic*: Line 84 of `apps/web/src/lib/supabase/actions.ts` executes `p_settlement_amount_minor: Number(amountMinor)`.
   - *Deduction*: `Number(amountMinor)` converts 64-bit integer minor units into IEEE-754 double floats, losing precision for values above $2^{53}-1$ and violating the strict prohibition against floating-point money in financial action handlers.

3. **Build Script Invalidation (Observation 1.3)**:
   - *Observation*: Worker M4 claimed that `pnpm --filter @finvault/web build` exited with code 0.
   - *Logic*: Running `pnpm --filter @finvault/web build` failed consistently on Windows with `EPERM: operation not permitted, mkdir ...` due to `rmSync('.next')` in the `build` script.
   - *Deduction*: The script defined in `package.json` fails in the primary execution environment. Removing the `rmSync` prefix and invoking `next build` directly compiles all 9 routes with exit code 0.

---

## 3. Caveats

1. **Static Build vs Runtime Flight Serialization**:
   - `next build` did not catch the BigInt serialization in `page.tsx` and `cash-flow/page.tsx` because both files set `export const revalidate = 0;`, deferring page rendering and RSC Flight serialization to runtime request handling (`ƒ (Dynamic)`).
2. **PostgREST RPC Types**:
   - PostgREST accepts string minor units for `BIGINT` parameters. Passing strings avoids float conversions while preserving arbitrary precision integer safety.

---

## 4. Conclusion & Required Changes

Milestone 4 shows strong architecture, high aesthetic compliance with Venzer design tokens, and clean double-entry validation. However, due to the RSC BigInt boundary violations, floating-point conversion in `settleIOUAction`, and the build script race condition, the review verdict is **REQUEST_CHANGES**.

### Mandatory Remediation Items:

1. **Fix RSC Props in View 1 (`apps/web/src/app/page.tsx` & `NetWorthHeroCard.tsx`)**:
   - Update `NetWorthHeroCardProps` to accept string minor units (or pass `summary: SerializedNetWorthSummary` directly).
   - In `apps/web/src/app/page.tsx`, do NOT cast `summary.*` to `BigInt(...)`. Pass string props across the RSC boundary and let `NetWorthHeroCard` parse or format them on the client.
2. **Fix RSC Props in View 2 (`apps/web/src/app/cash-flow/page.tsx` & Cash Flow Components)**:
   - Define string-encoded DTOs for `inflows` and `outflows` (e.g. `amountMinor: string` or pass `SerializedCashFlowSummary`).
   - In `apps/web/src/app/cash-flow/page.tsx`, pass strings across the RSC boundary to `CashFlowSummaryCard`, `InflowStreamsCard`, and `OutflowStreamsCard`.
3. **Eliminate Float Cast in `apps/web/src/lib/supabase/actions.ts`**:
   - Change line 84 from `p_settlement_amount_minor: Number(amountMinor)` to `p_settlement_amount_minor: amountMinor.toString()`.
4. **Fix Build Script in `apps/web/package.json`**:
   - Change `"build": "node -e \"...\" && next build"` to `"build": "next build"`.

---

## 5. Verification Method

To verify the remediated milestone implementation:

```powershell
# 1. Verify build script succeeds without EPERM errors
pnpm --filter @finvault/web build

# 2. Verify strict TypeScript typechecking
pnpm --filter @finvault/web typecheck

# 3. Verify no native BigInt values are passed across RSC boundaries
# Inspect page.tsx and cash-flow/page.tsx for any BigInt(...) passed into client components

# 4. Verify settleIOUAction passes BigInt as string to RPC
# Check apps/web/src/lib/supabase/actions.ts line 84

# 5. Run sync engine and invariant test suites
node --test packages/sync-engine/tests/sync-engine.test.ts
node --test packages/sync-engine/tests/client-schema.test.ts
node --experimental-strip-types tests/e2e/runner.ts
node .agents/teamwork/explorer_m1_3/verify-m1.js
```

### Invalidation Conditions:
- Any Server Component passing native `bigint` into a component marked `'use client'`.
- Any use of `Number(bigint)` in monetary action handlers.
- Any failure or non-zero exit code when running `pnpm --filter @finvault/web build`.
