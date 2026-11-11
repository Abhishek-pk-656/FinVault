import React from 'react';
import { fetchAccounts } from '../../lib/services/accounts';
import { fetchRecentTransactions } from '../../lib/services/transactions';
import { MultiSplitForm } from '../../components/transactions/MultiSplitForm';
import { RecentTransactionsCard } from '../../components/transactions/RecentTransactionsCard';

export const revalidate = 0;

export default async function TransactionsPage() {
  const [accounts, transactions] = await Promise.all([
    fetchAccounts(),
    fetchRecentTransactions(10),
  ]);

  return (
    <div className="space-y-6">
      {/* Group 1 & Group 2: Header Card + Dynamic Splits Legs Card */}
      <MultiSplitForm accounts={accounts} />

      {/* Group 3: Recent Posted Transactions Audit Card */}
      <RecentTransactionsCard transactions={transactions} currency="₹" />
    </div>
  );
}
