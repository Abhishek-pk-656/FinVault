import type {
  Account,
  Transaction,
  JournalEntry,
  IOURecord,
  AccountType,
  JournalDirection,
  IOUDirection,
  IOUStatus,
} from '@finvault/db-types';

/**
 * Serialized DTO representations for Client Components
 * All BigInt minor units and version counters are serialized to string.
 */
export interface SerializedAccount {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance_minor: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  version: string;
}

export interface SerializedTransaction {
  id: string;
  user_id: string;
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  is_reconciled: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: string;
  entries?: SerializedJournalEntry[];
}

export interface SerializedJournalEntry {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount_minor: string;
  direction: JournalDirection;
  created_at: string;
}

export interface SerializedIOURecord {
  id: string;
  user_id: string;
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: string;
  remaining_balance_minor: string;
  currency: string;
  status: IOUStatus;
  due_date?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: string;
}

export interface SerializedNetWorthSummary {
  totalAssetsMinor: string;
  totalLiabilitiesMinor: string;
  netWorthMinor: string;
  safeToSpendMinor: string;
  currency: string;
}

export interface SerializedCashFlowSummary {
  inflowsMinor: string;
  outflowsMinor: string;
  netSavingsMinor: string;
  savingsRateBps: number;
  period: string;
}

export interface SerializedCashFlowItem {
  id: string;
  name: string;
  category: string;
  amountMinor: string;
}

export type SerializedInflowItem = SerializedCashFlowItem;
export type SerializedOutflowItem = SerializedCashFlowItem;

// ============================================================================
// Serialization / Deserialization Mappers
// ============================================================================

export function serializeAccount(acc: Account): SerializedAccount {
  return {
    ...acc,
    balance_minor: acc.balance_minor.toString(),
    version: acc.version.toString(),
  };
}

export function deserializeAccount(dto: SerializedAccount | Record<string, any>): Account {
  return {
    id: dto.id,
    user_id: dto.user_id,
    name: dto.name,
    type: dto.type,
    currency: dto.currency || 'INR',
    balance_minor: BigInt(dto.balance_minor ?? 0),
    is_archived: Boolean(dto.is_archived),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

export function serializeTransaction(tx: Transaction & { entries?: JournalEntry[] }): SerializedTransaction {
  return {
    ...tx,
    version: tx.version.toString(),
    entries: tx.entries?.map(serializeJournalEntry),
  };
}

export function deserializeTransaction(dto: SerializedTransaction): Transaction {
  return {
    id: dto.id,
    user_id: dto.user_id,
    idempotency_key: dto.idempotency_key,
    transaction_date: dto.transaction_date,
    description: dto.description,
    notes: dto.notes ?? null,
    is_reconciled: Boolean(dto.is_reconciled),
    is_deleted: Boolean(dto.is_deleted),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

export function serializeJournalEntry(entry: JournalEntry): SerializedJournalEntry {
  return {
    ...entry,
    amount_minor: entry.amount_minor.toString(),
  };
}

export function deserializeJournalEntry(dto: SerializedJournalEntry | Record<string, any>): JournalEntry {
  return {
    id: dto.id,
    user_id: dto.user_id,
    transaction_id: dto.transaction_id,
    account_id: dto.account_id,
    amount_minor: BigInt(dto.amount_minor ?? 0),
    direction: dto.direction,
    created_at: dto.created_at,
  };
}

export function serializeIOURecord(iou: IOURecord): SerializedIOURecord {
  return {
    ...iou,
    principal_minor: iou.principal_minor.toString(),
    remaining_balance_minor: iou.remaining_balance_minor.toString(),
    version: iou.version.toString(),
  };
}

export function deserializeIOURecord(dto: SerializedIOURecord | Record<string, any>): IOURecord {
  return {
    id: dto.id,
    user_id: dto.user_id,
    counterparty_name: dto.counterparty_name,
    counterparty_contact: dto.counterparty_contact ?? null,
    direction: dto.direction,
    principal_minor: BigInt(dto.principal_minor ?? 0),
    remaining_balance_minor: BigInt(dto.remaining_balance_minor ?? 0),
    currency: dto.currency || 'INR',
    status: dto.status,
    due_date: dto.due_date ?? null,
    notes: dto.notes ?? null,
    is_deleted: Boolean(dto.is_deleted),
    created_at: dto.created_at,
    updated_at: dto.updated_at,
    version: BigInt(dto.version ?? 1),
  };
}

/**
 * Universal deep serializer converting any BigInt properties to strings
 */
export function deepSerializeBigInt<T>(input: T): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(deepSerializeBigInt);
  if (typeof input === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      res[k] = deepSerializeBigInt(v);
    }
    return res;
  }
  return input;
}
