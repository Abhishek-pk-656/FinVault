/**
 * FinVault Shared Database Types & Canonical TypeScript Interfaces
 *
 * Invariant: All monetary amounts are stored as BIGINT minor units (paise/cents).
 * No floating point currency numbers are permitted.
 *
 * Architecture alignment:
 * - PostgreSQL 16 (Supabase cloud migration with RLS & double-entry triggers)
 * - SQLite 3.35+ (client offline-first local storage & sync queue outbox)
 * - @supabase/supabase-js typed Database generic
 */

// ============================================================================
// 1. Core Enums & Union Types
// ============================================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type JournalDirection = 'DEBIT' | 'CREDIT';
export type EntryDirection = JournalDirection; // Backwards-compatible alias

export type IOUDirection = 'LENT' | 'BORROWED';
export type IOUStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'PENDING' | 'IN_FLIGHT' | 'PROCESSING' | 'FAILED' | 'APPLIED' | 'SYNCED';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'RECONCILE' | 'SETTLE';

// ============================================================================
// 2. Strict Domain Model Interfaces (Native `bigint` Minor Units)
// ============================================================================

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance_minor: bigint;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface Transaction {
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
  version: bigint;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount_minor: bigint;
  direction: JournalDirection;
  created_at: string;
}

export interface IOURecord {
  id: string;
  user_id: string;
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: bigint;
  remaining_balance_minor: bigint;
  currency: string;
  status: IOUStatus;
  due_date?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface SinkingFund {
  id: string;
  user_id: string;
  name: string;
  target_amount_minor: bigint;
  allocated_amount_minor: bigint;
  target_date?: string | null;
  currency: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface AuditLog {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction | string;
  old_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  client_timestamp?: string | null;
  created_at: string;
  // Alternative aliases for PostgREST & sync engine flexibility
  table_name?: string;
  record_id?: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  status: SyncStatus;
  retry_count: number;
  created_at: string;
  // Parity alias columns for test harness & oracle compatibility
  entity_type?: string | null;
  entity_id?: string | null;
  timestamp?: string | null;
}

// Backwards-compatible alias for sync-engine
export type SyncMutation = SyncQueueItem;

// ============================================================================
// 3. Mutation Payloads & DTOs
// ============================================================================

export interface CreateAccountDTO {
  name: string;
  type: AccountType;
  currency?: string;
  balance_minor?: bigint;
}

export interface CreateJournalEntryDTO {
  account_id: string;
  amount_minor: bigint;
  direction: JournalDirection;
}
export type NewJournalEntryPayload = CreateJournalEntryDTO; // Backwards-compatible alias

export interface CreateTransactionDTO {
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  entries: CreateJournalEntryDTO[];
}
export type NewTransactionPayload = CreateTransactionDTO; // Backwards-compatible alias

export interface CreateIOUDTO {
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: bigint;
  currency?: string;
  due_date?: string | null;
  notes?: string | null;
}
export type NewIOUPayload = CreateIOUDTO; // Backwards-compatible alias

export interface SettleIOUDTO {
  iou_id: string;
  amount_minor: bigint;
  account_id: string;
  settlement_date?: string;
  notes?: string | null;
}

export interface CreateSinkingFundDTO {
  name: string;
  target_amount_minor: bigint;
  allocated_amount_minor?: bigint;
  target_date?: string | null;
  currency?: string;
}

export interface SyncMutationDTO {
  id?: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  status?: SyncStatus;
  retry_count?: number;
  created_at?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  timestamp?: string | null;
}

// ============================================================================
// Auth & User Profile Domain Models
// ============================================================================

export interface UserProfile {
  id: string; // Foreign key matching auth.users(id)
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface AuthUserSession {
  userId: string;
  email: string;
  role: 'authenticated' | 'anon';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  profile?: UserProfile | null;
}

export type AuthStatus =
  | 'INITIALIZING'
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED_ONLINE'
  | 'AUTHENTICATED_OFFLINE';

// ============================================================================
// 4. Supabase Database Generic Type Definition (@supabase/supabase-js)
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          currency: string;
          balance_minor: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          type: AccountType;
          currency?: string;
          balance_minor?: number | bigint;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: AccountType;
          currency?: string;
          balance_minor?: number | bigint;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          idempotency_key: string;
          transaction_date: string;
          description: string;
          notes: string | null;
          is_reconciled: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          idempotency_key: string;
          transaction_date: string;
          description: string;
          notes?: string | null;
          is_reconciled?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          idempotency_key?: string;
          transaction_date?: string;
          description?: string;
          notes?: string | null;
          is_reconciled?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          transaction_id: string;
          account_id: string;
          amount_minor: number;
          direction: JournalDirection;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          transaction_id: string;
          account_id: string;
          amount_minor: number | bigint;
          direction: JournalDirection;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          transaction_id?: string;
          account_id?: string;
          amount_minor?: number | bigint;
          direction?: JournalDirection;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journal_entries_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journal_entries_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journal_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      iou_records: {
        Row: {
          id: string;
          user_id: string;
          counterparty_name: string;
          counterparty_contact: string | null;
          direction: IOUDirection;
          principal_minor: number;
          remaining_balance_minor: number;
          currency: string;
          status: IOUStatus;
          due_date: string | null;
          notes: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          counterparty_name: string;
          counterparty_contact?: string | null;
          direction: IOUDirection;
          principal_minor: number | bigint;
          remaining_balance_minor?: number | bigint;
          currency?: string;
          status?: IOUStatus;
          due_date?: string | null;
          notes?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          counterparty_name?: string;
          counterparty_contact?: string | null;
          direction?: IOUDirection;
          principal_minor?: number | bigint;
          remaining_balance_minor?: number | bigint;
          currency?: string;
          status?: IOUStatus;
          due_date?: string | null;
          notes?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'iou_records_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      sinking_funds: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount_minor: number;
          allocated_amount_minor: number;
          target_date: string | null;
          currency: string;
          is_completed: boolean;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          target_amount_minor: number | bigint;
          allocated_amount_minor?: number | bigint;
          target_date?: string | null;
          currency?: string;
          is_completed?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_amount_minor?: number | bigint;
          allocated_amount_minor?: number | bigint;
          target_date?: string | null;
          currency?: string;
          is_completed?: boolean;
          created_at?: string;
          updated_at?: string;
          version?: number | bigint;
        };
        Relationships: [
          {
            foreignKeyName: 'sinking_funds_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          old_state: Json | null;
          new_state: Json | null;
          client_timestamp: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          entity_type: string;
          entity_id: string;
          action: AuditAction;
          old_state?: Json | null;
          new_state?: Json | null;
          client_timestamp?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: AuditAction;
          old_state?: Json | null;
          new_state?: Json | null;
          client_timestamp?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          default_currency: string;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          default_currency?: string;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          default_currency?: string;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      post_transaction: {
        Args: {
          p_user_id?: string | null;
          p_idempotency_key: string;
          p_transaction_date?: string;
          p_date?: string;
          p_description?: string;
          p_notes?: string | null;
          p_entries: Json;
        };
        Returns: string;
      };
      settle_iou: {
        Args: {
          p_iou_id: string;
          p_settlement_amount_minor: number | bigint;
          p_account_id: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      account_type: AccountType;
      entry_direction: JournalDirection;
      iou_direction: IOUDirection;
      iou_status: IOUStatus;
      audit_action: AuditAction;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ============================================================================
// 5. Utility Type Helpers
// ============================================================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
