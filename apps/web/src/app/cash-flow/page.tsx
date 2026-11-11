import React from 'react';
import { CashFlowSummaryCard } from '../../components/cash-flow/CashFlowSummaryCard';
import { InflowStreamsCard, type InflowItem } from '../../components/cash-flow/InflowStreamsCard';
import { OutflowStreamsCard, type OutflowItem } from '../../components/cash-flow/OutflowStreamsCard';

export const revalidate = 0;

export default async function CashFlowPage() {
  const inflows: InflowItem[] = [
    { id: 'in-1', name: 'Primary Engineering Salary', category: 'Salary / W2', amountMinor: '12000000' }, // ₹1,20,000.00
    { id: 'in-2', name: 'Systems Architecture Consulting', category: 'Freelance', amountMinor: '2200000' }, // ₹22,000.00
    { id: 'in-3', name: 'Index Mutual Fund Dividends', category: 'Investments', amountMinor: '650000' }, // ₹6,500.00
  ];

  const outflows: OutflowItem[] = [
    { id: 'out-1', name: 'Apartment Lease & Maintenance', category: 'Housing', amountMinor: '3500000' }, // ₹35,000.00
    { id: 'out-2', name: 'Organic Groceries & Whole Foods', category: 'Food', amountMinor: '1840000' }, // ₹18,400.00
    { id: 'out-3', name: 'High-speed Fiber & Utilities', category: 'Utilities', amountMinor: '450000' }, // ₹4,500.00
    { id: 'out-4', name: 'Public Transit & Fuel', category: 'Transport', amountMinor: '520000' }, // ₹5,200.00
    { id: 'out-5', name: 'Cloud Infrastructure & SaaS', category: 'Discretionary', amountMinor: '380000' }, // ₹3,800.00
  ];

  const totalInflowsMinor = inflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();
  const totalOutflowsMinor = outflows.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();

  return (
    <div className="space-y-6">
      {/* Group 1: Monthly Cash Flow & Burn Rate Hero Card */}
      <CashFlowSummaryCard
        inflowsMinor={totalInflowsMinor}
        outflowsMinor={totalOutflowsMinor}
        currency="₹"
      />

      {/* Visual Component Groups 2 & 3: Inflows & Outflows Streams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Group 2: Inflows Stream Card */}
        <InflowStreamsCard inflows={inflows} currency="₹" />

        {/* Group 3: Outflows Stream Card */}
        <OutflowStreamsCard outflows={outflows} currency="₹" />
      </div>
    </div>
  );
}
