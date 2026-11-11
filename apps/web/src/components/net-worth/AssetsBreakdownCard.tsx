'use client';

import React from 'react';
import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { Landmark } from 'lucide-react';
import type { SerializedAccount } from '../../lib/money/serialization';

interface AssetsBreakdownCardProps {
  accounts: SerializedAccount[];
  currency?: string;
}

export const AssetsBreakdownCard: React.FC<AssetsBreakdownCardProps> = ({
  accounts,
  currency = '₹',
}) => {
  const assetAccounts = accounts.filter((a) => a.type === 'ASSET');
  const totalAssetsMinor = assetAccounts.reduce((sum, a) => sum + BigInt(a.balance_minor), 0n);

  return (
    <Card variant="surface" className="p-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#C7E0BA]">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[#7AAA4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Asset Allocation
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#7AAA4A]">
          {currency}{formatMinorToDecimal(totalAssetsMinor)}
        </span>
      </div>

      <div className="mt-3">
        <List>
          {assetAccounts.map((acc) => (
            <ListItem
              key={acc.id}
              className="text-[#38424C] hover:bg-[#040A0A]/5"
              primary={<span className="text-[#38424C] font-semibold">{acc.name}</span>}
              secondary={<span className="text-[11px] text-[#90A999]">{acc.currency} · Liquid Store</span>}
              metric={
                <span className="text-sm font-bold text-[#38424C]">
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
