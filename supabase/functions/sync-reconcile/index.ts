import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface SyncMutationPayload {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown> | string;
  timestamp: string;
}

export interface SyncReconcileRequest {
  mutations?: SyncMutationPayload[];
  last_sync_timestamp?: string;
}

export interface SyncReconcileResponse {
  status: 'acknowledged' | 'success';
  reconciledTimestamp: string;
  appliedCount: number;
  appliedIds: string[];
  conflicts: Array<{ mutationId: string; reason: string }>;
  errors: string[];
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleSyncReconcile(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // Authorization Bearer Token Verification
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'Missing or malformed Authorization header. Bearer token required.' },
      401
    );
  }

  try {
    const body: SyncReconcileRequest = await req.json();
    const mutations = body.mutations ?? [];
    const serverTimestamp = new Date().toISOString();

    const appliedIds: string[] = [];
    const conflicts: Array<{ mutationId: string; reason: string }> = [];
    const errors: string[] = [];

    for (const m of mutations) {
      try {
        if (!m.id || !m.table_name || !m.operation) {
          conflicts.push({ mutationId: m.id ?? 'unknown', reason: 'Missing required mutation fields' });
          continue;
        }

        // Parse payload if passed as string
        const parsedPayload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;

        // If transaction insert, verify zero-float and double-entry invariants
        if ((m.table_name === 'transactions' || m.table_name === 'transaction') && m.operation === 'INSERT') {
          if (!parsedPayload || typeof parsedPayload !== 'object') {
            conflicts.push({
              mutationId: m.id,
              reason: 'Double-entry balance violation: missing or invalid transaction payload',
            });
            continue;
          }

          const entries = (parsedPayload as { entries?: any[] }).entries;
          if (!entries || !Array.isArray(entries) || entries.length < 2) {
            conflicts.push({
              mutationId: m.id,
              reason: 'Double-entry balance violation: transaction must contain at least two journal entries',
            });
            continue;
          }

          let debits = 0n;
          let credits = 0n;
          let hasConflict = false;

          for (const e of entries) {
            if (!e || typeof e !== 'object') {
              conflicts.push({
                mutationId: m.id,
                reason: 'Double-entry balance violation: journal entry must be a valid object',
              });
              hasConflict = true;
              break;
            }

            if (!e.account_id || typeof e.account_id !== 'string' || e.account_id.trim() === '') {
              conflicts.push({
                mutationId: m.id,
                reason: 'Double-entry balance violation: journal entry missing valid account_id',
              });
              hasConflict = true;
              break;
            }

            if (e.direction !== 'DEBIT' && e.direction !== 'CREDIT') {
              conflicts.push({
                mutationId: m.id,
                reason: `Double-entry balance violation: invalid entry direction "${e.direction}". Direction must be DEBIT or CREDIT`,
              });
              hasConflict = true;
              break;
            }

            if (e.amount_minor === undefined || e.amount_minor === null) {
              conflicts.push({
                mutationId: m.id,
                reason: 'Double-entry balance violation: journal entry missing amount_minor',
              });
              hasConflict = true;
              break;
            }

            if (typeof e.amount_minor === 'number' && !Number.isInteger(e.amount_minor)) {
              throw new Error(`Floating-point monetary amounts are prohibited: ${e.amount_minor}`);
            }

            const amount = BigInt(e.amount_minor);
            if (amount <= 0n) throw new Error('Entry amount must be > 0');

            if (e.direction === 'DEBIT') {
              debits += amount;
            } else if (e.direction === 'CREDIT') {
              credits += amount;
            }
          }

          if (hasConflict) {
            continue;
          }

          if (debits === 0n || credits === 0n) {
            conflicts.push({
              mutationId: m.id,
              reason: `Double-entry balance violation: missing debit or credit leg (debits: ${debits}, credits: ${credits})`,
            });
            continue;
          }

          if (debits !== credits) {
            conflicts.push({
              mutationId: m.id,
              reason: 'Double-entry balance violation',
            });
            continue;
          }
        }

        appliedIds.push(m.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Mutation ${m.id} failed: ${msg}`);
      }
    }

    const response: SyncReconcileResponse = {
      status: errors.length === 0 ? 'success' : 'acknowledged',
      reconciledTimestamp: serverTimestamp,
      appliedCount: appliedIds.length,
      appliedIds,
      conflicts,
      errors,
    };

    return jsonResponse(response, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return jsonResponse({ error: message }, 500);
  }
}

serve(handleSyncReconcile);
