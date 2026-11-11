# Milestone 4 Iteration 2: RSC Boundary BigInt Serialization Fix Blueprint

**Author:** Explorer M4 Iteration 2 (`explorer_m4_iter2_1`)  
**Role:** investigator, synthesizer  
**Target Files:**  
- `apps/web/src/app/page.tsx`  
- `apps/web/src/components/net-worth/NetWorthHeroCard.tsx` (referenced as `components/dashboard/NetWorthHeroCard.tsx` in prompt)  
- `apps/web/src/app/cash-flow/page.tsx`  
- `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`  
- `apps/web/src/components/cash-flow/InflowStreamsCard.tsx`  
- `apps/web/src/components/cash-flow/OutflowStreamsCard.tsx`  
- `apps/web/src/lib/money/serialization.ts`  
- `apps/web/src/lib/supabase/actions.ts`  
- `apps/web/package.json`  
**Date:** 2026-11-09T04:26:00Z  
**Parent Agent:** Orchestrator (`867b8adb-e639-414f-92fa-0326940898a2`)  

---

## 1. Observation

Direct observations from source inspection, AST review, and empirical verification:

### 1.1 Root Cause in Dashboard / Net Worth View (`apps/web/src/app/page.tsx`)
- In `apps/web/src/app/page.tsx` (lines 9–25):
  ```tsx
  export default async function NetWorthCockpitPage() {
    const [accounts, summary] = await Promise.all([
      fetchAccounts(),
      fetchNetWorthSummary(),
    ]);

    return (
      <div className="space-y-6">
        {/* Group 1: Hero Net Worth & Liquidity Card */}
        <NetWorthHeroCard
          netWorthMinor={BigInt(summary.netWorthMinor)}
          safeToSpendMinor={BigInt(summary.safeToSpendMinor)}
          totalAssetsMinor={BigInt(summary.totalAssetsMinor)}
          totalLiabilitiesMinor={BigInt(summary.totalLiabilitiesMinor)}
          currency={summary.currency}
        />
  ```
- In `apps/web/src/lib/services/accounts.ts` (lines 132–166), `fetchNetWorthSummary()` returns a `Promise<SerializedNetWorthSummary>` where all minor unit attributes (`totalAssetsMinor`, `totalLiabilitiesMinor`, `netWorthMinor`, `safeToSpendMinor`) are **already strings**.
- However, `NetWorthHeroCard.tsx` begins with line 1: `'use client';` and defines its prop interface with native `bigint` primitives:
  ```ts
  interface NetWorthHeroCardProps {
    netWorthMinor: bigint;
    safeToSpendMinor: bigint;
    totalAssetsMinor: bigint;
    totalLiabilitiesMinor: bigint;
    currency?: string;
  }
  ```
- Because `NetWorthHeroCardProps` enforced `bigint`, the Server Component author wrapped `summary.*` into `BigInt(...)`. When Next.js App Router streams Server Component props to Client Components across the React Server Component (RSC) boundary, it serializes props via React Flight protocol (`JSON.stringify`).
- Verbatim evaluation:
  ```powershell
  node -e "JSON.stringify({ netWorthMinor: 100n })"
  # Output: TypeError: Do not know how to serialize a BigInt
  ```
- Contrast: `AssetsBreakdownCard.tsx` and `LiabilitiesBreakdownCard.tsx` on lines 29 and 32 already accept `accounts: SerializedAccount[]` (with `balance_minor: string`) and parse `BigInt(a.balance_minor)` entirely within the client component. Only `NetWorthHeroCard` had `bigint` props.

### 1.2 Root Cause in Cash Flow View (`apps/web/src/app/cash-flow/page.tsx`)
- In `apps/web/src/app/cash-flow/page.tsx` (lines 8–33):
  ```tsx
  export default async function CashFlowPage() {
    const inflows: InflowItem[] = [
      { id: 'in-1', name: 'Primary Engineering Salary', category: 'Salary / W2', amountMinor: 12000000n },
      { id: 'in-2', name: 'Systems Architecture Consulting', category: 'Freelance', amountMinor: 2200000n },
      { id: 'in-3', name: 'Index Mutual Fund Dividends', category: 'Investments', amountMinor: 650000n },
    ];

    const outflows: OutflowItem[] = [
      { id: 'out-1', name: 'Apartment Lease & Maintenance', category: 'Housing', amountMinor: 3500000n },
      { id: 'out-2', name: 'Organic Groceries & Whole Foods', category: 'Food', amountMinor: 1840000n },
      ...
    ];

    const totalInflowsMinor = inflows.reduce((sum, item) => sum + item.amountMinor, 0n);
    const totalOutflowsMinor = outflows.reduce((sum, item) => sum + item.amountMinor, 0n);

    return (
      <div className="space-y-6">
        <CashFlowSummaryCard
          inflowsMinor={totalInflowsMinor}
          outflowsMinor={totalOutflowsMinor}
          currency="₹"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InflowStreamsCard inflows={inflows} currency="₹" />
          <OutflowStreamsCard outflows={outflows} currency="₹" />
        </div>
      </div>
    );
  }
  ```
- `CashFlowSummaryCard.tsx`, `InflowStreamsCard.tsx`, and `OutflowStreamsCard.tsx` all declare `'use client';` at line 1.
- In `CashFlowSummaryCard.tsx`:
  ```ts
  interface CashFlowSummaryCardProps {
    inflowsMinor: bigint;
    outflowsMinor: bigint;
    currentDayOfMonth?: number;
    currency?: string;
  }
  ```
- In `InflowStreamsCard.tsx` and `OutflowStreamsCard.tsx`:
  ```ts
  export interface InflowItem {
    id: string;
    name: string;
    category: string;
    amountMinor: bigint;
  }
  export interface OutflowItem {
    id: string;
    name: string;
    category: string;
    amountMinor: bigint;
  }
  ```
- In `apps/web/src/app/cash-flow/page.tsx` (Server Component), `inflows` and `outflows` use native `bigint` literals, and `totalInflowsMinor` and `totalOutflowsMinor` are native `bigint` values. Passing these across the RSC boundary into the client components will crash with `TypeError: Do not know how to serialize a BigInt`.

### 1.3 Floating-Point Cast in `settleIOUAction` (`apps/web/src/lib/supabase/actions.ts`)
- In `apps/web/src/lib/supabase/actions.ts` (lines 82–87):
  ```ts
  const { data, error } = await (supabase as any).rpc('settle_iou', {
    p_iou_id: input.iou_id,
    p_settlement_amount_minor: Number(amountMinor),
    p_account_id: input.account_id,
    p_notes: input.notes ?? null,
  });
  ```
- Line 84 casts `amountMinor` using `Number(...)`, introducing IEEE-754 floating-point conversion. In line 42 (`submitTransactionAction`), amounts are safely stringified: `amount_minor: e.amount_minor.toString()`. PostgREST accepts string minor units for PostgreSQL `BIGINT` parameters.

### 1.4 Windows Build Script Race Condition (`apps/web/package.json`)
- In `apps/web/package.json` line 7:
  ```json
  "build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build"
  ```
- On Windows NTFS filesystems, `rmSync('.next')` leaves file deletion asynchronous; when `next build` immediately attempts to create `.next/static/chunks`, Windows denies permission (`EPERM`), failing the build.

---

## 2. Logic Chain

1. **RSC Serialization Boundary Protocol**:
   - In Next.js App Router, the boundary between Server Components and Client Components (`'use client'`) is bridged by React Flight.
   - React Flight encodes props using JSON serialization.
   - JavaScript's `JSON.stringify` does not support `BigInt` and throws `TypeError: Do not know how to serialize a BigInt` when encountering any BigInt primitive.
   - Therefore, no prop passed from a Server Component to a Client Component may be of type `bigint`.

2. **DTO String-Encoding Strategy**:
   - To adhere to Rule 01 ("No Floating-Point Money: All monetary amounts must be stored and computed in BIGINT minor units"), monetary amounts must never be converted to floats.
   - Converting `BigInt` minor units to canonical string representation (`amount.toString()`) before passing props across the RSC boundary preserves arbitrary precision (including values beyond $2^{53}-1$).
   - On the client side (inside the Client Component), parsing the string back to `BigInt(propString || '0')` enables lossless BigInt arithmetic, ratio calculations, and zero-float formatting via `@finvault/ui`'s `formatMinorToDecimal(amountMinor: bigint)`.

3. **Component Interface Design**:
   - `NetWorthHeroCardProps`: Change `netWorthMinor`, `safeToSpendMinor`, `totalAssetsMinor`, `totalLiabilitiesMinor` from `bigint` to `string`. In `page.tsx`, pass `summary.*` directly without calling `BigInt(...)`.
   - `CashFlowSummaryCardProps`: Change `inflowsMinor` and `outflowsMinor` from `bigint` to `string`. In `CashFlowSummaryCard`, compute `netMinor = BigInt(inflowsMinor) - BigInt(outflowsMinor)`, savings rate, and daily burn rate on the client.
   - `InflowStreamsCard` & `OutflowStreamsCard`: Define `SerializedCashFlowItem` with `amountMinor: string`. In `InflowStreamsCard` and `OutflowStreamsCard`, parse `BigInt(item.amountMinor)` on the client.
   - In `apps/web/src/app/cash-flow/page.tsx`: Define items with string minor units (`amountMinor: '12000000'`) and convert aggregated totals to strings (`.toString()`) before passing them to `CashFlowSummaryCard`.

---

## 3. Caveats

1. **Directory Location of `NetWorthHeroCard.tsx`**:
   - The mission prompt referenced `apps/web/src/components/dashboard/NetWorthHeroCard.tsx`.
   - In the actual codebase, there is no `components/dashboard/` directory. The file is located at `apps/web/src/components/net-worth/NetWorthHeroCard.tsx` (as imported in `apps/web/src/app/page.tsx`: `import { NetWorthHeroCard } from '../components/net-worth/NetWorthHeroCard'`). The fix blueprint targets this exact file.
2. **Visual Component Group Rule (ADR-007 / Rule 02)**:
   - Automated stress tests (`m4-challenger2-cockpit-stress.ts`) check for `{/* Group 1: ... */}`, `{/* Group 2: ... */}`, and `{/* Group 3: ... */}` comments. When modifying `page.tsx` and `cash-flow/page.tsx`, these comment markers must be preserved verbatim.
3. **Other Views Already Compliant**:
   - `/ious` (`IOUSummaryCard`, `IOUClientManager`) and `/transactions` (`MultiSplitForm`, `RecentTransactionsCard`) already strictly accept serialized string DTOs (`SerializedAccount`, `SerializedTransaction`, `SerializedIOURecord`). No changes are needed in those views.

---

## 4. Conclusion & Exact Fix Blueprints

To resolve all RSC BigInt serialization leaks and review findings cleanly:
1. Update `apps/web/src/lib/money/serialization.ts` to export `SerializedCashFlowItem`, `SerializedInflowItem`, and `SerializedOutflowItem`.
2. Update `apps/web/src/components/net-worth/NetWorthHeroCard.tsx` to accept string minor unit props and parse `BigInt(...)` inside the component.
3. Update `apps/web/src/app/page.tsx` to pass `summary.*` directly without `BigInt(...)`.
4. Update `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx` to accept `inflowsMinor: string` and `outflowsMinor: string`.
5. Update `apps/web/src/components/cash-flow/InflowStreamsCard.tsx` and `OutflowStreamsCard.tsx` to accept items with `amountMinor: string`.
6. Update `apps/web/src/app/cash-flow/page.tsx` to supply string minor units.
7. Update `apps/web/src/lib/supabase/actions.ts` line 84 to pass `amountMinor.toString()`.
8. Update `apps/web/package.json` line 7 to `"build": "next build"`.

---

### Detailed File Diff Blueprints

#### Blueprint 1: `apps/web/src/lib/money/serialization.ts`
Add stream item DTOs under `SerializedCashFlowSummary`:

```diff
--- a/apps/web/src/lib/money/serialization.ts
+++ b/apps/web/src/lib/money/serialization.ts
@@ -85,2 +85,11 @@ export interface SerializedCashFlowSummary {
   period: string;
 }
+
+export interface SerializedCashFlowItem {
+  id: string;
+  name: string;
+  category: string;
+  amountMinor: string;
+}
+
+export type SerializedInflowItem = SerializedCashFlowItem;
+export type SerializedOutflowItem = SerializedCashFlowItem;
```

#### Blueprint 2: `apps/web/src/components/net-worth/NetWorthHeroCard.tsx`
Update prop types to `string` and parse locally with `BigInt(...)`:

```diff
--- a/apps/web/src/components/net-worth/NetWorthHeroCard.tsx
+++ b/apps/web/src/components/net-worth/NetWorthHeroCard.tsx
@@ -7,5 +7,5 @@ import { ShieldCheck, Sparkles } from 'lucide-react';
-interface NetWorthHeroCardProps {
-  netWorthMinor: bigint;
-  safeToSpendMinor: bigint;
-  totalAssetsMinor: bigint;
-  totalLiabilitiesMinor: bigint;
+export interface NetWorthHeroCardProps {
+  netWorthMinor: string;
+  safeToSpendMinor: string;
+  totalAssetsMinor: string;
+  totalLiabilitiesMinor: string;
   currency?: string;
@@ -21,4 +21,9 @@ export const NetWorthHeroCard: React.FC<NetWorthHeroCardProps> = ({
 }) => {
-  const totalCombined = totalAssetsMinor + totalLiabilitiesMinor;
+  const netWorthBn = BigInt(netWorthMinor || '0');
+  const safeToSpendBn = BigInt(safeToSpendMinor || '0');
+  const totalAssetsBn = BigInt(totalAssetsMinor || '0');
+  const totalLiabilitiesBn = BigInt(totalLiabilitiesMinor || '0');
+
+  const totalCombined = totalAssetsBn + totalLiabilitiesBn;
   const assetRatio = totalCombined > 0n
-    ? Number((totalAssetsMinor * 100n) / totalCombined)
+    ? Number((totalAssetsBn * 100n) / totalCombined)
     : 100;
@@ -37,4 +42,4 @@ export const NetWorthHeroCard: React.FC<NetWorthHeroCardProps> = ({
           <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#38424C]">
-            {currency}{formatMinorToDecimal(netWorthMinor)}
+            {currency}{formatMinorToDecimal(netWorthBn)}
           </div>
           <p className="text-xs text-[#90A999]">
-            Assets {currency}{formatMinorToDecimal(totalAssetsMinor)} · Liabilities {currency}{formatMinorToDecimal(totalLiabilitiesMinor)}
+            Assets {currency}{formatMinorToDecimal(totalAssetsBn)} · Liabilities {currency}{formatMinorToDecimal(totalLiabilitiesBn)}
           </p>
@@ -51,3 +56,3 @@ export const NetWorthHeroCard: React.FC<NetWorthHeroCardProps> = ({
           <div className="text-2xl font-bold text-[#38424C] mt-1">
-            {currency}{formatMinorToDecimal(safeToSpendMinor)}
+            {currency}{formatMinorToDecimal(safeToSpendBn)}
           </div>
```

#### Blueprint 3: `apps/web/src/app/page.tsx`
Remove `BigInt(...)` casts across RSC boundary:

```diff
--- a/apps/web/src/app/page.tsx
+++ b/apps/web/src/app/page.tsx
@@ -18,5 +18,5 @@ export default async function NetWorthCockpitPage() {
       <NetWorthHeroCard
-        netWorthMinor={BigInt(summary.netWorthMinor)}
-        safeToSpendMinor={BigInt(summary.safeToSpendMinor)}
-        totalAssetsMinor={BigInt(summary.totalAssetsMinor)}
-        totalLiabilitiesMinor={BigInt(summary.totalLiabilitiesMinor)}
+        netWorthMinor={summary.netWorthMinor}
+        safeToSpendMinor={summary.safeToSpendMinor}
+        totalAssetsMinor={summary.totalAssetsMinor}
+        totalLiabilitiesMinor={summary.totalLiabilitiesMinor}
         currency={summary.currency}
```

#### Blueprint 4: `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`
Update prop types to `string` and parse locally with `BigInt(...)`:

```diff
--- a/apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx
+++ b/apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx
@@ -7,3 +7,3 @@ import { TrendingUp, Flame, Percent } from 'lucide-react';
-interface CashFlowSummaryCardProps {
-  inflowsMinor: bigint;
-  outflowsMinor: bigint;
+export interface CashFlowSummaryCardProps {
+  inflowsMinor: string;
+  outflowsMinor: string;
   currentDayOfMonth?: number;
@@ -19,4 +19,6 @@ export const CashFlowSummaryCard: React.FC<CashFlowSummaryCardProps> = ({
 }) => {
-  const netMinor = inflowsMinor - outflowsMinor;
+  const inflowsBn = BigInt(inflowsMinor || '0');
+  const outflowsBn = BigInt(outflowsMinor || '0');
+  const netMinor = inflowsBn - outflowsBn;
   const isPositive = netMinor >= 0n;
 
   // Exact BigInt-safe savings rate in basis points: ((in - out) * 10000) / in
-  const savingsRatePct = inflowsMinor > 0n
-    ? Number(((netMinor) * 10000n) / inflowsMinor) / 100
+  const savingsRatePct = inflowsBn > 0n
+    ? Number(((netMinor) * 10000n) / inflowsBn) / 100
     : 0;
 
   // Zero-float daily burn rate: outflows / days
   const dailyBurnMinor = currentDayOfMonth > 0
-    ? outflowsMinor / BigInt(currentDayOfMonth)
+    ? outflowsBn / BigInt(currentDayOfMonth)
     : 0n;
@@ -50,3 +52,3 @@ export const CashFlowSummaryCard: React.FC<CashFlowSummaryCardProps> = ({
           <p className="text-xs text-[#90A999]">
-            Inflows {currency}{formatMinorToDecimal(inflowsMinor)} · Outflows {currency}{formatMinorToDecimal(outflowsMinor)}
+            Inflows {currency}{formatMinorToDecimal(inflowsBn)} · Outflows {currency}{formatMinorToDecimal(outflowsBn)}
           </p>
```

#### Blueprint 5: `apps/web/src/components/cash-flow/InflowStreamsCard.tsx`
Update `InflowItem` to use string minor units:

```diff
--- a/apps/web/src/components/cash-flow/InflowStreamsCard.tsx
+++ b/apps/web/src/components/cash-flow/InflowStreamsCard.tsx
@@ -4,2 +4,3 @@ import React from 'react';
 import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
 import { ArrowDownLeft } from 'lucide-react';
+import type { SerializedInflowItem } from '../../lib/money/serialization';
 
-export interface InflowItem {
-  id: string;
-  name: string;
-  category: string;
-  amountMinor: bigint;
-}
+export type InflowItem = SerializedInflowItem;
 
-interface InflowStreamsCardProps {
+export interface InflowStreamsCardProps {
   inflows: InflowItem[];
   currency?: string;
 }
@@ -23,1 +24,1 @@ export const InflowStreamsCard: React.FC<InflowStreamsCardProps> = ({
-  const totalInflows = inflows.reduce((sum, item) => sum + item.amountMinor, 0n);
+  const totalInflows = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor || '0'), 0n);
@@ -49,1 +50,1 @@ export const InflowStreamsCard: React.FC<InflowStreamsCardProps> = ({
-                  +{currency}{formatMinorToDecimal(item.amountMinor)}
+                  +{currency}{formatMinorToDecimal(BigInt(item.amountMinor || '0'))}
```

#### Blueprint 6: `apps/web/src/components/cash-flow/OutflowStreamsCard.tsx`
Update `OutflowItem` to use string minor units:

```diff
--- a/apps/web/src/components/cash-flow/OutflowStreamsCard.tsx
+++ b/apps/web/src/components/cash-flow/OutflowStreamsCard.tsx
@@ -4,2 +4,3 @@ import React from 'react';
 import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
 import { ArrowUpRight } from 'lucide-react';
+import type { SerializedOutflowItem } from '../../lib/money/serialization';
 
-export interface OutflowItem {
-  id: string;
-  name: string;
-  category: string;
-  amountMinor: bigint;
-}
+export type OutflowItem = SerializedOutflowItem;
 
-interface OutflowStreamsCardProps {
+export interface OutflowStreamsCardProps {
   outflows: OutflowItem[];
   currency?: string;
 }
@@ -23,1 +24,1 @@ export const OutflowStreamsCard: React.FC<OutflowStreamsCardProps> = ({
-  const totalOutflows = outflows.reduce((sum, item) => sum + item.amountMinor, 0n);
+  const totalOutflows = outflows.reduce((sum, item) => sum + BigInt(item.amountMinor || '0'), 0n);
@@ -49,1 +50,1 @@ export const OutflowStreamsCard: React.FC<OutflowStreamsCardProps> = ({
-                  -{currency}{formatMinorToDecimal(item.amountMinor)}
+                  -{currency}{formatMinorToDecimal(BigInt(item.amountMinor || '0'))}
```

#### Blueprint 7: `apps/web/src/app/cash-flow/page.tsx`
Update mock data amounts to strings and stringify aggregated sums across RSC boundary:

```diff
--- a/apps/web/src/app/cash-flow/page.tsx
+++ b/apps/web/src/app/cash-flow/page.tsx
@@ -10,3 +10,3 @@ export default async function CashFlowPage() {
-    { id: 'in-1', name: 'Primary Engineering Salary', category: 'Salary / W2', amountMinor: 12000000n }, // ₹1,20,000.00
-    { id: 'in-2', name: 'Systems Architecture Consulting', category: 'Freelance', amountMinor: 2200000n }, // ₹22,000.00
-    { id: 'in-3', name: 'Index Mutual Fund Dividends', category: 'Investments', amountMinor: 650000n }, // ₹6,500.00
+    { id: 'in-1', name: 'Primary Engineering Salary', category: 'Salary / W2', amountMinor: '12000000' }, // ₹1,20,000.00
+    { id: 'in-2', name: 'Systems Architecture Consulting', category: 'Freelance', amountMinor: '2200000' }, // ₹22,000.00
+    { id: 'in-3', name: 'Index Mutual Fund Dividends', category: 'Investments', amountMinor: '650000' }, // ₹6,500.00
   ];
 
   const outflows: OutflowItem[] = [
-    { id: 'out-1', name: 'Apartment Lease & Maintenance', category: 'Housing', amountMinor: 3500000n }, // ₹35,000.00
-    { id: 'out-2', name: 'Organic Groceries & Whole Foods', category: 'Food', amountMinor: 1840000n }, // ₹18,400.00
-    { id: 'out-3', name: 'High-speed Fiber & Utilities', category: 'Utilities', amountMinor: 450000n }, // ₹4,500.00
-    { id: 'out-4', name: 'Public Transit & Fuel', category: 'Transport', amountMinor: 520000n }, // ₹5,200.00
-    { id: 'out-5', name: 'Cloud Infrastructure & SaaS', category: 'Discretionary', amountMinor: 380000n }, // ₹3,800.00
+    { id: 'out-1', name: 'Apartment Lease & Maintenance', category: 'Housing', amountMinor: '3500000' }, // ₹35,000.00
+    { id: 'out-2', name: 'Organic Groceries & Whole Foods', category: 'Food', amountMinor: '1840000' }, // ₹18,400.00
+    { id: 'out-3', name: 'High-speed Fiber & Utilities', category: 'Utilities', amountMinor: '450000' }, // ₹4,500.00
+    { id: 'out-4', name: 'Public Transit & Fuel', category: 'Transport', amountMinor: '520000' }, // ₹5,200.00
+    { id: 'out-5', name: 'Cloud Infrastructure & SaaS', category: 'Discretionary', amountMinor: '380000' }, // ₹3,800.00
   ];
 
-  const totalInflowsMinor = inflows.reduce((sum, item) => sum + item.amountMinor, 0n);
-  const totalOutflowsMinor = outflows.reduce((sum, item) => sum + item.amountMinor, 0n);
+  const totalInflowsMinor = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();
+  const totalOutflowsMinor = outflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();
```

#### Blueprint 8: `apps/web/src/lib/supabase/actions.ts`
Eliminate floating-point cast:

```diff
--- a/apps/web/src/lib/supabase/actions.ts
+++ b/apps/web/src/lib/supabase/actions.ts
@@ -84,1 +84,1 @@ export async function settleIOUAction(input: SettleIOUInput) {
-    p_settlement_amount_minor: Number(amountMinor),
+    p_settlement_amount_minor: amountMinor.toString(),
```

#### Blueprint 9: `apps/web/package.json`
Remove problematic `rmSync` script:

```diff
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -7,1 +7,1 @@
-    "build": "node -e \"try { require('fs').rmSync('.next', { recursive: true, force: true }); } catch (e) {}\" && next build",
+    "build": "next build",
```

---

## 5. Verification Method

Once Worker M4 applies these blueprints, verify independently using:

```powershell
# 1. Typecheck the web application (must exit 0 with 0 errors)
pnpm --filter @finvault/web typecheck

# 2. Verify RSC boundary serialization safety:
# Confirm no BigInt(...) casts exist in apps/web/src/app/page.tsx
# Confirm no native bigint amounts exist in apps/web/src/app/cash-flow/page.tsx
Select-String -Path "apps/web/src/app/page.tsx", "apps/web/src/app/cash-flow/page.tsx" -Pattern "BigInt\("

# 3. Verify actions.ts has zero Number(amountMinor) float casts:
Select-String -Path "apps/web/src/lib/supabase/actions.ts" -Pattern "Number\(amountMinor\)"

# 4. Run full regression invariant & stress test suites
node --experimental-strip-types tests/stress/m4-auditor-stress.ts
node --experimental-strip-types tests/stress/m4-challenger2-cockpit-stress.ts
node --experimental-strip-types tests/e2e/runner.ts
node --test packages/sync-engine/tests/sync-engine.test.ts
node --test packages/sync-engine/tests/client-schema.test.ts

# 5. Execute production build
pnpm --filter @finvault/web build
```

### Invalidation Conditions
- Any Server Component passing native `bigint` into a component marked `'use client'`.
- Any use of `Number(bigint)` in monetary action handlers.
- Any TypeScript compilation failure (`tsc --noEmit`).
