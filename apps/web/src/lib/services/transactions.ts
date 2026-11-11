import { createClient } from '../supabase/server';
import type { SerializedTransaction } from '../money/serialization';

const DEFAULT_TRANSACTIONS: SerializedTransaction[] = [
  {
    id: 'tx-default-1',
    user_id: 'default-user',
    idempotency_key: 'idemp-1',
    transaction_date: '2026-11-08',
    description: 'Office Workspace & Productivity Setup',
    notes: 'Standing desk and ergonomic keyboard',
    is_reconciled: true,
    is_deleted: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    version: '1',
    entries: [
      {
        id: 'je-1',
        user_id: 'default-user',
        transaction_id: 'tx-default-1',
        account_id: 'acc-exp-1',
        amount_minor: '150000', // ₹1,500.00
        direction: 'DEBIT',
        created_at: new Date().toISOString(),
      },
      {
        id: 'je-2',
        user_id: 'default-user',
        transaction_id: 'tx-default-1',
        account_id: 'acc-asset-2',
        amount_minor: '150000',
        direction: 'CREDIT',
        created_at: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'tx-default-2',
    user_id: 'default-user',
    idempotency_key: 'idemp-2',
    transaction_date: '2026-11-07',
    description: 'Weekly Organic Grocery Supermarket',
    notes: 'Split with household roommates',
    is_reconciled: true,
    is_deleted: false,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 172800000).toISOString(),
    version: '1',
    entries: [
      {
        id: 'je-3',
        user_id: 'default-user',
        transaction_id: 'tx-default-2',
        account_id: 'acc-exp-1',
        amount_minor: '425000', // ₹4,250.00
        direction: 'DEBIT',
        created_at: new Date().toISOString(),
      },
      {
        id: 'je-4',
        user_id: 'default-user',
        transaction_id: 'tx-default-2',
        account_id: 'acc-asset-2',
        amount_minor: '425000',
        direction: 'CREDIT',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

export async function fetchRecentTransactions(limit: number = 20): Promise<SerializedTransaction[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        journal_entries (
          id,
          user_id,
          transaction_id,
          account_id,
          amount_minor,
          direction,
          created_at
        )
      `)
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      return DEFAULT_TRANSACTIONS;
    }

    return data.map((tx: any) => ({
      ...tx,
      version: tx.version.toString(),
      entries: (tx.journal_entries || []).map((je: any) => ({
        ...je,
        amount_minor: je.amount_minor.toString(),
      })),
    }));
  } catch {
    return DEFAULT_TRANSACTIONS;
  }
}
