'use client';

import React, { useState } from 'react';
import { Card, Button, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { HandCoins } from 'lucide-react';
import type { SerializedIOURecord } from '../../lib/money/serialization';

interface ActiveIOUsListCardProps {
  ious: SerializedIOURecord[];
  onOpenSettleModal: (iou: SerializedIOURecord) => void;
  currency?: string;
}

export const ActiveIOUsListCard: React.FC<ActiveIOUsListCardProps> = ({
  ious,
  onOpenSettleModal,
  currency = '₹',
}) => {
  const [filter, setFilter] = useState<'ALL' | 'LENT' | 'BORROWED'>('ALL');

  const activeIous = ious
    .filter((i) => i.status !== 'SETTLED' && !i.is_deleted)
    .filter((i) => {
      if (filter === 'LENT') return i.direction === 'LENT';
      if (filter === 'BORROWED') return i.direction === 'BORROWED';
      return true;
    });

  return (
    <Card variant="surface" className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#C7E0BA] gap-3">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-[#7AAA4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Active Peer Debts
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex rounded-xl overflow-hidden border border-[#C7E0BA] self-start sm:self-auto">
          {(['ALL', 'LENT', 'BORROWED'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-out ${
                filter === mode
                  ? 'bg-[#7AAA4A] text-white'
                  : 'bg-[#DEEEDA] text-[#38424C] hover:bg-[#C7E0BA]/40'
              }`}
            >
              {mode === 'ALL' ? 'All Active' : mode === 'LENT' ? 'You Lent' : 'You Owe'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeIous.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#90A999]">
            No outstanding peer debts found for this filter.
          </div>
        ) : (
          <List>
            {activeIous.map((iou) => {
              const principal = BigInt(iou.principal_minor);
              const remaining = BigInt(iou.remaining_balance_minor);
              const percentRemaining = principal > 0n
                ? Number((remaining * 100n) / principal)
                : 0;
              const isLent = iou.direction === 'LENT';

              return (
                <ListItem
                  key={iou.id}
                  className="text-[#38424C] hover:bg-[#040A0A]/5 py-3.5"
                  primary={
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#38424C]">{iou.counterparty_name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isLent
                            ? 'bg-[#7AAA4A]/15 text-[#7AAA4A] border border-[#7AAA4A]/30'
                            : 'bg-[#E06A55]/15 text-[#E06A55] border border-[#E06A55]/30'
                        }`}
                      >
                        {isLent ? 'LENT' : 'BORROWED'}
                      </span>
                    </div>
                  }
                  secondary={
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-24 h-1.5 bg-[#C7E0BA] rounded-full overflow-hidden flex">
                        <div
                          className={`h-full ${isLent ? 'bg-[#7AAA4A]' : 'bg-[#E06A55]'}`}
                          style={{ width: `${percentRemaining}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#90A999]">
                        {iou.due_date ? `Due ${iou.due_date}` : 'No due date'} ({percentRemaining}% rem)
                      </span>
                    </div>
                  }
                  metric={
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-[#38424C]">
                        {currency}{formatMinorToDecimal(remaining)}
                      </span>
                      <span className="text-[10px] text-[#90A999]">
                        of {currency}{formatMinorToDecimal(principal)}
                      </span>
                    </div>
                  }
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenSettleModal(iou)}
                      className="text-xs px-3 py-1 font-semibold"
                    >
                      Settle
                    </Button>
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
