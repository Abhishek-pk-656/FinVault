import { createClient } from '../supabase/server';
import type { SerializedIOURecord } from '../money/serialization';

const DEFAULT_IOUS: SerializedIOURecord[] = [
  {
    id: 'iou-1',
    user_id: 'default-user',
    counterparty_name: 'Alice Chen',
    counterparty_contact: '+91 98765 43210',
    direction: 'LENT',
    principal_minor: '1000000', // ₹10,000.00
    remaining_balance_minor: '500000', // ₹5,000.00 (50% remaining)
    currency: 'INR',
    status: 'PARTIAL',
    due_date: '2026-11-20',
    notes: 'Dinner split at Bistro Botanica',
    is_deleted: false,
    created_at: new Date(Date.now() - 432000000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    version: '2',
  },
  {
    id: 'iou-2',
    user_id: 'default-user',
    counterparty_name: 'Charlie Dave',
    counterparty_contact: 'charlie@finvault.local',
    direction: 'BORROWED',
    principal_minor: '1250000', // ₹12,500.00
    remaining_balance_minor: '1250000', // ₹12,500.00 (100% remaining)
    currency: 'INR',
    status: 'OPEN',
    due_date: '2026-11-25',
    notes: 'Concert tickets upfront payment',
    is_deleted: false,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    updated_at: new Date(Date.now() - 259200000).toISOString(),
    version: '1',
  },
  {
    id: 'iou-3',
    user_id: 'default-user',
    counterparty_name: 'David Warner',
    counterparty_contact: 'david@finvault.local',
    direction: 'LENT',
    principal_minor: '4000000', // ₹40,000.00
    remaining_balance_minor: '4000000',
    currency: 'INR',
    status: 'OPEN',
    due_date: '2026-12-01',
    notes: 'Equipment lease deposit',
    is_deleted: false,
    created_at: new Date(Date.now() - 129600000).toISOString(),
    updated_at: new Date(Date.now() - 129600000).toISOString(),
    version: '1',
  },
  {
    id: 'iou-4',
    user_id: 'default-user',
    counterparty_name: 'Emma Watson',
    counterparty_contact: 'emma@finvault.local',
    direction: 'LENT',
    principal_minor: '200000', // ₹2,000.00
    remaining_balance_minor: '0',
    currency: 'INR',
    status: 'SETTLED',
    due_date: '2026-11-01',
    notes: 'Taxi ride split to airport',
    is_deleted: false,
    created_at: new Date(Date.now() - 604800000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    version: '2',
  },
];

export async function fetchIOUs(): Promise<SerializedIOURecord[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('iou_records')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return DEFAULT_IOUS;
    }

    const rows = data as any[];
    if (rows.length === 0) {
      return DEFAULT_IOUS;
    }

    return rows.map((row: any) => ({
      ...row,
      principal_minor: row.principal_minor.toString(),
      remaining_balance_minor: row.remaining_balance_minor.toString(),
      version: row.version.toString(),
    }));
  } catch {
    return DEFAULT_IOUS;
  }
}
