import { createClient } from '../supabase/server';
import type { SerializedAccount, SerializedNetWorthSummary } from '../money/serialization';

const DEFAULT_ACCOUNTS: SerializedAccount[] = [
  {
    id: 'acc-asset-1',
    user_id: 'default-user',
    name: 'Cash Wallet',
    type: 'ASSET',
    currency: 'INR',
    balance_minor: '2500000', // ₹25,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-asset-2',
    user_id: 'default-user',
    name: 'Primary Bank Account',
    type: 'ASSET',
    currency: 'INR',
    balance_minor: '35000000', // ₹3,50,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-asset-3',
    user_id: 'default-user',
    name: 'Mutual Funds & Equity',
    type: 'ASSET',
    currency: 'INR',
    balance_minor: '87500000', // ₹8,75,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-liab-1',
    user_id: 'default-user',
    name: 'Credit Card (HDFC)',
    type: 'LIABILITY',
    currency: 'INR',
    balance_minor: '4200000', // ₹42,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-liab-2',
    user_id: 'default-user',
    name: 'Personal Loan',
    type: 'LIABILITY',
    currency: 'INR',
    balance_minor: '25000000', // ₹2,50,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-liab-3',
    user_id: 'default-user',
    name: 'Bob Dining Split (IOU)',
    type: 'LIABILITY',
    currency: 'INR',
    balance_minor: '500000', // ₹5,000.00
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-exp-1',
    user_id: 'default-user',
    name: 'General Living Expenses',
    type: 'EXPENSE',
    currency: 'INR',
    balance_minor: '1840000',
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
  {
    id: 'acc-inc-1',
    user_id: 'default-user',
    name: 'Primary Salary Income',
    type: 'INCOME',
    currency: 'INR',
    balance_minor: '12000000',
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1',
  },
];

export async function fetchAccounts(): Promise<SerializedAccount[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_archived', false)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error || !data) {
      return DEFAULT_ACCOUNTS;
    }

    const rows = data as any[];
    if (rows.length === 0) {
      return DEFAULT_ACCOUNTS;
    }

    return rows.map((row: any) => ({
      ...row,
      balance_minor: row.balance_minor.toString(),
      version: row.version.toString(),
    }));
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

export async function fetchNetWorthSummary(): Promise<SerializedNetWorthSummary> {
  const accounts = await fetchAccounts();

  let totalAssets = 0n;
  let totalLiabilities = 0n;
  let safeToSpend = 0n;

  for (const acc of accounts) {
    const bal = BigInt(acc.balance_minor);
    if (acc.type === 'ASSET') {
      totalAssets += bal;
      const lower = acc.name.toLowerCase();
      if (lower.includes('cash') || lower.includes('bank') || lower.includes('checking') || lower.includes('wallet')) {
        safeToSpend += bal;
      }
    } else if (acc.type === 'LIABILITY') {
      totalLiabilities += bal;
    }
  }

  // Deduct short-term liabilities from safe to spend
  const shortTermDebt = accounts
    .filter((a) => a.type === 'LIABILITY' && (a.name.toLowerCase().includes('credit') || a.name.toLowerCase().includes('iou')))
    .reduce((sum, a) => sum + BigInt(a.balance_minor), 0n);

  const netSafeToSpend = safeToSpend > shortTermDebt ? safeToSpend - shortTermDebt : 0n;
  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssetsMinor: totalAssets.toString(),
    totalLiabilitiesMinor: totalLiabilities.toString(),
    netWorthMinor: netWorth.toString(),
    safeToSpendMinor: netSafeToSpend.toString(),
    currency: '₹',
  };
}
