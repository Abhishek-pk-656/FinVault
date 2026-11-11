'use client';

import React from 'react';
import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { ArrowDownLeft } from 'lucide-react';
import type { SerializedInflowItem } from '../../lib/money/serialization';

export type InflowItem = SerializedInflowItem;

export interface InflowStreamsCardProps {
  inflows: InflowItem[];
  currency?: string;
}

export const InflowStreamsCard: React.FC<InflowStreamsCardProps> = ({
  inflows,
  currency = '₹',
}) => {
  const totalInflows = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor || '0'), 0n);

  return (
    <Card variant="surface" className="p-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#C7E0BA]">
        <div className="flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 text-[#7AAA4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Inflow Streams
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#7AAA4A]">
          {currency}{formatMinorToDecimal(totalInflows)}
        </span>
      </div>

      <div className="mt-3">
        <List>
          {inflows.map((item) => (
            <ListItem
              key={item.id}
              className="text-[#38424C] hover:bg-[#040A0A]/5"
              primary={<span className="text-[#38424C] font-semibold">{item.name}</span>}
              secondary={<span className="text-[11px] text-[#90A999]">{item.category}</span>}
              metric={
                <span className="text-sm font-bold text-[#7AAA4A]">
                  +{currency}{formatMinorToDecimal(BigInt(item.amountMinor || '0'))}
                </span>
              }
            />
          ))}
        </List>
      </div>
    </Card>
  );
};
