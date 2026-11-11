# Milestone 4 Web Cockpit BigInt Serialization & RSC Boundary Audit

**Agent:** Explorer M4 Iteration 2 (3/3) (`explorer_m4_iter2_3`)  
**Roles:** read-only investigation, synthesis  
**Target Milestone:** Milestone 4 (Shared UI Library & Web Application Cockpit)  
**Target Codebase:** `apps/web`, `packages/ui`, `packages/sync-engine`  
**Date:** 2026-11-09T04:28:00Z  
**Parent Agent:** Orchestrator (`867b8adb-e639-414f-92fa-0326940898a2`)  

---

## 1. Observation

A full static and syntactic scan was conducted across all files, routes, components, and services within `apps/web` to audit BigInt serialization across React Server Component (RSC) Flight boundaries, zero-float ledger compliance, and build/typecheck stability.

### 1.1 Complete View & Client Component RSC Boundary Safety Matrix

| View Route | File Path | Component(s) Rendered | Client Component? | Props Passed Across RSC Boundary | Minor Units Format | RSC Boundary Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `apps/web/src/app/page.tsx` | `NetWorthHeroCard` | Yes (`'use client'`) | `netWorthMinor`, `safeToSpendMinor`, `totalAssetsMinor`, `totalLiabilitiesMinor` | Native `BigInt(...)` (lines 19–22) | **LEAK DETECTED** (Flight TypeError) |
| `/` | `apps/web/src/app/page.tsx` | `AssetsBreakdownCard` | Yes (`'use client'`) | `accounts: SerializedAccount[]`, `currency: string` | String (`balance_minor: string`) | **100% SAFE** |
| `/` | `apps/web/src/app/page.tsx` | `LiabilitiesBreakdownCard` | Yes (`'use client'`) | `accounts: SerializedAccount[]`, `currency: string` | String (`balance_minor: string`) | **100% SAFE** |
| `/cash-flow` | `apps/web/src/app/cash-flow/page.tsx` | `CashFlowSummaryCard` | Yes (`'use client'`) | `inflowsMinor`, `outflowsMinor` | Native `bigint` (lines 30–31) | **LEAK DETECTED** (Flight TypeError) |
| `/cash-flow` | `apps/web/src/app/cash-flow/page.tsx` | `InflowStreamsCard` | Yes (`'use client'`) | `inflows: InflowItem[]` | Native `bigint` in array objects | **LEAK DETECTED** (Flight TypeError) |
| `/cash-flow` | `apps/web/src/app/cash-flow/page.tsx` | `OutflowStreamsCard` | Yes (`'use client'`) | `outflows: OutflowItem[]` | Native `bigint` in array objects | **LEAK DETECTED** (Flight TypeError) |
| `/transactions` | `apps/web/src/app/transactions/page.tsx` | `MultiSplitForm` | Yes (`'use client'`) | `accounts: SerializedAccount[]` | String (`balance_minor: string`) | **100% SAFE** |
| `/transactions` | `apps/web/src/app/transactions/page.tsx` | `RecentTransactionsCard` | Yes (`'use client'`) | `transactions: SerializedTransaction[]`, `currency: string` | String (`entries.amount_minor: string`) | **100% SAFE** |
| `/ious` | `apps/web/src/app/ious/page.tsx` | `IOUSummaryCard` | Yes (`'use client'`) | `ious: SerializedIOURecord[]`, `currency: string` | String (`remaining_balance_minor: string`) | **100% SAFE** |
| `/ious` | `apps/web/src/app/ious/page.tsx` | `IOUClientManager` | Yes (`'use client'`) | `ious: SerializedIOURecord[]`, `accounts: SerializedAccount[]` | String (`principal_minor`, `balance_minor`) | **100% SAFE** |
| `/ious` | (Client-to-Client via `IOUClientManager`) | `ActiveIOUsListCard` | Yes (`'use client'`) | `ious: SerializedIOURecord[]` | String (`principal_minor`, `remaining_balance_minor`) | **100% SAFE** |
| `/ious` | (Client-to-Client via `IOUClientManager`) | `SettledIOUsCard` | Yes (`'use client'`) | `ious: SerializedIOURecord[]` | String (`principal_minor`) | **100% SAFE** |
| `/ious` | (Client-to-Client via `IOUClientManager`) | `SettlementModal` | Yes (`'use client'`) | `iou: SerializedIOURecord \| null`, `accounts: SerializedAccount[]` | String (`remaining_balance_minor`, `balance_minor`) | **100% SAFE** |
| `/login` | `apps/web/src/app/login/page.tsx` | `LoginPage` | Yes (`'use client'`) | None (Page Root) | N/A | **100% SAFE** |
| Root | `apps/web/src/app/layout.tsx` | `NavigationShell` | Yes (`'use client'`) | `children: ReactNode`, `userEmail?: string` | N/A | **100% SAFE** |
| Route | `apps/web/src/app/auth/callback/route.ts` | Route Handler | No (Route Handler) | N/A | N/A | **100% SAFE** |
| Edge | `apps/web/src/middleware.ts` | Next Middleware | No (Edge Middleware) | N/A | N/A | **100% SAFE** |

### 1.2 Exhaustive Codebase Scans
1. **RSC Route Literal Scan (`apps/web/src/app/**/*.tsx`)**:
   - Query: `\d+n\b`
   - Result: Exactly 10 occurrences, all in `apps/web/src/app/cash-flow/page.tsx` (lines 10–12, 16–20, 23–24). Zero occurrences in any other page or layout.
2. **BigInt Instantiation Scan (`apps/web/src/**/*.ts*`)**:
   - Query: `BigInt\(`
   - In Server Components: Only lines 19–22 of `apps/web/src/app/page.tsx`.
   - In Client Components: `RecentTransactionsCard.tsx:34`, `IOUSummaryCard.tsx:23`, `ActiveIOUsListCard.tsx:66-67`, `SettledIOUsCard.tsx:42`, `SettlementModal.tsx:27,36,44,130`, `AssetsBreakdownCard.tsx:18,44`, `LiabilitiesBreakdownCard.tsx:18,44`. In all these components, `BigInt` is constructed *internally on the client* from string props received across the boundary.
3. **Float Conversion Scan (`Number\(` in `apps/web/src/**/*.ts*`)**:
   - Found:
     - `CashFlowSummaryCard.tsx:25`: Percentage formatting calculation (`Number(((netMinor) * 10000n) / inflowsMinor) / 100`).
     - `ActiveIOUsListCard.tsx:69`: Progress bar width calculation (`Number((remaining * 100n) / principal)`).
     - `NetWorthHeroCard.tsx:24`: Asset ratio gauge calculation (`Number((totalAssetsMinor * 100n) / totalCombined)`).
     - `apps/web/src/lib/supabase/actions.ts:84`: `p_settlement_amount_minor: Number(amountMinor)` -> **CRITICAL FLOAT LEAK**: Converts BigInt minor units to IEEE-754 double precision float before invoking database RPC.
4. **Build Script Hazard (`apps/web/package.json`)**:
   - Line 7 defines: `"build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"`.
   - On Windows NTFS filesystems, `rmSync` asynchronous handle release collides with immediate directory creation by `next build`, producing `EPERM: operation not permitted, mkdir ...apps\web\.next\static\chunks`.

### 1.3 Baseline Verification Status
- `pnpm --filter @finvault/web typecheck`: Exit code 0 (zero errors).
- `pnpm --filter @finvault/web exec next build`: Exit code 0 (All 9 routes compiled and optimized, 0 errors).
- `node --test packages/sync-engine/tests/sync-engine.test.ts`: Exit code 0 (23/23 tests pass).
- `node --test packages/sync-engine/tests/client-schema.test.ts`: Exit code 0 (10/10 tests pass).
- `node --experimental-strip-types tests/e2e/runner.ts`: Exit code 0 (63/63 tests pass across 11 suites).
- `node .agents/teamwork/explorer_m1_3/verify-m1.js`: Exit code 0 (86/86 checks pass).

---

## 2. Logic Chain

1. **React Server Component Flight Protocol Mechanics**:
   - *Observation*: `page.tsx` passes `BigInt(summary.netWorthMinor)` to `NetWorthHeroCard` (`'use client'`). `cash-flow/page.tsx` passes `inflowsMinor: 14850000n` to `CashFlowSummaryCard` (`'use client'`).
   - *Logic*: In Next.js App Router, Server Components stream props to Client Components using the React Flight wire format. React Flight serializes props as a JSON-like stream. Because ECMAScript `JSON.stringify` does not support `BigInt` (throwing `TypeError: Do not know how to serialize a BigInt`), passing native `bigint` props across the RSC boundary throws a fatal runtime exception.
   - *Observation on Build vs Runtime*: Next.js build succeeded because both `page.tsx` and `cash-flow/page.tsx` specify `export const revalidate = 0;`, designating them as dynamic routes (`ƒ (Dynamic)`). They are rendered only upon incoming HTTP request, at which point the Flight serialization throws.
   - *Conclusion*: Props passed from Server Components to Client Components must be serialized (strings/numbers/booleans/null/arrays/plain objects).

2. **Zero-Float Ledger Safety Invariant**:
   - *Observation*: In `apps/web/src/lib/supabase/actions.ts:84`, `settleIOUAction` calls `p_settlement_amount_minor: Number(amountMinor)`.
   - *Logic*: JavaScript's `Number` type is an IEEE-754 double precision float (53-bit mantissa). Amounts greater than $2^{53}-1$ suffer precision loss. Rule 01 and AGENTS.md mandate zero floating point money. In contrast, line 42 of `submitTransactionAction` in the same file passes `amount_minor: e.amount_minor.toString()`, which PostgREST accepts seamlessly as a Postgres `BIGINT`.
   - *Conclusion*: Line 84 must be changed to `p_settlement_amount_minor: amountMinor.toString()`.

3. **Regression Immunity & Monorepo Coupling**:
   - *Observation*: Scanned all imports of `NetWorthHeroCardProps`, `CashFlowSummaryCardProps`, `InflowStreamsCardProps`, `OutflowStreamsCardProps`, `InflowItem`, and `OutflowItem`.
   - *Logic*: None of these interfaces or components are exported from `packages/ui` or imported by `apps/mobile` or any test suite in `tests/e2e/`. They exist strictly within `apps/web/src/components/` and are consumed exclusively by their respective page files (`apps/web/src/app/page.tsx` and `apps/web/src/app/cash-flow/page.tsx`).
   - *Conclusion*: Changing the prop interfaces of these cards to accept strings instead of `bigint` is completely isolated to `apps/web`, with zero regression risk to existing test suites or packages.

---

## 3. Caveats

1. **Next.js Static Build vs Runtime Flight Serialization**:
   - `next build` does not execute dynamic RSC server component trees marked with `revalidate = 0`. Static builds alone do not validate RSC Flight serialization safety; prop contracts must be verified by inspecting the boundary types.
2. **Mobile Workspace Status (`apps/mobile`)**:
   - Running `pnpm -r typecheck` reveals typescript errors in `apps/mobile` (`src/lib/auth/biometrics.ts` and `src/lib/supabase/client.ts`). These are scoped exclusively for Milestone 5 (Mobile Application) and are separate from Milestone 4 (`apps/web`). `pnpm --filter @finvault/web typecheck` passes with zero errors.

---

## 4. Conclusion & Concrete Remediation Blueprint

The investigation confirms that View 3 (`/transactions`), View 4 (`/ious`), View 5 (`/login`), and root navigation are already **100% BigInt serialization safe**. The required remediations for Milestone 4 Iteration 2 are confined to exactly 5 component files, 2 page files, 1 server action, and 1 package script.

### Concrete Implementation Blueprint for Worker M4 Iteration 2:

#### Item 1: `apps/web/src/components/net-worth/NetWorthHeroCard.tsx`
Change prop interface to string minor units and parse to BigInt internally:
```tsx
// Before:
interface NetWorthHeroCardProps {
  netWorthMinor: bigint;
  safeToSpendMinor: bigint;
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  currency?: string;
}

// After:
interface NetWorthHeroCardProps {
  netWorthMinor: string;
  safeToSpendMinor: string;
  totalAssetsMinor: string;
  totalLiabilitiesMinor: string;
  currency?: string;
}

export const NetWorthHeroCard: React.FC<NetWorthHeroCardProps> = ({
  netWorthMinor,
  safeToSpendMinor,
  totalAssetsMinor,
  totalLiabilitiesMinor,
  currency = '₹',
}) => {
  const netWorth = BigInt(netWorthMinor);
  const safeToSpend = BigInt(safeToSpendMinor);
  const totalAssets = BigInt(totalAssetsMinor);
  const totalLiabilities = BigInt(totalLiabilitiesMinor);

  const totalCombined = totalAssets + totalLiabilities;
  const assetRatio = totalCombined > 0n
    ? Number((totalAssets * 100n) / totalCombined)
    : 100;
  // Use netWorth, safeToSpend, totalAssets, totalLiabilities in JSX formatting
```

#### Item 2: `apps/web/src/app/page.tsx`
Remove `BigInt(...)` casts across the RSC boundary:
```tsx
// Before:
<NetWorthHeroCard
  netWorthMinor={BigInt(summary.netWorthMinor)}
  safeToSpendMinor={BigInt(summary.safeToSpendMinor)}
  totalAssetsMinor={BigInt(summary.totalAssetsMinor)}
  totalLiabilitiesMinor={BigInt(summary.totalLiabilitiesMinor)}
  currency={summary.currency}
/>

// After:
<NetWorthHeroCard
  netWorthMinor={summary.netWorthMinor}
  safeToSpendMinor={summary.safeToSpendMinor}
  totalAssetsMinor={summary.totalAssetsMinor}
  totalLiabilitiesMinor={summary.totalLiabilitiesMinor}
  currency={summary.currency}
/>
```

#### Item 3: `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`
Change prop interface to string minor units:
```tsx
// Before:
interface CashFlowSummaryCardProps {
  inflowsMinor: bigint;
  outflowsMinor: bigint;
  currentDayOfMonth?: number;
  currency?: string;
}

// After:
interface CashFlowSummaryCardProps {
  inflowsMinor: string;
  outflowsMinor: string;
  currentDayOfMonth?: number;
  currency?: string;
}

export const CashFlowSummaryCard: React.FC<CashFlowSummaryCardProps> = ({
  inflowsMinor,
  outflowsMinor,
  currentDayOfMonth = new Date().getDate(),
  currency = '₹',
}) => {
  const inflows = BigInt(inflowsMinor);
  const outflows = BigInt(outflowsMinor);
  const netMinor = inflows - outflows;
  const isPositive = netMinor >= 0n;

  const savingsRatePct = inflows > 0n
    ? Number(((netMinor) * 10000n) / inflows) / 100
    : 0;

  const dailyBurnMinor = currentDayOfMonth > 0
    ? outflows / BigInt(currentDayOfMonth)
    : 0n;
  // Format with formatMinorToDecimal(netMinor), formatMinorToDecimal(inflows), formatMinorToDecimal(outflows), formatMinorToDecimal(dailyBurnMinor)
```

#### Item 4: `apps/web/src/components/cash-flow/InflowStreamsCard.tsx` & `OutflowStreamsCard.tsx`
Update `InflowItem` and `OutflowItem` interfaces to use `amountMinor: string`:
```tsx
// In InflowStreamsCard.tsx:
export interface InflowItem {
  id: string;
  name: string;
  category: string;
  amountMinor: string;
}

// Inside InflowStreamsCard:
const totalInflows = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
// Metric formatting:
+{currency}{formatMinorToDecimal(BigInt(item.amountMinor))}

// In OutflowStreamsCard.tsx:
export interface OutflowItem {
  id: string;
  name: string;
  category: string;
  amountMinor: string;
}

// Inside OutflowStreamsCard:
const totalOutflows = outflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
// Metric formatting:
-{currency}{formatMinorToDecimal(BigInt(item.amountMinor))}
```

#### Item 5: `apps/web/src/app/cash-flow/page.tsx`
Define data arrays with string minor units and pass string totals:
```tsx
// In CashFlowPage:
const inflows: InflowItem[] = [
  { id: 'in-1', name: 'Primary Engineering Salary', category: 'Salary / W2', amountMinor: '12000000' },
  { id: 'in-2', name: 'Systems Architecture Consulting', category: 'Freelance', amountMinor: '2200000' },
  { id: 'in-3', name: 'Index Mutual Fund Dividends', category: 'Investments', amountMinor: '650000' },
];

const outflows: OutflowItem[] = [
  { id: 'out-1', name: 'Apartment Lease & Maintenance', category: 'Housing', amountMinor: '3500000' },
  { id: 'out-2', name: 'Organic Groceries & Whole Foods', category: 'Food', amountMinor: '1840000' },
  { id: 'out-3', name: 'High-speed Fiber & Utilities', category: 'Utilities', amountMinor: '450000' },
  { id: 'out-4', name: 'Public Transit & Fuel', category: 'Transport', amountMinor: '520000' },
  { id: 'out-5', name: 'Cloud Infrastructure & SaaS', category: 'Discretionary', amountMinor: '380000' },
];

const totalInflowsMinor = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
const totalOutflowsMinor = outflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);

return (
  <div className="space-y-6">
    <CashFlowSummaryCard
      inflowsMinor={totalInflowsMinor.toString()}
      outflowsMinor={totalOutflowsMinor.toString()}
      currency="₹"
    />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <InflowStreamsCard inflows={inflows} currency="₹" />
      <OutflowStreamsCard outflows={outflows} currency="₹" />
    </div>
  </div>
);
```

#### Item 6: `apps/web/src/lib/supabase/actions.ts`
Line 84:
```ts
// Before:
p_settlement_amount_minor: Number(amountMinor),

// After:
p_settlement_amount_minor: amountMinor.toString(),
```

#### Item 7: `apps/web/package.json`
Line 7:
```json
// Before:
"build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build",

// After:
"build": "next build",
```

---

## 5. Verification Method

Following remediation, independently verify:

```powershell
# 1. Verify build script succeeds without EPERM errors
pnpm --filter @finvault/web build

# 2. Verify strict TypeScript typechecking
pnpm --filter @finvault/web typecheck

# 3. Verify zero native BigInts in RSC boundary props
# Run regex checks on apps/web/src/app
Get-ChildItem -Path apps/web/src/app -Recurse -File | Where-Object { $_.FullName -notmatch '\\(node_modules|\.next)\\' } | Select-String "BigInt\("
# Output must be empty

# 4. Verify no Number() casts on monetary amounts in actions.ts
Select-String -Path apps/web/src/lib/supabase/actions.ts -Pattern "Number\("
# Output must be empty

# 5. Run full invariant and sync engine test suites
node --test packages/sync-engine/tests/sync-engine.test.ts
node --test packages/sync-engine/tests/client-schema.test.ts
node --experimental-strip-types tests/e2e/runner.ts
node .agents/teamwork/explorer_m1_3/verify-m1.js
```

### Invalidation Conditions:
- Any `bigint` passed as a prop across a Server-to-Client component boundary.
- Any `Number(bigint)` conversion for financial amounts sent to RPCs.
- Non-zero exit code on `pnpm --filter @finvault/web typecheck` or `pnpm --filter @finvault/web build`.
- Any failure in the 63/63 E2E test suite or 23/23 sync engine tests.
