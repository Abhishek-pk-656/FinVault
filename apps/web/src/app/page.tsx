import React from 'react';
import { fetchAccounts, fetchNetWorthSummary } from '../lib/services/accounts';
import { NetWorthHeroCard } from '../components/net-worth/NetWorthHeroCard';
import { AssetsBreakdownCard } from '../components/net-worth/AssetsBreakdownCard';
import { LiabilitiesBreakdownCard } from '../components/net-worth/LiabilitiesBreakdownCard';

export const revalidate = 0; // Dynamic on every request

export default async function NetWorthCockpitPage() {
  const [accounts, summary] = await Promise.all([
    fetchAccounts(),
    fetchNetWorthSummary(),
  ]);

  return (
    <div className="space-y-6">
      {/* Group 1: Hero Net Worth & Liquidity Card */}
      <NetWorthHeroCard
        netWorthMinor={summary.netWorthMinor}
        safeToSpendMinor={summary.safeToSpendMinor}
        totalAssetsMinor={summary.totalAssetsMinor}
        totalLiabilitiesMinor={summary.totalLiabilitiesMinor}
        currency={summary.currency}
      />

      {/* Visual Component Groups 2 & 3: Assets & Liabilities Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Group 2: Assets Breakdown */}
        <AssetsBreakdownCard accounts={accounts} currency={summary.currency} />

        {/* Group 3: Liabilities Breakdown */}
        <LiabilitiesBreakdownCard accounts={accounts} currency={summary.currency} />
      </div>
    </div>
  );
}
