import React from 'react';
import { redirect } from 'next/navigation';
import { isAuthenticatedSession } from '../../lib/supabase/server';
import { fetchAccounts } from '../../lib/services/accounts';
import { fetchRecentTransactions } from '../../lib/services/transactions';
import { MultiSplitForm } from '../../components/transactions/MultiSplitForm';
import { RecentTransactionsCard } from '../../components/transactions/RecentTransactionsCard';

export const revalidate = 0;

export default async function TransactionsPage() {
  const isAuthed = await isAuthenticatedSession();
  if (!isAuthed) {
    redirect('/login');
  }

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
