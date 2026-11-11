'use client';

import React from 'react';
import { Card, formatMinorToDecimal } from '@finvault/ui';
import { Users, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { SerializedIOURecord } from '../../lib/money/serialization';

interface IOUSummaryCardProps {
  ious: SerializedIOURecord[];
  currency?: string;
}

export const IOUSummaryCard: React.FC<IOUSummaryCardProps> = ({
  ious,
  currency = '₹',
}) => {
  const activeIous = ious.filter((i) => i.status !== 'SETTLED' && !i.is_deleted);

  let totalLentMinor = 0n;
  let totalBorrowedMinor = 0n;

  for (const iou of activeIous) {
    const rem = BigInt(iou.remaining_balance_minor);
    if (iou.direction === 'LENT') {
      totalLentMinor += rem;
    } else {
      totalBorrowedMinor += rem;
    }
  }

  const netPeerPosition = totalLentMinor - totalBorrowedMinor;
  const isNetPositive = netPeerPosition >= 0n;

  return (
    <Card variant="surface" className="p-6 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1: Net Peer Position */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#38424C]/80">
            <Users className="h-4 w-4 text-[#7AAA4A]" />
            <span>Net Peer Position</span>
          </div>
          <div
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
              isNetPositive ? 'text-[#7AAA4A]' : 'text-[#E06A55]'
            }`}
          >
            {isNetPositive ? '+' : ''}{currency}{formatMinorToDecimal(netPeerPosition)}
          </div>
          <p className="text-xs text-[#90A999]">
            {isNetPositive ? 'Net Receivable from Peers' : 'Net Payable to Counterparties'}
          </p>
        </div>

        {/* Metric 2: You Are Owed (LENT) */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38424C]">You Are Owed (Lent)</span>
            <ArrowDownLeft className="h-4 w-4 text-[#7AAA4A]" />
          </div>
          <div className="text-2xl font-bold text-[#7AAA4A] mt-2">
            {currency}{formatMinorToDecimal(totalLentMinor)}
          </div>
          <p className="text-[11px] text-[#90A999]">Active counterparty debts to you</p>
        </div>

        {/* Metric 3: You Owe (BORROWED) */}
        <div className="bg-[#040A0A]/5 border border-[#C7E0BA] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38424C]">You Owe (Borrowed)</span>
            <ArrowUpRight className="h-4 w-4 text-[#E06A55]" />
          </div>
          <div className="text-2xl font-bold text-[#E06A55] mt-2">
            {currency}{formatMinorToDecimal(totalBorrowedMinor)}
          </div>
          <p className="text-[11px] text-[#90A999]">Outstanding debts to settle</p>
        </div>
      </div>
    </Card>
  );
};
