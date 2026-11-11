'use client';

import React from 'react';
import { Card, formatMinorToDecimal } from '@finvault/ui';
import { ShieldCheck, Sparkles } from 'lucide-react';

export interface NetWorthHeroCardProps {
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
  const netWorthBn = BigInt(netWorthMinor || '0');
  const safeToSpendBn = BigInt(safeToSpendMinor || '0');
  const totalAssetsBn = BigInt(totalAssetsMinor || '0');
  const totalLiabilitiesBn = BigInt(totalLiabilitiesMinor || '0');

  const totalCombined = totalAssetsBn + totalLiabilitiesBn;
  const assetRatio = totalCombined > 0n
    ? Number((totalAssetsBn * 100n) / totalCombined)
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
            {currency}{formatMinorToDecimal(netWorthBn)}
          </div>
          <p className="text-xs text-[#90A999]">
            Assets {currency}{formatMinorToDecimal(totalAssetsBn)} · Liabilities {currency}{formatMinorToDecimal(totalLiabilitiesBn)}
          </p>
        </div>

        {/* Metric 2: Safe-to-Spend Liquidity */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 min-w-[240px]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7AAA4A]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Safe-to-Spend (Unencumbered)</span>
          </div>
          <div className="text-2xl font-bold text-[#38424C] mt-1">
            {currency}{formatMinorToDecimal(safeToSpendBn)}
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
            className="h-full bg-[#7AAA4A] transition-all duration-150 ease-out"
            style={{ width: `${assetRatio}%` }}
          />
          <div
            className="h-full bg-[#E06A55] transition-all duration-150 ease-out"
            style={{ width: `${100 - assetRatio}%` }}
          />
        </div>
      </div>
    </Card>
  );
};
