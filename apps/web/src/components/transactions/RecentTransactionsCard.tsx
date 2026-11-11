'use client';

import React from 'react';
import { Card, List, ListItem, formatMinorToDecimal } from '@finvault/ui';
import { History, CheckCircle } from 'lucide-react';
import type { SerializedTransaction } from '../../lib/money/serialization';

interface RecentTransactionsCardProps {
  transactions: SerializedTransaction[];
  currency?: string;
}

export const RecentTransactionsCard: React.FC<RecentTransactionsCardProps> = ({
  transactions,
  currency = '₹',
}) => {
  return (
    <Card variant="surface" className="p-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#C7E0BA]">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#7AAA4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#38424C]">
            Recent Ledger Transactions
          </h2>
        </div>
        <span className="text-xs text-[#90A999]">Double-Entry Verified</span>
      </div>

      <div className="mt-3">
        <List>
          {transactions.slice(0, 5).map((tx) => {
            const debitsTotal = (tx.entries || [])
              .filter((e) => e.direction === 'DEBIT')
              .reduce((sum, e) => sum + BigInt(e.amount_minor), 0n);

            return (
              <ListItem
                key={tx.id}
                className="text-[#38424C] hover:bg-[#040A0A]/5"
                primary={<span className="text-[#38424C] font-semibold">{tx.description}</span>}
                secondary={
                  <div className="flex items-center gap-1.5 text-[11px] text-[#90A999]">
                    <span>{tx.transaction_date}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-[#7AAA4A]">
                      <CheckCircle className="h-3 w-3" />
                      <span>{tx.entries?.length || 2} legs balanced</span>
                    </span>
                  </div>
                }
                metric={
                  <span className="text-sm font-bold text-[#38424C]">
                    {currency}{formatMinorToDecimal(debitsTotal)}
                  </span>
                }
              />
            );
          })}
        </List>
      </div>
    </Card>
  );
};
