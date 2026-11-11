import React from 'react';
import { fetchIOUs } from '../../lib/services/ious';
import { fetchAccounts } from '../../lib/services/accounts';
import { IOUSummaryCard } from '../../components/ious/IOUSummaryCard';
import { IOUClientManager } from '../../components/ious/IOUClientManager';

export const revalidate = 0;

export default async function IOUsPage() {
  const [ious, accounts] = await Promise.all([
    fetchIOUs(),
    fetchAccounts(),
  ]);

  return (
    <div className="space-y-6">
      {/* Group 1: Peer Debt Summary & Net Position Hero Card */}
      <IOUSummaryCard ious={ious} currency="₹" />

      {/* Visual Component Groups 2 & 3: Active Debts & Settled Archive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <IOUClientManager ious={ious} accounts={accounts} />
      </div>
    </div>
  );
}
