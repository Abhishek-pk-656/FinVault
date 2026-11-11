'use client';

import React from 'react';
import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { CreditCard } from 'lucide-react';
import type { SerializedAccount } from '../../lib/money/serialization';

interface LiabilitiesBreakdownCardProps {
  accounts: SerializedAccount[];
  currency?: string;
}

export const LiabilitiesBreakdownCard: React.FC<LiabilitiesBreakdownCardProps> = ({
  accounts,
  currency = '₹',
}) => {
  const liabAccounts = accounts.filter((a) => a.type === 'LIABILITY');
  const totalLiabMinor = liabAccounts.reduce((sum, a) => sum + BigInt(a.balance_minor), 0n);

  return (
    <Card variant="surface" className="p-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#C7E0BA]">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[#E06A55]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Liabilities & Debt
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#E06A55]">
          {currency}{formatMinorToDecimal(totalLiabMinor)}
        </span>
      </div>

      <div className="mt-3">
        <List>
          {liabAccounts.map((acc) => (
            <ListItem
              key={acc.id}
              className="text-[#38424C] hover:bg-[#040A0A]/5"
              primary={<span className="text-[#38424C] font-semibold">{acc.name}</span>}
              secondary={<span className="text-[11px] text-[#90A999]">{acc.currency} · Payable</span>}
              metric={
                <span className="text-sm font-bold text-[#E06A55]">
                  {currency}{formatMinorToDecimal(BigInt(acc.balance_minor))}
                </span>
              }
            />
          ))}
        </List>
      </div>
    </Card>
  );
};
