import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Standard Supabase Edge Function CORS Headers
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface JournalEntryPayload {
  account_id: string;
  amount_minor: string | number | bigint;
  direction: 'DEBIT' | 'CREDIT';
}

export interface ValidationRequestBody {
  entries: JournalEntryPayload[];
}

export interface ValidationSuccessResponse {
  valid: true;
  balancedAmount: string;
  debits: string;
  credits: string;
  legCount: number;
  message: string;
}

export interface ValidationErrorResponse {
  valid: false;
  error: string;
  code: string;
  debits?: string;
  credits?: string;
  difference?: string;
}

function jsonResponse(
  body: ValidationSuccessResponse | ValidationErrorResponse | { error: string; code: string; valid: false },
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Enforce HTTP POST
  if (req.method !== 'POST') {
    return jsonResponse(
      {
        valid: false,
        error: `HTTP method ${req.method} not allowed. Please use POST.`,
        code: 'METHOD_NOT_ALLOWED',
      },
      405
    );
  }

  try {
    let body: ValidationRequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          valid: false,
          error: 'Malformed JSON payload in request body.',
          code: 'INVALID_JSON',
        },
        400
      );
    }

    const { entries } = body;

    // 3. Validate entries array structure
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return jsonResponse(
        {
          valid: false,
          error: 'Missing or empty "entries" array in payload.',
          code: 'EMPTY_ENTRIES',
        },
        400
      );
    }

    if (entries.length < 2) {
      return jsonResponse(
        {
          valid: false,
          error: 'A double-entry transaction must contain at least two journal entries (minimum one debit and one credit).',
          code: 'INSUFFICIENT_LEGS',
        },
        400
      );
    }

    let debits = 0n;
    let credits = 0n;

    // 4. Validate each entry
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || typeof e !== 'object') {
        return jsonResponse(
          {
            valid: false,
            error: `Entry at index ${i} is not a valid object.`,
            code: 'INVALID_ENTRY_OBJECT',
          },
          400
        );
      }

      if (!e.account_id || typeof e.account_id !== 'string' || e.account_id.trim() === '') {
        return jsonResponse(
          {
            valid: false,
            error: `Entry at index ${i} is missing a valid "account_id" string.`,
            code: 'MISSING_ACCOUNT_ID',
          },
          400
        );
      }

      if (e.amount_minor === undefined || e.amount_minor === null) {
        return jsonResponse(
          {
            valid: false,
            error: `Entry for account "${e.account_id}" is missing "amount_minor".`,
            code: 'MISSING_AMOUNT',
          },
          400
        );
      }

      // 5. Strict Zero-Float Minor Unit Validation
      let amount: bigint;
      if (typeof e.amount_minor === 'number') {
        if (!Number.isInteger(e.amount_minor)) {
          return jsonResponse(
            {
              valid: false,
              error: `Floating-point monetary amounts are strictly prohibited. "amount_minor" must be an integer minor unit (e.g., cents or paise). Received: ${e.amount_minor}`,
              code: 'FLOATING_POINT_PROHIBITED',
            },
            400
          );
        }
        if (e.amount_minor > Number.MAX_SAFE_INTEGER || e.amount_minor < Number.MIN_SAFE_INTEGER) {
          return jsonResponse(
            {
              valid: false,
              error: `Number exceeds IEEE 754 safe integer limits. Provide large 64-bit BigInt minor units as a string.`,
              code: 'INTEGER_OVERFLOW_RISK',
            },
            400
          );
        }
        amount = BigInt(e.amount_minor);
      } else if (typeof e.amount_minor === 'string') {
        const trimmed = e.amount_minor.trim();
        if (!/^-?\d+$/.test(trimmed)) {
          return jsonResponse(
            {
              valid: false,
              error: `Invalid minor unit string: "${e.amount_minor}". Must contain only integer digits (no decimal points, commas, currency symbols, or scientific notation).`,
              code: 'INVALID_MINOR_UNIT_STRING',
            },
            400
          );
        }
        try {
          amount = BigInt(trimmed);
        } catch {
          return jsonResponse(
            {
              valid: false,
              error: `Failed to parse amount_minor string "${e.amount_minor}" as BigInt.`,
              code: 'BIGINT_PARSE_ERROR',
            },
            400
          );
        }
      } else if (typeof e.amount_minor === 'bigint') {
        amount = e.amount_minor;
      } else {
        return jsonResponse(
          {
            valid: false,
            error: `Unsupported type for amount_minor: ${typeof e.amount_minor}. Must be an integer number, digit string, or BigInt.`,
            code: 'INVALID_AMOUNT_TYPE',
          },
          400
        );
      }

      // 6. Strictly Positive Minor Unit Check
      if (amount <= 0n) {
        return jsonResponse(
          {
            valid: false,
            error: `Journal entry amount must be strictly positive (> 0n). Received: ${amount.toString()}n. Direction determines sign.`,
            code: 'NON_POSITIVE_AMOUNT',
          },
          400
        );
      }

      // 7. Direction Validation & Accumulation
      if (e.direction === 'DEBIT') {
        debits += amount;
      } else if (e.direction === 'CREDIT') {
        credits += amount;
      } else {
        return jsonResponse(
          {
            valid: false,
            error: `Invalid entry direction: "${e.direction}". Direction must be strictly "DEBIT" or "CREDIT".`,
            code: 'INVALID_DIRECTION',
          },
          400
        );
      }
    }

    // 8. Missing Leg Check
    if (debits === 0n || credits === 0n) {
      return jsonResponse(
        {
          valid: false,
          error: `Transaction violates double-entry invariant: missing debit or credit leg. Debits: ${debits.toString()}n, Credits: ${credits.toString()}n.`,
          code: 'MISSING_LEG',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: (debits - credits).toString(),
        },
        400
      );
    }

    // 9. Debit == Credit Equality Check
    if (debits !== credits) {
      const diff = debits - credits;
      return jsonResponse(
        {
          valid: false,
          error: `Double-entry balance violation: sum(debits) = ${debits.toString()} != sum(credits) = ${credits.toString()} (difference: ${diff.toString()}).`,
          code: 'DOUBLE_ENTRY_IMBALANCE',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: diff.toString(),
        },
        400
      );
    }

    // 10. Success Response
    return jsonResponse(
      {
        valid: true,
        balancedAmount: debits.toString(),
        debits: debits.toString(),
        credits: credits.toString(),
        legCount: entries.length,
        message: 'Transaction satisfies all Double-Entry Lite financial invariants.',
      },
      200
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return jsonResponse(
      {
        valid: false,
        error: message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// Start Deno HTTP server
serve(handleRequest);
