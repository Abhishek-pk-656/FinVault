'use client';

import React from 'react';
import { Card, formatMinorToDecimal } from '@finvault/ui';
import { TrendingUp, Flame, Percent } from 'lucide-react';

export interface CashFlowSummaryCardProps {
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
  const inflowsBn = BigInt(inflowsMinor || '0');
  const outflowsBn = BigInt(outflowsMinor || '0');
  const netMinor = inflowsBn - outflowsBn;
  const isPositive = netMinor >= 0n;

  // Exact BigInt-safe savings rate in basis points: ((in - out) * 10000) / in
  const savingsRatePct = inflowsBn > 0n
    ? Number(((netMinor) * 10000n) / inflowsBn) / 100
    : 0;

  // Zero-float daily burn rate: outflows / days
  const dailyBurnMinor = currentDayOfMonth > 0
    ? outflowsBn / BigInt(currentDayOfMonth)
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
          <div
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
              isPositive ? 'text-[#7AAA4A]' : 'text-[#E06A55]'
            }`}
          >
            {isPositive ? '+' : ''}{currency}{formatMinorToDecimal(netMinor)}
          </div>
          <p className="text-xs text-[#90A999]">
            Inflows {currency}{formatMinorToDecimal(inflowsBn)} · Outflows {currency}{formatMinorToDecimal(outflowsBn)}
          </p>
        </div>

        {/* Metric 2: Savings Rate */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38424C]">Savings Rate</span>
            <Percent className="h-4 w-4 text-[#7AAA4A]" />
          </div>
          <div className="text-2xl font-bold text-[#7AAA4A] mt-2">
            {savingsRatePct.toFixed(1)}%
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
