'use client';

import React from 'react';
import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { CheckCheck } from 'lucide-react';
import type { SerializedIOURecord } from '../../lib/money/serialization';

interface SettledIOUsCardProps {
  ious: SerializedIOURecord[];
  currency?: string;
}

export const SettledIOUsCard: React.FC<SettledIOUsCardProps> = ({
  ious,
  currency = '₹',
}) => {
  const settledIous = ious.filter((i) => i.status === 'SETTLED' && !i.is_deleted);

  return (
    <Card variant="surface" className="p-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#C7E0BA]">
        <div className="flex items-center gap-2">
          <CheckCheck className="h-4 w-4 text-[#7AAA4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Settled Debt Archive
          </h2>
        </div>
        <span className="text-xs text-[#7AAA4A] font-semibold">
          {settledIous.length} Completed
        </span>
      </div>

      <div className="mt-3">
        {settledIous.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#90A999]">
            No settled debts in archive.
          </div>
        ) : (
          <List>
            {settledIous.map((iou) => {
              const isLent = iou.direction === 'LENT';
              const principal = BigInt(iou.principal_minor);

              return (
                <ListItem
                  key={iou.id}
                  className="text-[#38424C] hover:bg-[#040A0A]/5"
                  primary={
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#38424C]">{iou.counterparty_name}</span>
                      <span className="text-[10px] font-semibold text-[#90A999]">
                        ({isLent ? 'Lent' : 'Borrowed'})
                      </span>
                    </div>
                  }
                  secondary={
                    <span className="text-[11px] text-[#7AAA4A]">
                      Fully settled via contra clearing
                    </span>
                  }
                  metric={
                    <span className="text-sm font-semibold text-[#38424C] line-through opacity-70">
                      {currency}{formatMinorToDecimal(principal)}
                    </span>
                  }
                />
              );
            })}
          </List>
        )}
      </div>
    </Card>
  );
};
