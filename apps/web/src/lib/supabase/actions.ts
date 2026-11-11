'use server';

import { createActionClient } from './action';
import { validateTransactionEntries } from '../validation/double-entry';
import { revalidatePath } from 'next/cache';

export interface SubmitTransactionInput {
  idempotency_key?: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  entries: {
    account_id: string;
    amount_minor: string; // Serialized BigInt minor units
    direction: 'DEBIT' | 'CREDIT';
  }[];
}

/**
 * Server Action: Pre-validates double-entry invariants and invokes the atomic post_transaction RPC.
 */
export async function submitTransactionAction(input: SubmitTransactionInput) {
  const parsedEntries = input.entries.map((e) => ({
    account_id: e.account_id,
    amount_minor: BigInt(e.amount_minor),
    direction: e.direction,
  }));

  // 1. Pre-validate double-entry equality client/server side
  const validation = validateTransactionEntries(parsedEntries);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  // 2. Invoke atomic Supabase RPC post_transaction
  const supabase = createActionClient();
  const idempotencyKey = input.idempotency_key || crypto.randomUUID();

  // Payload entries formatted with numeric string for exact BigInt parsing in Postgres
  const payloadEntries = parsedEntries.map((e) => ({
    account_id: e.account_id,
    amount_minor: e.amount_minor.toString(),
    direction: e.direction,
  }));

  const { data: txId, error } = await (supabase as any).rpc('post_transaction', {
    p_idempotency_key: idempotencyKey,
    p_transaction_date: input.transaction_date,
    p_description: input.description,
    p_notes: input.notes ?? null,
    p_entries: payloadEntries,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/cash-flow');
  return { success: true, transactionId: txId };
}

export interface SettleIOUInput {
  iou_id: string;
  settlement_amount_minor: string; // Serialized BigInt minor units
  account_id: string; // Asset account ID
  notes?: string | null;
}

/**
 * Server Action: Invokes the atomic settle_iou RPC to perform contra clearing settlement.
 */
export async function settleIOUAction(input: SettleIOUInput) {
  const amountMinor = BigInt(input.settlement_amount_minor);
  if (amountMinor <= 0n) {
    return { success: false, error: 'Settlement amount must be greater than zero.' };
  }

  const supabase = createActionClient();

  const { data, error } = await (supabase as any).rpc('settle_iou', {
    p_iou_id: input.iou_id,
    p_settlement_amount_minor: amountMinor.toString(),
    p_account_id: input.account_id,
    p_notes: input.notes ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/ious');
  return { success: true, result: data };
}
