# Next.js 14 Cockpit Views & Navigation Architecture Blueprint
**Agent**: `explorer_m4_2`  
**Milestone**: Milestone 4 (Shared UI Library & Web Application Cockpit)  
**Date**: 2026-11-09  

---

## 1. Observation

### 1.1 Codebase & File System Inspection
1. **Repository Topology**:
   - `apps/web`: Next.js 14+ (`14.2.3`), React 18, Tailwind CSS (`3.4.3`), TypeScript (`5.4.5`), `@supabase/ssr` (`^0.3.0`), `@supabase/supabase-js` (`^2.42.0`).
   - `packages/ui`: Shared UI library exporting Venzer Botanical design tokens (`TOKENS`), `Card`, `Button`, `BalanceBadge`, `AmountInput`, `formatMinorToDecimal`, `parseDecimalToMinor`.
   - `packages/db-types`: Complete TypeScript database definitions: `Account`, `Transaction`, `JournalEntry`, `IOURecord`, `SinkingFund`, `AuditLog`, and Supabase typed generic `Database`.
   - `packages/sync-engine`: Local-first SQLite operations (`AccountsOperations`, `TransactionsOperations`, `IOUsOperations`), outbox queue (`sync_queue`), and delta sync engine.
   - `supabase/migrations/`: Two SQL migrations:
     - `20261108000000_init_finvault_schema.sql`: Core tables, `BIGINT` minor units, deferred double-entry constraint trigger `trg_verify_transaction_balance`, balance update trigger `trg_update_account_balance`.
     - `20261108000001_security_hardening_and_iou_settlement.sql`: `profiles` table, Google OAuth user provisioning trigger, atomic `post_transaction` RPC, and atomic `settle_iou` RPC with contra clearing logic (`IOU Clearing` account).

2. **Existing `apps/web` Structure**:
   - `apps/web/package.json`: References `@finvault/db-types`, `@finvault/sync-engine`, and `@finvault/ui` as workspace dependencies (`workspace:*`).
   - `apps/web/tailwind.config.ts`: Configures colors (`obsidian: #040A0A`, `softMint: #DEEEDA`, `sagePistachio: #C7E0BA`, `botanicalGreen: #7AAA4A`, `mutedSage: #90A999`, `charcoalSlate: #38424C`), radius (`3xl: 24px`), and transition duration (`150ms`).
   - `apps/web/src/app/layout.tsx`: Root HTML shell with dark background `#040A0A`.
   - `apps/web/src/app/page.tsx`: Initial stub rendering 3 mock cards for Net Worth, Cash Flow, and Peer IOUs.
   - `apps/web/src/app/auth/callback/route.ts`: Supabase OAuth PKCE exchange endpoint.
   - `apps/web/src/middleware.ts`: Authenticated route guard redirecting unauthenticated traffic to `/login`.

3. **Current Missing Components**:
   - `apps/web` does not yet possess dedicated routes for `/cash-flow`, `/transactions`, `/ious`, or `/login`.
   - There is no unified navigation shell (desktop sidebar / mobile bottom tab bar) shared across views.
   - `apps/web/node_modules` is not yet populated locally, triggering `Cannot find module` during isolated `tsc --noEmit` if pnpm dependencies have not been linked.

---

## 2. Logic Chain

### 2.1 Design Constraints Alignment (Venzer Botanical Minimalist System)
- **Constraint 1 (Max 3 Visual Component Groups)**:
  - *Source*: `docs/03-DESIGN-SYSTEM.md:12` and `.agents/rules/02-frontend-mobile-standards.md:15`.
  - *Inference*: Every single view in the cockpit must consist of at most 3 distinct visual cards or sections per screen. We structure every view as:
    - **Group 1: Hero Metric / Context Header Card** (High-level position, burn rate, balance status, or summary).
    - **Group 2: Primary Breakdown / Interaction Card** (Assets list, inflow streams, multi-split entry table, or active IOUs list).
    - **Group 3: Secondary Breakdown / History Card** (Liabilities list, outflow streams, recent transactions audit, or settled archive).
- **Constraint 2 (Max 3 Data Attributes per List Row)**:
  - *Source*: `docs/03-DESIGN-SYSTEM.md:13`.
  - *Inference*: List items in tables and cards must strictly display at most 3 data attributes per row (e.g., Title/Tag, Progress/Date, Minor Amount/Action).
- **Constraint 3 (Fluid Micro-Transitions $\le 180$ms)**:
  - *Source*: `docs/03-DESIGN-SYSTEM.md:17` and `packages/ui/src/tokens.ts:17`.
  - *Inference*: Modals, tabs, buttons, and balance badges must transition strictly within `120ms`–`180ms` (Tailwind `duration-150 ease-out`). Zero spring physics or bouncy animations.
- **Constraint 4 (Zero Floating-Point Money & Strict BigInt Minor Units)**:
  - *Source*: `AGENTS.md`, `.agents/rules/01-financial-ledger-safety.md`.
  - *Inference*: All money inputs and calculations in the UI must remain in 64-bit integer minor units (`bigint`). Parsing uses `parseDecimalToMinor(str)` and display uses `formatMinorToDecimal(bigint)`.

### 2.2 View Architecture Breakdown
1. **View 1: Net Worth Cockpit (`/`)**:
   - *Group 1*: Headline Net Worth (`Total Assets - Total Liabilities`), Safe-to-Spend Liquidity indicator (`Liquid Cash/Bank - Upcoming Sinking Funds - Short Term Debts`), and Assets vs Liabilities ratio bar.
   - *Group 2*: Assets Breakdown Card (Cash Wallet, Bank Accounts, Investment Accounts, Receivables).
   - *Group 3*: Liabilities Breakdown Card (Credit Cards, Personal Loans, Payables).
2. **View 2: Cash Flow View (`/cash-flow`)**:
   - *Group 1*: Monthly Cash Flow Summary & Burn Rate Hero Card (Net Cash Flow trajectory, Savings Rate percentage, Daily burn rate).
   - *Group 2*: Inflow Streams Card (Salary, Freelance, Dividends).
   - *Group 3*: Outflow Streams Card (Housing, Food, Utilities, Transport, Discretionary).
3. **View 3: Multi-Split Transaction Entry View (`/transactions`)**:
   - *Group 1*: Transaction Metadata Header Card (Date, Description, Notes, and live `BalanceBadge` updating sub-50ms on every keystroke).
   - *Group 2*: Multi-Split Journal Entries Form Card (Dynamic debit/credit rows, Account selector, `AmountInput`, Add Leg, Auto-Balance helper, Submit button disabled when unbalanced).
   - *Group 3*: Recent Posted Transactions Card (Last 5 transactions audit trail).
4. **View 4: IOU & Peer Debt Tracking View (`/ious`)**:
   - *Group 1*: Peer Debt Summary Card (Total Owed To You, Total You Owe, Net Peer Position).
   - *Group 2*: Active Peer Debts List Card (Filtered by Lent/Borrowed, Progress bar of remaining/principal, and "Settle" action button).
   - *Group 3*: Settled Peer Debts Archive Card (Historical settled debts).
   - *Modal*: One-Click Settlement Modal invoking contra clearing logic via `settle_iou` RPC.

### 2.3 Navigation Shell Architecture
- **Desktop (`md:` breakpoint and above)**:
  - Fixed left sidebar (`w-64`, `#040A0A` background, border-r `#38424C/50`).
  - Brand header with FinVault emblem.
  - Active navigation indicator in Botanical Green (`#7AAA4A`).
  - Bottom user pill with email, sync status dot, and logout.
- **Mobile (`< md`)**:
  - Top header (`h-14`) with FinVault mark and active route title.
  - Fixed bottom tab bar (`h-16`, `#040A0A/95 backdrop-blur-md`, border-t `#38424C/40`).
  - 4 primary touch targets ($\ge 48\text{px} \times 48\text{px}$) with icons and labels.

---

## 3. Caveats
1. **BigInt JSON Serialization in Next.js Server Components**:
   - Next.js Server Actions and RSC payload serialization throws `TypeError: Do not know how to serialize a BigInt` if raw `bigint` types are returned directly across the network boundary.
   - *Remedy*: In data fetchers or server actions, minor units must either be serialized as strings (`amount_minor.toString()`) across the boundary or manipulated inside Client Components where native `bigint` is supported.
2. **PostgreSQL RPC vs Client SQLite Sync**:
   - The web app operates primarily online with `@supabase/supabase-js` invoking RPCs `post_transaction` and `settle_iou`. If offline-first web mode is enabled via `packages/sync-engine`, mutations go through `TransactionsOperations.postTransaction` and `sync_queue`.
   - *Remedy*: Both flows share identical data shapes (`CreateTransactionDTO` and `CreateJournalEntryDTO`).
3. **Local `node_modules` in Monorepo**:
   - Before executing `pnpm --filter @finvault/web build` or `typecheck`, `pnpm install` must be run at the workspace root to link `@finvault/db-types`, `@finvault/sync-engine`, and `@finvault/ui`.

---

## 4. Conclusion & Blueprints

### 4.1 Route Hierarchy & File Map
```
apps/web/src/
├── app/
│   ├── globals.css
│   ├── layout.tsx                               # Root layout with fonts & theme tokens
│   ├── login/
│   │   └── page.tsx                             # Botanical minimalist OAuth login
│   ├── (cockpit)/
│   │   ├── layout.tsx                           # Cockpit layout wrapper with Shell
│   │   ├── page.tsx                             # View 1: Net Worth Cockpit
│   │   ├── cash-flow/
│   │   │   └── page.tsx                         # View 2: Cash Flow View
│   │   ├── transactions/
│   │   │   └── page.tsx                         # View 3: Multi-Split Transaction Entry
│   │   └── ious/
│   │       └── page.tsx                         # View 4: Peer Debt Tracking
├── components/
│   ├── layout/
│   │   ├── CockpitShell.tsx                     # Responsive container (Sidebar + Mobile Nav)
│   │   ├── SidebarNav.tsx                       # Desktop sidebar navigation
│   │   ├── MobileBottomNav.tsx                  # Mobile bottom 4-tab bar
│   │   └── TopHeader.tsx                        # Minimalist cockpit top header
│   ├── net-worth/
│   │   ├── NetWorthHeroCard.tsx                 # Group 1: Net Worth & Liquidity Hero
│   │   ├── AssetsBreakdownCard.tsx              # Group 2: Liquid & Fixed Assets list
│   │   └── LiabilitiesBreakdownCard.tsx         # Group 3: Liabilities list
│   ├── cash-flow/
│   │   ├── CashFlowSummaryCard.tsx              # Group 1: Monthly Trajectory & Burn Rate
│   │   ├── InflowStreamsCard.tsx                # Group 2: Income stream breakdown
│   │   └── OutflowStreamsCard.tsx               # Group 3: Outflow & daily run rate
│   ├── transactions/
│   │   ├── TransactionHeaderCard.tsx            # Group 1: Metadata & live BalanceBadge
│   │   ├── MultiSplitLegsTable.tsx              # Group 2: Dynamic journal entry table
│   │   └── RecentTransactionsCard.tsx           # Group 3: Recent posted audit list
│   └── ious/
│       ├── IOUSummaryCard.tsx                   # Group 1: Debt overview & Net Position
│       ├── ActiveIOUsListCard.tsx               # Group 2: Active IOUs & progress bars
│       ├── SettledIOUsCard.tsx                  # Group 3: Settled archive
│       └── SettlementModal.tsx                  # Contra clearing settlement modal
```

---

### 4.2 Layout & Navigation Shell Blueprint

#### `apps/web/src/components/layout/CockpitShell.tsx`
```tsx
'use client';

import React from 'react';
import { SidebarNav } from './SidebarNav';
import { MobileBottomNav } from './MobileBottomNav';
import { TopHeader } from './TopHeader';

interface CockpitShellProps {
  children: React.ReactNode;
  userEmail?: string;
}

export const CockpitShell: React.FC<CockpitShellProps> = ({ children, userEmail = 'user@finvault.local' }) => {
  return (
    <div className="min-h-screen bg-[#040A0A] text-[#DEEEDA]">
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col border-r border-[#38424C]/40 bg-[#040A0A] z-30">
        <SidebarNav userEmail={userEmail} />
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        <TopHeader userEmail={userEmail} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (hidden on desktop) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#040A0A]/95 backdrop-blur-md border-t border-[#38424C]/40">
        <MobileBottomNav />
      </nav>
    </div>
  );
};
```

#### `apps/web/src/components/layout/SidebarNav.tsx`
```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  ShieldCheck, 
  Wallet, 
  TrendingUp, 
  ArrowLeftRight, 
  Users, 
  LogOut, 
  CircleDot 
} from 'lucide-react';

interface SidebarNavProps {
  userEmail: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Net Worth', icon: Wallet },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/ious', label: 'Peer IOUs', icon: Users },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({ userEmail }) => {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full justify-between p-4">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="h-9 w-9 rounded-2xl bg-[#7AAA4A]/20 border border-[#7AAA4A]/40 flex items-center justify-center text-[#7AAA4A]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-lg text-[#DEEEDA]">FinVault</span>
            <p className="text-[11px] text-[#90A999] tracking-wider uppercase">Private Ledger</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#7AAA4A]/15 text-[#7AAA4A] border-l-2 border-[#7AAA4A]'
                    : 'text-[#90A999] hover:text-[#DEEEDA] hover:bg-[#38424C]/20'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Session Footer */}
      <div className="border-t border-[#38424C]/40 pt-4 px-2 space-y-3">
        <div className="flex items-center justify-between text-xs text-[#90A999]">
          <div className="flex items-center gap-1.5">
            <CircleDot className="h-3 w-3 text-[#7AAA4A] animate-pulse" />
            <span>Synced</span>
          </div>
          <span className="truncate max-w-[120px]">{userEmail}</span>
        </div>
        <button
          onClick={() => { window.location.href = '/login'; }}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#90A999] hover:text-[#E06A55] rounded-xl hover:bg-rose-500/10 transition-colors duration-150"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
```

#### `apps/web/src/components/layout/MobileBottomNav.tsx`
```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, TrendingUp, ArrowLeftRight, Users } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Net Worth', icon: Wallet },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { href: '/transactions', label: 'Split Entry', icon: ArrowLeftRight },
  { href: '/ious', label: 'Peer IOUs', icon: Users },
];

export const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-4 h-16 items-center">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center h-full min-h-[48px] gap-1 transition-colors duration-150 ${
              isActive ? 'text-[#7AAA4A]' : 'text-[#90A999] hover:text-[#DEEEDA]'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
};
```

---

### 4.3 View 1: Net Worth Cockpit Blueprint (`/`)

#### Wireframe & Visual Composition:
```
+----------------------------------------------------------------------------+
| GROUP 1: NET WORTH & LIQUIDITY HERO CARD                                   |
| Net Worth: ₹14,50,000.00          Safe to Spend: ₹1,20,000.00 (Liquid)     |
| [=========================== Assets 82% ====================|== Liab 18% =] |
+----------------------------------------------------------------------------+
| GROUP 2: ASSETS BREAKDOWN CARD             | GROUP 3: LIABILITIES CARD      |
| Cash Wallet           Cash     ₹25,000.00  | Credit Card    Short   ₹42,000.00  |
| Primary Bank Account  Bank    ₹3,50,000.00 | Personal Loan  Long   ₹2,50,000.00 |
| Index Mutual Funds    Invest  ₹8,75,000.00 | Bob Split (IOU) IOU     ₹5,000.00  |
| Total Assets:                ₹17,47,000.00 | Total Liab:           ₹2,97,000.00 |
+----------------------------------------------------------------------------+
```

#### `apps/web/src/components/net-worth/NetWorthHeroCard.tsx`
```tsx
'use client';

import React from 'react';
import { Card, formatMinorToDecimal } from '@finvault/ui';
import { ShieldCheck, Sparkles } from 'lucide-react';

interface NetWorthHeroCardProps {
  netWorthMinor: bigint;
  safeToSpendMinor: bigint;
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  currency?: string;
}

export const NetWorthHeroCard: React.FC<NetWorthHeroCardProps> = ({
  netWorthMinor,
  safeToSpendMinor,
  totalAssetsMinor,
  totalLiabilitiesMinor,
  currency = '₹',
}) => {
  const totalCombined = totalAssetsMinor + totalLiabilitiesMinor;
  const assetRatio = totalCombined > 0n
    ? Number((totalAssetsMinor * 100n) / totalCombined)
    : 100;

  return (
    <Card variant="surface" className="p-6 md:p-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Metric 1: Total Net Worth */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#38424C]/80">
            <ShieldCheck className="h-4 w-4 text-[#7AAA4A]" />
            <span>Consolidated Net Worth</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#38424C]">
            {currency}{formatMinorToDecimal(netWorthMinor)}
          </div>
          <p className="text-xs text-[#90A999]">
            Assets {currency}{formatMinorToDecimal(totalAssetsMinor)} · Liabilities {currency}{formatMinorToDecimal(totalLiabilitiesMinor)}
          </p>
        </div>

        {/* Metric 2: Safe-to-Spend Liquidity */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 min-w-[240px]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7AAA4A]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Safe-to-Spend (Unencumbered)</span>
          </div>
          <div className="text-2xl font-bold text-[#38424C] mt-1">
            {currency}{formatMinorToDecimal(safeToSpendMinor)}
          </div>
          <p className="text-[11px] text-[#90A999] mt-0.5">
            Liquid cash minus short-term debts & sinking funds
          </p>
        </div>
      </div>

      {/* Asset to Liability Visual Ratio Gauge */}
      <div className="mt-6 space-y-1.5">
        <div className="flex justify-between text-[11px] font-semibold text-[#38424C]">
          <span>Assets ({assetRatio}%)</span>
          <span>Liabilities ({100 - assetRatio}%)</span>
        </div>
        <div className="h-2 w-full bg-[#38424C]/20 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#7AAA4A] transition-all duration-150"
            style={{ width: `${assetRatio}%` }}
          />
          <div
            className="h-full bg-rose-400 transition-all duration-150"
            style={{ width: `${100 - assetRatio}%` }}
          />
        </div>
      </div>
    </Card>
  );
};
```

---

### 4.4 View 2: Cash Flow View Blueprint (`/cash-flow`)

#### Wireframe & Visual Composition:
```
+----------------------------------------------------------------------------+
| GROUP 1: MONTHLY CASH FLOW & BURN RATE HERO                                |
| Net Trajectory: +₹45,200.00         Savings Rate: 42.5% [Botanical Badge]  |
| Daily Burn Rate: ₹1,450.00/day      Period: Current Month (May 2026)       |
+----------------------------------------------------------------------------+
| GROUP 2: INFLOW STREAMS                    | GROUP 3: OUTFLOW STREAMS       |
| Primary Salary     85%       ₹1,20,000.00  | Housing & Rent   ₹35,000.00    |
| Consulting / IOU   15%         ₹22,000.00  | Groceries & Food ₹18,400.00    |
| Total Inflows:               ₹1,42,000.00  | Total Outflows:  ₹96,800.00    |
+----------------------------------------------------------------------------+
```

#### `apps/web/src/components/cash-flow/CashFlowSummaryCard.tsx`
```tsx
'use client';

import React from 'react';
import { Card, formatMinorToDecimal } from '@finvault/ui';
import { TrendingUp, Flame, Percent } from 'lucide-react';

interface CashFlowSummaryCardProps {
  inflowsMinor: bigint;
  outflowsMinor: bigint;
  currentDayOfMonth?: number;
  currency?: string;
}

export const CashFlowSummaryCard: React.FC<CashFlowSummaryCardProps> = ({
  inflowsMinor,
  outflowsMinor,
  currentDayOfMonth = new Date().getDate(),
  currency = '₹',
}) => {
  const netMinor = inflowsMinor - outflowsMinor;
  const isPositive = netMinor >= 0n;

  // Exact BigInt-safe savings rate in basis points: ((in - out) * 10000) / in
  const savingsRateBps = inflowsMinor > 0n
    ? Number(((netMinor) * 10000n) / inflowsMinor) / 100
    : 0;

  // Zero-float daily burn rate: outflows / days
  const dailyBurnMinor = currentDayOfMonth > 0
    ? outflowsMinor / BigInt(currentDayOfMonth)
    : 0n;

  return (
    <Card variant="surface" className="p-6 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1: Net Cash Flow Trajectory */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#38424C]/80">
            <TrendingUp className="h-4 w-4 text-[#7AAA4A]" />
            <span>Monthly Net Trajectory</span>
          </div>
          <div className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${isPositive ? 'text-[#7AAA4A]' : 'text-[#E06A55]'}`}>
            {isPositive ? '+' : ''}{currency}{formatMinorToDecimal(netMinor)}
          </div>
          <p className="text-xs text-[#90A999]">
            Inflows {currency}{formatMinorToDecimal(inflowsMinor)} · Outflows {currency}{formatMinorToDecimal(outflowsMinor)}
          </p>
        </div>

        {/* Metric 2: Savings Rate */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38424C]">Savings Rate</span>
            <Percent className="h-4 w-4 text-[#7AAA4A]" />
          </div>
          <div className="text-2xl font-bold text-[#7AAA4A] mt-2">
            {savingsRateBps.toFixed(1)}%
          </div>
          <p className="text-[11px] text-[#90A999]">Proportion of income preserved</p>
        </div>

        {/* Metric 3: Daily Burn Rate */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38424C]">Daily Burn Rate</span>
            <Flame className="h-4 w-4 text-[#E06A55]" />
          </div>
          <div className="text-2xl font-bold text-[#38424C] mt-2">
            {currency}{formatMinorToDecimal(dailyBurnMinor)}
            <span className="text-xs font-normal text-[#90A999]"> / day</span>
          </div>
          <p className="text-[11px] text-[#90A999]">Across {currentDayOfMonth} days elapsed</p>
        </div>
      </div>
    </Card>
  );
};
```

---

### 4.5 View 3: Multi-Split Transaction Entry Blueprint (`/transactions`)

#### Wireframe & Visual Composition:
```
+----------------------------------------------------------------------------+
| GROUP 1: TRANSACTION HEADER METADATA & LIVE BALANCE BADGE                  |
| Date: [ 2026-11-09 ]    Description: [ Dinner & Grocery Split            ] |
| Notes: [ Split with Bob and Alice ]    Live Badge: [ Balanced / Diff: ₹X ] |
+----------------------------------------------------------------------------+
| GROUP 2: MULTI-SPLIT JOURNAL ENTRIES FORM TABLE (DYNAMIC ROWS)             |
| Leg 1: [ General Expenses   v ]  [ DEBIT  v ]  [ ₹1,500.00 ]  [ (X) ]     |
| Leg 2: [ Bob Receivables    v ]  [ DEBIT  v ]  [ ₹1,000.00 ]  [ (X) ]     |
| Leg 3: [ Primary Bank Acc   v ]  [ CREDIT v ]  [ ₹2,500.00 ]  [ (X) ]     |
| [+ Add Leg]  [Auto-Balance Difference]          [ Submit Transaction (POST) ]|
+----------------------------------------------------------------------------+
| GROUP 3: RECENT POSTED TRANSACTIONS AUDIT                                  |
| 2026-11-08  Office Supplies      2 Legs Balanced               ₹1,500.00   |
| 2026-11-07  Grocery Supermarket  3 Legs Balanced               ₹4,250.00   |
+----------------------------------------------------------------------------+
```

#### Real-time Live BalanceBadge Sub-50ms Implementation Blueprint:
```tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, Button, BalanceBadge, AmountInput, parseDecimalToMinor, formatMinorToDecimal } from '@finvault/ui';
import { Plus, Trash2, Wand2, CheckCircle2 } from 'lucide-react';
import type { Account, CreateJournalEntryDTO } from '@finvault/db-types';

interface SplitLeg {
  id: string; // client temporary key
  account_id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount_minor: bigint;
}

interface MultiSplitFormProps {
  accounts: Account[];
  onSubmitTransaction: (tx: {
    transaction_date: string;
    description: string;
    notes?: string;
    entries: CreateJournalEntryDTO[];
  }) => Promise<void>;
}

export const MultiSplitTransactionForm: React.FC<MultiSplitFormProps> = ({
  accounts,
  onSubmitTransaction,
}) => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial balanced 2-leg split template
  const [legs, setLegs] = useState<SplitLeg[]>([
    { id: '1', account_id: accounts[0]?.id || '', direction: 'DEBIT', amount_minor: 0n },
    { id: '2', account_id: accounts[1]?.id || '', direction: 'CREDIT', amount_minor: 0n },
  ]);

  // Real-time sub-50ms balance calculation on every keystroke
  const { totalDebits, totalCredits, difference } = useMemo(() => {
    let debits = 0n;
    let credits = 0n;
    for (const leg of legs) {
      if (leg.direction === 'DEBIT') debits += leg.amount_minor;
      else credits += leg.amount_minor;
    }
    return {
      totalDebits: debits,
      totalCredits: credits,
      difference: debits - credits,
    };
  }, [legs]);

  const isBalanced = difference === 0n && totalDebits > 0n;
  const canSubmit = isBalanced && description.trim().length > 0 && !isSubmitting;

  const handleUpdateLeg = useCallback((id: string, updates: Partial<SplitLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }, []);

  const handleAddLeg = () => {
    setLegs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        account_id: accounts[0]?.id || '',
        direction: difference > 0n ? 'CREDIT' : 'DEBIT',
        amount_minor: difference !== 0n ? (difference > 0n ? difference : -difference) : 0n,
      },
    ]);
  };

  const handleRemoveLeg = (id: string) => {
    if (legs.length <= 2) return;
    setLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleAutoBalance = () => {
    if (difference === 0n) return;
    if (difference > 0n) {
      // Debits exceed credits: append offsetting credit leg
      setLegs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          account_id: accounts.find((a) => a.type === 'ASSET')?.id || accounts[0]?.id || '',
          direction: 'CREDIT',
          amount_minor: difference,
        },
      ]);
    } else {
      // Credits exceed debits: append offsetting debit leg
      setLegs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          account_id: accounts.find((a) => a.type === 'EXPENSE')?.id || accounts[0]?.id || '',
          direction: 'DEBIT',
          amount_minor: -difference,
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmitTransaction({
        transaction_date: date,
        description: description.trim(),
        notes: notes.trim() || undefined,
        entries: legs.map((l) => ({
          account_id: l.account_id,
          direction: l.direction,
          amount_minor: l.amount_minor,
        })),
      });
      // Reset form
      setDescription('');
      setNotes('');
      setLegs([
        { id: '1', account_id: accounts[0]?.id || '', direction: 'DEBIT', amount_minor: 0n },
        { id: '2', account_id: accounts[1]?.id || '', direction: 'CREDIT', amount_minor: 0n },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Group 1: Transaction Header & Live Balance Badge */}
      <Card variant="surface" className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#C7E0BA] gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#38424C]">New Multi-Split Transaction</h2>
            <p className="text-xs text-[#90A999]">Strict Double-Entry Lite Invariant</p>
          </div>
          <BalanceBadge differenceMinor={difference} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Weekly Groceries split with Bob"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-2xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150"
            />
          </div>
        </div>
      </Card>

      {/* Group 2: Dynamic Multi-Split Legs Table */}
      <Card variant="surface" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">Split Legs</h3>
          <div className="text-xs text-[#90A999]">
            Debits: ₹{formatMinorToDecimal(totalDebits)} · Credits: ₹{formatMinorToDecimal(totalCredits)}
          </div>
        </div>

        <div className="space-y-3">
          {legs.map((leg, index) => (
            <div key={leg.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-[#040A0A]/5 p-3 rounded-2xl border border-[#C7E0BA]">
              <span className="text-xs font-mono text-[#90A999] w-6">#{index + 1}</span>

              {/* Account Dropdown */}
              <select
                value={leg.account_id}
                onChange={(e) => handleUpdateLeg(leg.id, { account_id: e.target.value })}
                className="flex-1 min-w-[180px] rounded-xl border border-[#C7E0BA] bg-[#DEEEDA] px-3 py-2 text-xs text-[#38424C] focus:outline-none focus:ring-2 focus:ring-[#7AAA4A] transition-all duration-150"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type} · {acc.currency})
                  </option>
                ))}
              </select>

              {/* Direction Toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[#C7E0BA]">
                <button
                  type="button"
                  onClick={() => handleUpdateLeg(leg.id, { direction: 'DEBIT' })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
                    leg.direction === 'DEBIT' ? 'bg-[#7AAA4A] text-white' : 'bg-[#DEEEDA] text-[#38424C]'
                  }`}
                >
                  DEBIT
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateLeg(leg.id, { direction: 'CREDIT' })}
                  className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
                    leg.direction === 'CREDIT' ? 'bg-[#38424C] text-white' : 'bg-[#DEEEDA] text-[#38424C]'
                  }`}
                >
                  CREDIT
                </button>
              </div>

              {/* AmountInput (strict minor units) */}
              <div className="w-32">
                <AmountInput
                  valueMinor={leg.amount_minor}
                  onChangeMinor={(val) => handleUpdateLeg(leg.id, { amount_minor: val })}
                  className="w-full text-right py-1.5 px-3 text-sm"
                />
              </div>

              {/* Remove Leg */}
              <button
                type="button"
                disabled={legs.length <= 2}
                onClick={() => handleRemoveLeg(leg.id)}
                className="p-2 text-[#90A999] hover:text-[#E06A55] disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-[#C7E0BA]">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleAddLeg} className="text-xs flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Leg</span>
            </Button>
            {difference !== 0n && (
              <Button variant="ghost" onClick={handleAutoBalance} className="text-xs flex items-center gap-1.5 text-[#7AAA4A]">
                <Wand2 className="h-3.5 w-3.5" />
                <span>Auto-Balance</span>
              </Button>
            )}
          </div>

          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? 'Posting...' : 'Post Transaction'}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};
```

---

### 4.6 View 4: IOU & Peer Debt Tracking Blueprint (`/ious`)

#### Wireframe & Visual Composition:
```
+----------------------------------------------------------------------------+
| GROUP 1: PEER DEBT SUMMARY & NET POSITION                                  |
| You Are Owed (LENT): ₹45,000.00         You Owe (BORROWED): ₹12,500.00     |
| Net Position: +₹32,500.00 (Receivable)  [+ Record New IOU]                 |
+----------------------------------------------------------------------------+
| GROUP 2: ACTIVE PEER DEBTS LIST (OPEN / PARTIAL)                           |
| Filter: [ All Active ]  [ You Lent ]  [ You Owe ]                          |
| Alice Chen     LENT       [======== 50% =======] Due May 20   ₹5,000  [Settle]|
| Charlie Dave   BORROWED   [============ 100% ==] Due Jun 01  ₹12,500  [Settle]|
+----------------------------------------------------------------------------+
| GROUP 3: SETTLED DEBT ARCHIVE                                              |
| David Warner   LENT       Settled on 2026-11-01              ₹2,000.00     |
| Emma Stone     BORROWED   Settled on 2026-10-28              ₹7,500.00     |
+----------------------------------------------------------------------------+
```

#### One-Click Settlement Modal (`SettlementModal.tsx`):
```tsx
'use client';

import React, { useState } from 'react';
import { Card, Button, AmountInput, formatMinorToDecimal } from '@finvault/ui';
import { ArrowDownLeft, ArrowUpRight, X, CheckCircle2 } from 'lucide-react';
import type { IOURecord, Account } from '@finvault/db-types';

interface SettlementModalProps {
  iou: IOURecord;
  accounts: Account[]; // User's Asset accounts (Cash / Bank)
  isOpen: boolean;
  onClose: () => void;
  onConfirmSettlement: (iouId: string, amountMinor: bigint, accountId: string, notes?: string) => Promise<void>;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  iou,
  accounts,
  isOpen,
  onClose,
  onConfirmSettlement,
}) => {
  const [amountMinor, setAmountMinor] = useState<bigint>(iou.remaining_balance_minor);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const isLent = iou.direction === 'LENT';
  const assetAccounts = accounts.filter((a) => a.type === 'ASSET');
  const isValidAmount = amountMinor > 0n && amountMinor <= iou.remaining_balance_minor;

  const handleConfirm = async () => {
    if (!isValidAmount || !selectedAccountId) return;
    setIsSubmitting(true);
    try {
      await onConfirmSettlement(iou.id, amountMinor, selectedAccountId, notes || undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040A0A]/80 backdrop-blur-sm transition-opacity duration-150">
      <Card variant="surface" className="max-w-lg w-full p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#38424C] hover:text-[#040A0A] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title & Direction Indicator */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-2xl ${isLent ? 'bg-[#7AAA4A]/20 text-[#7AAA4A]' : 'bg-[#E06A55]/20 text-[#E06A55]'}`}>
            {isLent ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#38424C]">
              {isLent ? 'Record Repayment' : 'Settle Debt'}
            </h3>
            <p className="text-xs text-[#90A999]">
              Counterparty: <span className="font-semibold text-[#38424C]">{iou.counterparty_name}</span>
            </p>
          </div>
        </div>

        {/* Contra Clearing Notice */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-3.5 mb-5 text-xs text-[#38424C] space-y-1">
          <span className="font-semibold text-[#7AAA4A]">Double-Entry Contra Clearing</span>
          <p className="text-[11px] text-[#90A999]">
            {isLent
              ? `Debits chosen asset account and credits contra clearing account (clearing receivable of ₹${formatMinorToDecimal(amountMinor)}).`
              : `Disburses funds from chosen asset account and debits contra clearing account (clearing debt payable of ₹${formatMinorToDecimal(amountMinor)}).`}
          </p>
        </div>

        {/* Settlement Account Picker */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">
              {isLent ? 'Deposit Inflow Account' : 'Disbursement Source Account'}
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full rounded-2xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2.5 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150"
            >
              {assetAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (Balance: ₹{formatMinorToDecimal(acc.balance_minor)})
                </option>
              ))}
            </select>
          </div>

          {/* Settlement Amount Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-[#38424C]">Settlement Amount</label>
              <button
                type="button"
                onClick={() => setAmountMinor(iou.remaining_balance_minor)}
                className="text-[11px] text-[#7AAA4A] hover:underline font-medium"
              >
                Full Balance (₹{formatMinorToDecimal(iou.remaining_balance_minor)})
              </button>
            </div>
            <AmountInput
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              className="w-full text-lg font-bold"
            />
            {amountMinor > iou.remaining_balance_minor && (
              <p className="text-xs text-rose-500 mt-1">Amount cannot exceed outstanding balance.</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#38424C] mb-1">Memo / Settlement Notes</label>
            <input
              type="text"
              placeholder="e.g. UPI repayment received"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-[#C7E0BA] bg-[#DEEEDA] px-3.5 py-2 text-sm text-[#38424C] focus:ring-2 focus:ring-[#7AAA4A] focus:outline-none transition-all duration-150"
            />
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#C7E0BA]">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!isValidAmount || !selectedAccountId || isSubmitting}
            className="flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? 'Posting...' : 'Confirm Settlement'}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};
```

---

## 5. Verification Method

To independently verify the views, layouts, and constraints:

### 5.1 Static Typecheck & Linting
Run the TypeScript compiler across the Next.js workspace:
```powershell
pnpm --filter @finvault/web typecheck
```
*Expected Result*: Zero TypeScript errors, 100% strict type safety matching `@finvault/db-types`.

### 5.2 Build Command Verification
Verify Next.js production compilation:
```powershell
pnpm --filter @finvault/web build
```
*Expected Result*: All routes (`/`, `/cash-flow`, `/transactions`, `/ious`, `/login`) compile successfully without SSR hydration mismatch or missing dependencies.

### 5.3 Anti-Clutter & Performance Checks
1. **Visual Group Verification**: Inspect every page component to verify at most 3 `<Card>` containers are rendered per screen.
2. **Sub-50ms BalanceBadge Test**: In `/transactions`, trigger rapid typing in the amount input; verify `difference` updates instantaneously via `useMemo` without layout shifts or frame drops.
3. **Double-Entry Invariant Test**: In `/transactions`, verify "Post Transaction" button remains disabled until `sum(debits) === sum(credits)` and `totalDebits > 0n`.
4. **Contra Clearing Verification**: Trigger settlement in `/ious`; verify balanced double-entry contra clearing payload matches the schema in migration `20261108000001_security_hardening_and_iou_settlement.sql`.
