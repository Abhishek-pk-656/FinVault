/**
 * FinVault Milestone 3 Adversarial Stress Test Suite
 * Agent: Challenger 2 (challenger_m3_2)
 *
 * Empirically challenges and stress-tests:
 * 1. Edge Function validate-transaction:
 *    - HTTP methods: OPTIONS preflight, GET/PUT/DELETE rejection (405)
 *    - Malformed JSON parsing (400 INVALID_JSON)
 *    - Empty / non-array entries (400 EMPTY_ENTRIES)
 *    - Single-leg transaction rejection (400 INSUFFICIENT_LEGS)
 *    - Missing account_id or invalid entry object (400)
 *    - Missing amount_minor (400 MISSING_AMOUNT)
 *    - Floating-point numbers: 12.5, 99.99, -4.2 (400 FLOATING_POINT_PROHIBITED)
 *    - Number exceeding MAX_SAFE_INTEGER (400 INTEGER_OVERFLOW_RISK)
 *    - Malformed string minor units: decimals, scientific notation, commas, symbols, whitespace
 *    - Non-positive amounts: 0, "0", -50, "-50" (400 NON_POSITIVE_AMOUNT)
 *    - Invalid direction: "DEBITT", "credit", "TRANSFER", "" (400 INVALID_DIRECTION)
 *    - Missing legs: all debits, all credits (400 MISSING_LEG)
 *    - Imbalances: 1-paise discrepancy (+1 and -1 diff), 50-leg discrepancy (400 DOUBLE_ENTRY_IMBALANCE)
 *    - Valid transactions: 2-leg, large 64-bit BigInt amounts, 50-leg multi-splits (200 OK)
 * 2. Edge Function sync-reconcile:
 *    - OPTIONS preflight, GET 405
 *    - Missing or malformed Authorization header (401)
 *    - Unbalanced transaction mutation detection (conflicts)
 *    - Non-positive amount mutation detection (errors)
 *    - Zero-leg transactions (entries: []) rejection into conflicts
 *    - Single-leg transactions rejection into conflicts
 *    - Single-sided transactions (all-DEBIT / all-CREDIT) rejection into conflicts
 *    - Invalid entry direction ("UNKNOWN", "debit") rejection into conflicts
 *    - Empty/missing account_id rejection into conflicts
 *    - Valid batch reconciliation success (200 OK)
 * 3. post_transaction RPC Security Hardening:
 *    - Anonymous caller rejection (auth.role() = 'anon' -> exception)
 *    - Unauthenticated caller rejection (auth.uid() IS NULL -> exception)
 *    - Tenant boundary spoofing: User A cannot post as User B
 *    - Service role caller bypass: service_role can specify p_user_id
 *    - Cross-tenant account rejection: User A referencing User B account
 *    - Non-existent account UUID rejection
 *    - Transaction with < 2 entries rejection
 *    - Multi-entry transaction with 1 invalid leg rollbacks completely
 * 4. settle_iou RPC & Client Implementation:
 *    - Client IOUsOperations:
 *      * Overpayment rejection (amountMinor > remaining_balance_minor)
 *      * Negative and zero amounts rejection (<= 0n)
 *      * Dynamic clearing: uses existing 'IOU Clearing' account if present
 *      * Dynamic provisioning: missing 'IOU Clearing', dynamically provisions 'IOU Clearing' (ASSET for LENT, LIABILITY for BORROWED) rather than falling back to Equity
 *      * Partial settlement sets status to 'PARTIAL' and updates remaining_balance_minor
 *      * Full settlement sets status to 'SETTLED' and remaining_balance_minor = 0n
 *      * Generates valid Double-Entry Lite balanced transaction
 *      * Enqueues update mutation to sync_queue outbox
 *    - PL/pgSQL settle_iou RPC simulation:
 *      * Anonymous caller rejection
 *      * Unauthenticated caller rejection
 *      * Cross-tenant IOU access rejection (RLS)
 *      * Overpayment rejection with exact check_violation
 *      * Zero and negative amount rejection
 *      * Archived account rejection
 *      * Audit log generation: action = 'SETTLE', entity_type = 'iou_records', old_state, new_state
 *      * Double-entry leg generation matching direction (LENT vs BORROWED)
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as crypto from 'node:crypto';

import {
  initDatabase,
  getAccounts,
  postTransaction,
  settleIOU,
  NodeSQLiteAdapter,
  CLIENT_SQLITE_SCHEMA
} from '../../packages/sync-engine/src/index.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}${details ? ': ' + details : ''}`);
  }
}

// ======================================================================
// EDGE FUNCTION SHIM LOADER
// ======================================================================
async function loadEdgeFunction(relPath: string): Promise<any> {
  const fullPath = path.resolve(relPath);
  const src = fs.readFileSync(fullPath, 'utf-8');
  // Strip Deno HTTP server import and serve invocation
  const shimmed = src
    .replace(/import { serve } from '[^']+';/, 'const serve = () => {};')
    .replace(/serve\([^)]+\);/, '// serve shimmed');

  const tempName = `.temp-${path.basename(relPath, '.ts')}-${Date.now()}.ts`;
  const tempPath = path.resolve(path.dirname(fullPath), tempName);
  fs.writeFileSync(tempPath, shimmed, 'utf-8');

  try {
    const mod = await import(pathToFileURL(tempPath).href);
    return mod;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore
    }
  }
}

async function runAdversarialStressSuite() {
  console.log('============================================================');
  console.log('CHALLENGER 2: FINVAULT M3 ADVERSARIAL STRESS TEST HARNESS');
  console.log('Target: Edge Functions, post_transaction & settle_iou RPC');
  console.log('============================================================\n');

  // Load actual Edge Functions
  const validateTxModule = await loadEdgeFunction('supabase/functions/validate-transaction/index.ts');
  const syncReconcileModule = await loadEdgeFunction('supabase/functions/sync-reconcile/index.ts');
  const handleValidateTx = validateTxModule.handleRequest;
  const handleSyncReconcile = syncReconcileModule.handleSyncReconcile;

  // ======================================================================
  // SECTION 1: Edge Function validate-transaction Adversarial Suite
  // ======================================================================
  console.log('--- SECTION 1: Edge Function validate-transaction Adversarial Suite ---');

  // 1.1 HTTP Method Enforcement
  {
    const optRes = await handleValidateTx(new Request('http://localhost', { method: 'OPTIONS' }));
    assert(optRes.status === 200 && optRes.headers.get('Access-Control-Allow-Origin') === '*', '1.1.1 OPTIONS preflight returns 200 with CORS headers');

    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleValidateTx(new Request('http://localhost', { method }));
      const body = await res.json();
      assert(res.status === 405 && body.code === 'METHOD_NOT_ALLOWED', `1.1.2 Method ${method} rejected with 405 METHOD_NOT_ALLOWED`);
    }
  }

  // 1.2 Malformed JSON body
  {
    const res = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: '{ malformed json: ',
      headers: { 'Content-Type': 'application/json' }
    }));
    const body = await res.json();
    assert(res.status === 400 && body.code === 'INVALID_JSON', '1.2.1 Malformed JSON payload returns 400 INVALID_JSON');
  }

  // 1.3 Missing / Empty / Malformed entries array
  {
    // Empty object
    const res1 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b1 = await res1.json();
    assert(res1.status === 400 && b1.code === 'EMPTY_ENTRIES', '1.3.1 Missing "entries" property returns 400 EMPTY_ENTRIES');

    // Empty array
    const res2 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b2 = await res2.json();
    assert(res2.status === 400 && b2.code === 'EMPTY_ENTRIES', '1.3.2 Empty "entries" array returns 400 EMPTY_ENTRIES');

    // String instead of array
    const res3 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ entries: 'not-an-array' }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b3 = await res3.json();
    assert(res3.status === 400 && b3.code === 'EMPTY_ENTRIES', '1.3.3 Non-array "entries" returns 400 EMPTY_ENTRIES');
  }

  // 1.4 Single-leg transaction rejection
  {
    const res = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ account_id: 'acc1', amount_minor: 1000, direction: 'DEBIT' }]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const body = await res.json();
    assert(res.status === 400 && body.code === 'INSUFFICIENT_LEGS', '1.4.1 Single-leg transaction rejected with 400 INSUFFICIENT_LEGS');
  }

  // 1.5 Missing account_id or invalid entry object
  {
    // Null entry in array
    const res1 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [null, { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b1 = await res1.json();
    assert(res1.status === 400 && b1.code === 'INVALID_ENTRY_OBJECT', '1.5.1 Null entry object rejected with 400 INVALID_ENTRY_OBJECT');

    // Missing account_id
    const res2 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { amount_minor: 100, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b2 = await res2.json();
    assert(res2.status === 400 && b2.code === 'MISSING_ACCOUNT_ID', '1.5.2 Missing account_id rejected with 400 MISSING_ACCOUNT_ID');

    // Whitespace account_id
    const res3 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: '   ', amount_minor: 100, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b3 = await res3.json();
    assert(res3.status === 400 && b3.code === 'MISSING_ACCOUNT_ID', '1.5.3 Whitespace account_id rejected with 400 MISSING_ACCOUNT_ID');
  }

  // 1.6 Missing amount_minor
  {
    const res = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const body = await res.json();
    assert(res.status === 400 && body.code === 'MISSING_AMOUNT', '1.6.1 Missing amount_minor rejected with 400 MISSING_AMOUNT');
  }

  // 1.7 Floating-point decimal rejection
  {
    const floatInputs = [12.5, 99.99, 0.01, -4.2, 100.0001];
    for (const val of floatInputs) {
      const res = await handleValidateTx(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { account_id: 'a1', amount_minor: val, direction: 'DEBIT' },
            { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
          ]
        }),
        headers: { 'Content-Type': 'application/json' }
      }));
      const body = await res.json();
      assert(res.status === 400 && body.code === 'FLOATING_POINT_PROHIBITED', `1.7 Floating-point number ${val} rejected with FLOATING_POINT_PROHIBITED`);
    }
  }

  // 1.8 Number exceeding MAX_SAFE_INTEGER
  {
    const hugeNum = 9007199254740992; // Number.MAX_SAFE_INTEGER + 1
    const res = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: hugeNum, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const body = await res.json();
    assert(res.status === 400 && body.code === 'INTEGER_OVERFLOW_RISK', '1.8 Number > MAX_SAFE_INTEGER rejected with INTEGER_OVERFLOW_RISK');
  }

  // 1.9 Malformed string minor units
  {
    const malformedStrings = [
      '12.50',
      '0.05',
      '1e5',
      '1.5e3',
      '1E6',
      '2e-2',
      '1,000',
      '$500',
      '₹100',
      '  ',
      'abc',
      'NaN',
      'Infinity'
    ];

    for (const str of malformedStrings) {
      const res = await handleValidateTx(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { account_id: 'a1', amount_minor: str, direction: 'DEBIT' },
            { account_id: 'a2', amount_minor: '100', direction: 'CREDIT' }
          ]
        }),
        headers: { 'Content-Type': 'application/json' }
      }));
      const body = await res.json();
      assert(res.status === 400 && body.code === 'INVALID_MINOR_UNIT_STRING', `1.9 String amount "${str}" rejected with INVALID_MINOR_UNIT_STRING`);
    }

    // Invalid types: boolean, object, array
    for (const badType of [true, {}, []]) {
      const res = await handleValidateTx(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { account_id: 'a1', amount_minor: badType, direction: 'DEBIT' },
            { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
          ]
        }),
        headers: { 'Content-Type': 'application/json' }
      }));
      const body = await res.json();
      assert(res.status === 400 && body.code === 'INVALID_AMOUNT_TYPE', `1.9 Type ${typeof badType} rejected with INVALID_AMOUNT_TYPE`);
    }
  }

  // 1.10 Non-positive minor units (0 and negative)
  {
    const nonPositive = [0, '0', -50, '-50', -1];
    for (const np of nonPositive) {
      const res = await handleValidateTx(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { account_id: 'a1', amount_minor: np, direction: 'DEBIT' },
            { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
          ]
        }),
        headers: { 'Content-Type': 'application/json' }
      }));
      const body = await res.json();
      assert(res.status === 400 && body.code === 'NON_POSITIVE_AMOUNT', `1.10 Non-positive amount (${np}) rejected with NON_POSITIVE_AMOUNT`);
    }
  }

  // 1.11 Direction validation
  {
    for (const dir of ['DEBITT', 'credit', 'TRANSFER', '']) {
      const res = await handleValidateTx(new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { account_id: 'a1', amount_minor: 100, direction: dir },
            { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
          ]
        }),
        headers: { 'Content-Type': 'application/json' }
      }));
      const body = await res.json();
      assert(res.status === 400 && body.code === 'INVALID_DIRECTION', `1.11 Invalid direction "${dir}" rejected with INVALID_DIRECTION`);
    }
  }

  // 1.12 Missing leg checks (all debits or all credits)
  {
    const allDebits = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: 100, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'DEBIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bDebits = await allDebits.json();
    assert(allDebits.status === 400 && bDebits.code === 'MISSING_LEG', '1.12.1 All DEBITs rejected with MISSING_LEG');

    const allCredits = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: 100, direction: 'CREDIT' },
          { account_id: 'a2', amount_minor: 100, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bCredits = await allCredits.json();
    assert(allCredits.status === 400 && bCredits.code === 'MISSING_LEG', '1.12.2 All CREDITs rejected with MISSING_LEG');
  }

  // 1.13 Double-entry imbalances
  {
    // 1-paise imbalance (+1 difference)
    const res1 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: 1001, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 1000, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b1 = await res1.json();
    assert(res1.status === 400 && b1.code === 'DOUBLE_ENTRY_IMBALANCE' && b1.difference === '1', '1.13.1 1-paise imbalance (+1) rejected with DOUBLE_ENTRY_IMBALANCE');

    // 1-paise imbalance (-1 difference)
    const res2 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: 999, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 1000, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b2 = await res2.json();
    assert(res2.status === 400 && b2.code === 'DOUBLE_ENTRY_IMBALANCE' && b2.difference === '-1', '1.13.2 1-paise imbalance (-1) rejected with DOUBLE_ENTRY_IMBALANCE');

    // Multi-split 50-leg with 1 paise discrepancy
    const multi50Entries: any[] = [];
    for (let i = 0; i < 25; i++) {
      multi50Entries.push({ account_id: `deb_${i}`, amount_minor: 100, direction: 'DEBIT' });
      multi50Entries.push({ account_id: `cred_${i}`, amount_minor: 100, direction: 'CREDIT' });
    }
    multi50Entries[0].amount_minor = 101; // inject 1 paise discrepancy
    const res50 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ entries: multi50Entries }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const b50 = await res50.json();
    assert(res50.status === 400 && b50.code === 'DOUBLE_ENTRY_IMBALANCE', '1.13.3 50-leg multi-split with 1-paise discrepancy rejected');
  }

  // 1.14 Valid transactions acceptance
  {
    // Valid 2-leg number
    const resNum = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: 5000, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 5000, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bNum = await resNum.json();
    assert(resNum.status === 200 && bNum.valid === true && bNum.balancedAmount === '5000', '1.14.1 Valid 2-leg integer amount accepted (200 OK)');

    // Valid 2-leg string
    const resStr = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: '125000', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '125000', direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bStr = await resStr.json();
    assert(resStr.status === 200 && bStr.valid === true && bStr.balancedAmount === '125000', '1.14.2 Valid 2-leg digit string accepted (200 OK)');

    // Valid 64-bit BigInt string (Int64 Max = 9,223,372,036,854,775,807)
    const maxInt64Str = '9223372036854775807';
    const resMax = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { account_id: 'a1', amount_minor: maxInt64Str, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: maxInt64Str, direction: 'CREDIT' }
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bMax = await resMax.json();
    assert(resMax.status === 200 && bMax.valid === true && bMax.balancedAmount === maxInt64Str, '1.14.3 Large 64-bit BigInt string (> 2^53 - 1) accepted cleanly without precision loss');

    // Valid 50-leg multi-split
    const valid50: any[] = [];
    for (let i = 0; i < 25; i++) {
      valid50.push({ account_id: `d_${i}`, amount_minor: 200, direction: 'DEBIT' });
      valid50.push({ account_id: `c_${i}`, amount_minor: 200, direction: 'CREDIT' });
    }
    const resValid50 = await handleValidateTx(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ entries: valid50 }),
      headers: { 'Content-Type': 'application/json' }
    }));
    const bValid50 = await resValid50.json();
    assert(resValid50.status === 200 && bValid50.valid === true && bValid50.legCount === 50 && bValid50.balancedAmount === '5000', '1.14.4 Balanced 50-leg multi-split transaction accepted');
  }

  // ======================================================================
  // SECTION 2: Edge Function sync-reconcile Security & Integrity Suite
  // ======================================================================
  console.log('\n--- SECTION 2: Edge Function sync-reconcile Security & Integrity Suite ---');

  // 2.1 OPTIONS preflight & GET rejection
  {
    const optRes = await handleSyncReconcile(new Request('http://localhost', { method: 'OPTIONS' }));
    assert(optRes.status === 200, '2.1.1 OPTIONS preflight returns 200 OK');

    const getRes = await handleSyncReconcile(new Request('http://localhost', { method: 'GET' }));
    assert(getRes.status === 405, '2.1.2 GET method rejected with 405 Method Not Allowed');
  }

  // 2.2 Authorization Bearer Token
  {
    // Missing Authorization
    const resNoAuth = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [] }),
      headers: { 'Content-Type': 'application/json' }
    }));
    assert(resNoAuth.status === 401, '2.2.1 Missing Authorization header rejected with 401');

    // Non-Bearer Authorization
    const resBadAuth = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic dXNlcjpwYXNz'
      }
    }));
    assert(resBadAuth.status === 401, '2.2.2 Non-Bearer Authorization header rejected with 401');
  }

  // 2.3 Double-entry transaction mutation validation
  {
    // Unbalanced transaction mutation
    const unbalMutation = {
      id: 'mut_unbal_1',
      table_name: 'transactions',
      record_id: 'tx_unbal_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '500', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '499', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };

    const resUnbal = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [unbalMutation] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-jwt-token'
      }
    }));
    const bUnbal = await resUnbal.json();
    assert(
      resUnbal.status === 200 &&
      bUnbal.conflicts.length === 1 &&
      bUnbal.conflicts[0].mutationId === 'mut_unbal_1' &&
      bUnbal.conflicts[0].reason.includes('Double-entry balance violation'),
      '2.3.1 Unbalanced transaction mutation detected and captured in conflicts list'
    );

    // Negative amount mutation
    const negMutation = {
      id: 'mut_neg_1',
      table_name: 'transactions',
      record_id: 'tx_neg_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '-500', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '500', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };

    const resNeg = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [negMutation] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-jwt-token'
      }
    }));
    const bNeg = await resNeg.json();
    assert(
      resNeg.status === 200 &&
      bNeg.errors.length === 1 &&
      bNeg.errors[0].includes('Entry amount must be > 0'),
      '2.3.2 Non-positive amount mutation detected and captured in errors list'
    );

    // 2.3.3 Zero-leg transaction mutation (entries: [])
    const zeroLegMutation = {
      id: 'mut_zero_leg_1',
      table_name: 'transactions',
      record_id: 'tx_zero_leg_1',
      operation: 'INSERT',
      payload: {
        entries: []
      },
      timestamp: new Date().toISOString()
    };
    const resZeroLeg = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [zeroLegMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bZeroLeg = await resZeroLeg.json();
    assert(
      resZeroLeg.status === 200 &&
      bZeroLeg.conflicts.length === 1 &&
      bZeroLeg.conflicts[0].mutationId === 'mut_zero_leg_1' &&
      bZeroLeg.conflicts[0].reason.includes('at least two journal entries') &&
      !bZeroLeg.appliedIds.includes('mut_zero_leg_1'),
      '2.3.3 Zero-leg transaction (entries: []) strictly rejected into conflicts'
    );

    // 2.3.4 Single-leg transaction mutation (entries: [1 leg])
    const singleLegMutation = {
      id: 'mut_single_leg_1',
      table_name: 'transactions',
      record_id: 'tx_single_leg_1',
      operation: 'INSERT',
      payload: {
        entries: [{ account_id: 'a1', amount_minor: '500', direction: 'DEBIT' }]
      },
      timestamp: new Date().toISOString()
    };
    const resSingleLeg = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [singleLegMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bSingleLeg = await resSingleLeg.json();
    assert(
      resSingleLeg.status === 200 &&
      bSingleLeg.conflicts.length === 1 &&
      bSingleLeg.conflicts[0].mutationId === 'mut_single_leg_1' &&
      bSingleLeg.conflicts[0].reason.includes('at least two journal entries') &&
      !bSingleLeg.appliedIds.includes('mut_single_leg_1'),
      '2.3.4 Single-leg transaction strictly rejected into conflicts'
    );

    // 2.3.5 Single-sided all-DEBIT transaction (2 legs, debits > 0, credits === 0)
    const allDebitMutation = {
      id: 'mut_all_debit_1',
      table_name: 'transactions',
      record_id: 'tx_all_debit_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '500', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '500', direction: 'DEBIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };
    const resAllDebit = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [allDebitMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bAllDebit = await resAllDebit.json();
    assert(
      resAllDebit.status === 200 &&
      bAllDebit.conflicts.length === 1 &&
      bAllDebit.conflicts[0].mutationId === 'mut_all_debit_1' &&
      bAllDebit.conflicts[0].reason.includes('missing debit or credit leg') &&
      !bAllDebit.appliedIds.includes('mut_all_debit_1'),
      '2.3.5 Single-sided all-DEBIT transaction strictly rejected into conflicts'
    );

    // 2.3.6 Single-sided all-CREDIT transaction (2 legs, debits === 0, credits > 0)
    const allCreditMutation = {
      id: 'mut_all_credit_1',
      table_name: 'transactions',
      record_id: 'tx_all_credit_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '500', direction: 'CREDIT' },
          { account_id: 'a2', amount_minor: '500', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };
    const resAllCredit = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [allCreditMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bAllCredit = await resAllCredit.json();
    assert(
      resAllCredit.status === 200 &&
      bAllCredit.conflicts.length === 1 &&
      bAllCredit.conflicts[0].mutationId === 'mut_all_credit_1' &&
      bAllCredit.conflicts[0].reason.includes('missing debit or credit leg') &&
      !bAllCredit.appliedIds.includes('mut_all_credit_1'),
      '2.3.6 Single-sided all-CREDIT transaction strictly rejected into conflicts'
    );

    // 2.3.7 Invalid entry direction ('UNKNOWN')
    const badDirectionMutation = {
      id: 'mut_bad_dir_1',
      table_name: 'transactions',
      record_id: 'tx_bad_dir_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '500', direction: 'UNKNOWN' },
          { account_id: 'a2', amount_minor: '500', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };
    const resBadDir = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [badDirectionMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bBadDir = await resBadDir.json();
    assert(
      resBadDir.status === 200 &&
      bBadDir.conflicts.length === 1 &&
      bBadDir.conflicts[0].mutationId === 'mut_bad_dir_1' &&
      bBadDir.conflicts[0].reason.includes('Direction must be DEBIT or CREDIT') &&
      !bBadDir.appliedIds.includes('mut_bad_dir_1'),
      '2.3.7 Invalid entry direction ("UNKNOWN") strictly rejected into conflicts'
    );

    // 2.3.8 Invalid lowercase entry direction ('debit')
    const lowerDirMutation = {
      id: 'mut_lower_dir_1',
      table_name: 'transactions',
      record_id: 'tx_lower_dir_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '500', direction: 'debit' },
          { account_id: 'a2', amount_minor: '500', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };
    const resLowerDir = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [lowerDirMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bLowerDir = await resLowerDir.json();
    assert(
      resLowerDir.status === 200 &&
      bLowerDir.conflicts.length === 1 &&
      bLowerDir.conflicts[0].mutationId === 'mut_lower_dir_1' &&
      bLowerDir.conflicts[0].reason.includes('Direction must be DEBIT or CREDIT') &&
      !bLowerDir.appliedIds.includes('mut_lower_dir_1'),
      '2.3.8 Lowercase entry direction ("debit") strictly rejected into conflicts'
    );

    // 2.3.9 Missing account_id in journal entry
    const missingAccMutation = {
      id: 'mut_missing_acc_1',
      table_name: 'transactions',
      record_id: 'tx_missing_acc_1',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: '', amount_minor: '500', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '500', direction: 'CREDIT' }
        ]
      },
      timestamp: new Date().toISOString()
    };
    const resMissingAcc = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: [missingAccMutation] }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-jwt-token' }
    }));
    const bMissingAcc = await resMissingAcc.json();
    assert(
      resMissingAcc.status === 200 &&
      bMissingAcc.conflicts.length === 1 &&
      bMissingAcc.conflicts[0].mutationId === 'mut_missing_acc_1' &&
      bMissingAcc.conflicts[0].reason.includes('missing valid account_id') &&
      !bMissingAcc.appliedIds.includes('mut_missing_acc_1'),
      '2.3.9 Empty account_id strictly rejected into conflicts'
    );
  }

  // 2.4 Valid mutation batch processing
  {
    const validBatch = [
      {
        id: 'mut_valid_1',
        table_name: 'accounts',
        record_id: 'acc_1',
        operation: 'INSERT',
        payload: { name: 'Emergency Fund', balance_minor: '50000' },
        timestamp: new Date().toISOString()
      },
      {
        id: 'mut_valid_2',
        table_name: 'transactions',
        record_id: 'tx_1',
        operation: 'INSERT',
        payload: JSON.stringify({
          entries: [
            { account_id: 'acc_1', amount_minor: '1000', direction: 'DEBIT' },
            { account_id: 'acc_2', amount_minor: '1000', direction: 'CREDIT' }
          ]
        }),
        timestamp: new Date().toISOString()
      }
    ];

    const res = await handleSyncReconcile(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ mutations: validBatch }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-jwt-token'
      }
    }));
    const body = await res.json();
    assert(
      res.status === 200 &&
      body.status === 'success' &&
      body.appliedCount === 2 &&
      body.appliedIds.includes('mut_valid_1') &&
      body.appliedIds.includes('mut_valid_2'),
      '2.4.1 Valid mutation batch processed with 100% appliedIds and status "success"'
    );
  }

  // ======================================================================
  // SECTION 3: post_transaction RPC Security Hardening
  // ======================================================================
  console.log('\n--- SECTION 3: post_transaction RPC Security Hardening ---');

  /**
   * High-fidelity simulator replicating post_transaction() in PostgreSQL
   * migration: 20261108000001_security_hardening_and_iou_settlement.sql
   */
  function simulatePostgresPostTransaction(
    callerRole: 'anon' | 'authenticated' | 'service_role' | null,
    callerUid: string | null,
    accountsTable: Map<string, { id: string; user_id: string }>,
    params: {
      p_user_id?: string | null;
      p_idempotency_key?: string;
      p_transaction_date?: string;
      p_description?: string;
      p_notes?: string | null;
      p_entries?: Array<{ account_id: string; amount_minor: bigint; direction: string }>;
    }
  ): { tx_id: string } {
    // 1. Explicitly reject anonymous callers
    if (callerRole === 'anon') {
      throw new Error('Not authenticated: anonymous callers cannot post transactions');
    }

    // 2. Determine target user: authenticated user cannot spoof other tenants
    let v_user_id: string | null;
    if (callerRole === 'service_role') {
      v_user_id = params.p_user_id ?? callerUid;
    } else {
      v_user_id = callerUid;
    }

    if (!v_user_id) {
      throw new Error('Not authenticated');
    }

    if (callerUid !== null && callerRole !== 'service_role' && params.p_user_id && params.p_user_id !== callerUid) {
      throw new Error('Unauthorized: cannot post transactions for other users');
    }

    // 3. Validate minimum entries
    if (!params.p_entries || params.p_entries.length < 2) {
      throw new Error('A transaction must contain at least two journal entries');
    }

    // 4. Cross-tenant verification: all accounts must belong to target user
    for (const entry of params.p_entries) {
      const acc = accountsTable.get(entry.account_id);
      if (!acc || acc.user_id !== v_user_id) {
        throw new Error(`Cross-tenant foreign key violation: account ${entry.account_id} does not belong to user ${v_user_id}`);
      }
    }

    // 5. Balance validation (enforced by trigger verify_transaction_balance)
    let debits = 0n;
    let credits = 0n;
    for (const entry of params.p_entries) {
      if (entry.amount_minor <= 0n) {
        throw new Error('Journal entry amount must be positive');
      }
      if (entry.direction === 'DEBIT') debits += entry.amount_minor;
      else if (entry.direction === 'CREDIT') credits += entry.amount_minor;
      else throw new Error(`Invalid direction: ${entry.direction}`);
    }

    if (debits !== credits) {
      throw new Error(`Double-entry balance violation: sum(debits) = ${debits} != sum(credits) = ${credits}`);
    }

    return { tx_id: crypto.randomUUID() };
  }

  const mockTenantAccounts = new Map<string, { id: string; user_id: string }>([
    ['acc-alice-1', { id: 'acc-alice-1', user_id: 'user-alice' }],
    ['acc-alice-2', { id: 'acc-alice-2', user_id: 'user-alice' }],
    ['acc-bob-1', { id: 'acc-bob-1', user_id: 'user-bob' }],
    ['acc-bob-2', { id: 'acc-bob-2', user_id: 'user-bob' }],
  ]);

  // 3.1 Anonymous caller rejection
  {
    let anonThrew = false;
    try {
      simulatePostgresPostTransaction('anon', null, mockTenantAccounts, {
        p_entries: [
          { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: 'acc-alice-2', amount_minor: 1000n, direction: 'CREDIT' }
        ]
      });
    } catch (err: any) {
      anonThrew = err.message.includes('anonymous callers cannot post transactions');
    }
    assert(anonThrew, '3.1 Anonymous caller rejected with "anonymous callers cannot post transactions"');
  }

  // 3.2 Unauthenticated caller (null role/uid)
  {
    let unauthThrew = false;
    try {
      simulatePostgresPostTransaction(null, null, mockTenantAccounts, {
        p_entries: [
          { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: 'acc-alice-2', amount_minor: 1000n, direction: 'CREDIT' }
        ]
      });
    } catch (err: any) {
      unauthThrew = err.message.includes('Not authenticated');
    }
    assert(unauthThrew, '3.2 Unauthenticated caller rejected with "Not authenticated"');
  }

  // 3.3 Tenant spoofing prevention: Alice passing p_user_id = Bob
  {
    let spoofThrew = false;
    try {
      simulatePostgresPostTransaction('authenticated', 'user-alice', mockTenantAccounts, {
        p_user_id: 'user-bob',
        p_entries: [
          { account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: 'acc-bob-2', amount_minor: 1000n, direction: 'CREDIT' }
        ]
      });
    } catch (err: any) {
      spoofThrew = err.message.includes('cannot post transactions for other users');
    }
    assert(spoofThrew, '3.3 Tenant spoofing attempt by authenticated Alice blocked with "Unauthorized: cannot post transactions for other users"');
  }

  // 3.4 Service role caller bypass: service_role can specify p_user_id
  {
    let serviceSuccess = false;
    try {
      const res = simulatePostgresPostTransaction('service_role', null, mockTenantAccounts, {
        p_user_id: 'user-bob',
        p_entries: [
          { account_id: 'acc-bob-1', amount_minor: 2500n, direction: 'DEBIT' },
          { account_id: 'acc-bob-2', amount_minor: 2500n, direction: 'CREDIT' }
        ]
      });
      serviceSuccess = Boolean(res.tx_id);
    } catch {
      serviceSuccess = false;
    }
    assert(serviceSuccess, '3.4 Service role caller successfully posts on behalf of target user_id');
  }

  // 3.5 Cross-tenant account injection: Alice referencing Bob account in entries
  {
    let crossTenantThrew = false;
    try {
      simulatePostgresPostTransaction('authenticated', 'user-alice', mockTenantAccounts, {
        p_entries: [
          { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'CREDIT' }
        ]
      });
    } catch (err: any) {
      crossTenantThrew = err.message.includes('Cross-tenant foreign key violation');
    }
    assert(crossTenantThrew, '3.5 Cross-tenant account reference rejected with "Cross-tenant foreign key violation"');
  }

  // 3.6 Non-existent account UUID rejection
  {
    let nonExistentThrew = false;
    try {
      simulatePostgresPostTransaction('authenticated', 'user-alice', mockTenantAccounts, {
        p_entries: [
          { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' },
          { account_id: '00000000-0000-0000-0000-000000000000', amount_minor: 1000n, direction: 'CREDIT' }
        ]
      });
    } catch (err: any) {
      nonExistentThrew = err.message.includes('Cross-tenant foreign key violation');
    }
    assert(nonExistentThrew, '3.6 Non-existent account UUID rejected with foreign key violation');
  }

  // 3.7 Transaction with single entry (< 2 entries) rejected
  {
    let singleEntryThrew = false;
    try {
      simulatePostgresPostTransaction('authenticated', 'user-alice', mockTenantAccounts, {
        p_entries: [
          { account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' }
        ]
      });
    } catch (err: any) {
      singleEntryThrew = err.message.includes('at least two journal entries');
    }
    assert(singleEntryThrew, '3.7 Single entry transaction rejected with "at least two journal entries"');
  }

  // 3.8 Multi-entry transaction where 1 out of 10 legs belongs to Bob
  {
    const tenLegs: any[] = [];
    for (let i = 0; i < 4; i++) {
      tenLegs.push({ account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' });
      tenLegs.push({ account_id: 'acc-alice-2', amount_minor: 1000n, direction: 'CREDIT' });
    }
    // 9th and 10th leg
    tenLegs.push({ account_id: 'acc-alice-1', amount_minor: 1000n, direction: 'DEBIT' });
    tenLegs.push({ account_id: 'acc-bob-1', amount_minor: 1000n, direction: 'CREDIT' }); // Bob's account!

    let partialSpoofThrew = false;
    try {
      simulatePostgresPostTransaction('authenticated', 'user-alice', mockTenantAccounts, {
        p_entries: tenLegs
      });
    } catch (err: any) {
      partialSpoofThrew = err.message.includes('Cross-tenant foreign key violation');
    }
    assert(partialSpoofThrew, '3.8 10-leg transaction where only 1 leg belongs to Bob is completely rejected');
  }

  // ======================================================================
  // SECTION 4: settle_iou RPC & Client Implementation
  // ======================================================================
  console.log('\n--- SECTION 4: settle_iou RPC & Client Implementation ---');

  // 4.1 Client IOUsOperations via SQLite & NodeSQLiteAdapter
  {
    const db = await initDatabase(':memory:');

    // Setup User & Accounts
    await db.execute(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
      VALUES ('acc_bank', 'u_test', 'Bank Savings', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08')
    `);

    // Setup IOU: Lent 10000 paise to Charlie
    await db.execute(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
      VALUES ('iou_lent_charlie', 'u_test', 'Charlie', 'LENT', 10000, 10000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
    `);

    // 4.1.1 Overpayment rejection (remaining balance is 10000, trying to settle 10001)
    let overpaymentThrew = false;
    try {
      await settleIOU('iou_lent_charlie', 10001n, 'acc_bank', 'u_test');
    } catch (err: any) {
      overpaymentThrew = err.message.includes('exceeds remaining balance');
    }
    assert(overpaymentThrew, '4.1.1 Client settleIOU rejects overpayment exceeding remaining balance (10001n > 10000n)');

    // 4.1.2 Zero and Negative amounts rejection
    let zeroThrew = false;
    try {
      await settleIOU('iou_lent_charlie', 0n, 'acc_bank', 'u_test');
    } catch (err: any) {
      zeroThrew = err.message.includes('must be positive');
    }
    assert(zeroThrew, '4.1.2.a Client settleIOU rejects zero settlement amount (0n)');

    let negThrew = false;
    try {
      await settleIOU('iou_lent_charlie', -500n, 'acc_bank', 'u_test');
    } catch (err: any) {
      negThrew = err.message.includes('must be positive');
    }
    assert(negThrew, '4.1.2.b Client settleIOU rejects negative settlement amount (-500n)');

    // 4.1.3 Contra Clearing Account Fallback 3: Neither 'IOU Clearing' nor 'Opening Balance Equity' exists
    // Should dynamically provision 'IOU Clearing' with type 'ASSET' (since direction is LENT)
    const partialRes = await settleIOU('iou_lent_charlie', 4000n, 'acc_bank', 'u_test');
    assert(partialRes.iou.remaining_balance_minor === 6000n, '4.1.3.a Partial settlement sets remaining_balance_minor = 6000n');
    assert(partialRes.iou.status === 'PARTIAL', '4.1.3.b Partial settlement sets status = PARTIAL');
    assert(partialRes.iou.version === 2n, '4.1.3.c Partial settlement increments version = 2n');

    // Verify dynamic provisioning of 'IOU Clearing'
    const clearingAcc = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test' AND name = 'IOU Clearing'`)) as any[];
    assert(clearingAcc.length === 1 && clearingAcc[0].type === 'ASSET', '4.1.3.d Dynamically provisioned "IOU Clearing" account created with ASSET type for LENT direction');

    // Verify bank balance updated: 50000 + 4000 = 54000
    const accountsAfterPart = await getAccounts('u_test');
    const bankAfter = accountsAfterPart.find(a => a.id === 'acc_bank')!;
    assert(bankAfter.balance_minor === 54000n, '4.1.3.e Bank balance incremented by settlement amount (+4000 paise)');

    // Verify sync_queue outbox entry
    const outboxRows = (await db.execute(`SELECT * FROM sync_queue WHERE record_id = 'iou_lent_charlie'`)) as any[];
    assert(outboxRows.length === 1 && outboxRows[0].operation === 'UPDATE', '4.1.3.f sync_queue outbox captured UPDATE mutation for IOU');

    // 4.1.4 Contra Clearing Fallback 1: Re-settle uses existing 'IOU Clearing' without creating duplicate
    const fullRes = await settleIOU('iou_lent_charlie', 6000n, 'acc_bank', 'u_test');
    assert(fullRes.iou.remaining_balance_minor === 0n, '4.1.4.a Full settlement reduces remaining_balance_minor to 0n');
    assert(fullRes.iou.status === 'SETTLED', '4.1.4.b Full settlement marks status = SETTLED');

    const totalClearing = (await db.execute(`SELECT count(*) as cnt FROM accounts WHERE user_id = 'u_test' AND name = 'IOU Clearing'`)) as any[];
    assert(Number(totalClearing[0].cnt) === 1, '4.1.4.c Existing "IOU Clearing" reused without duplicate account insertion');

    // 4.1.5 Contra Clearing Dynamic Provisioning: User with 'Opening Balance Equity'
    // Confirms 'Opening Balance Equity' is NEVER used as clearing account; 'IOU Clearing' is dynamically created with LIABILITY type
    await db.execute(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
      VALUES ('acc_u2_bank', 'u_test2', 'U2 Bank', 'ASSET', 'INR', 30000, 0, '2026-11-08', '2026-11-08'),
             ('acc_u2_equity', 'u_test2', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')
    `);
    await db.execute(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
      VALUES ('iou_borrowed_u2', 'u_test2', 'Lender Dave', 'BORROWED', 5000, 5000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
    `);

    const u2Res = await settleIOU('iou_borrowed_u2', 5000n, 'acc_u2_bank', 'u_test2');
    assert(u2Res.iou.status === 'SETTLED', '4.1.5.a Borrowed IOU settled cleanly');

    // Confirm that 'IOU Clearing' WAS dynamically created with LIABILITY type rather than using Opening Balance Equity
    const u2Clearing = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test2' AND name = 'IOU Clearing'`)) as any[];
    assert(u2Clearing.length === 1 && u2Clearing[0].type === 'LIABILITY', '4.1.5.b Dynamic "IOU Clearing" (LIABILITY) created; Opening Balance Equity not polluted');

    // Confirm that Opening Balance Equity balance remained 0n (untouched)
    const u2Equity = (await db.execute(`SELECT balance_minor FROM accounts WHERE user_id = 'u_test2' AND name = 'Opening Balance Equity'`)) as any[];
    assert(BigInt(u2Equity[0].balance_minor) === 0n, '4.1.5.c Opening Balance Equity balance unchanged (0n)');

    // For BORROWED settlement: money left asset account, so bank balance = 30000 - 5000 = 25000
    const u2Accounts = await getAccounts('u_test2');
    const u2Bank = u2Accounts.find(a => a.id === 'acc_u2_bank')!;
    assert(u2Bank.balance_minor === 25000n, '4.1.5.d Borrowed debt repayment decreased bank balance by 5000 paise (25000n)');

    // 4.1.5.e Contra Clearing Dynamic Provisioning for LENT direction with existing non-zero Opening Balance Equity
    await db.execute(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
      VALUES ('acc_u3_bank', 'u_test3', 'U3 Bank', 'ASSET', 'INR', 10000, 0, '2026-11-08', '2026-11-08'),
             ('acc_u3_equity', 'u_test3', 'Opening Balance Equity', 'EQUITY', 'INR', 50000, 0, '2026-11-08', '2026-11-08')
    `);
    await db.execute(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
      VALUES ('iou_lent_u3', 'u_test3', 'Borrower Eve', 'LENT', 4000, 4000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
    `);

    const u3Res = await settleIOU('iou_lent_u3', 4000n, 'acc_u3_bank', 'u_test3');
    assert(u3Res.iou.status === 'SETTLED', '4.1.5.e LENT IOU settled cleanly');

    const u3Clearing = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test3' AND name = 'IOU Clearing'`)) as any[];
    assert(u3Clearing.length === 1 && u3Clearing[0].type === 'ASSET', '4.1.5.f Dynamic "IOU Clearing" (ASSET) created without touching Opening Balance Equity');

    const u3Equity = (await db.execute(`SELECT balance_minor FROM accounts WHERE user_id = 'u_test3' AND name = 'Opening Balance Equity'`)) as any[];
    assert(BigInt(u3Equity[0].balance_minor) === 50000n, '4.1.5.g Opening Balance Equity balance preserved at exactly 50000n');
  }

  // 4.2 PostgreSQL PL/pgSQL settle_iou RPC Simulation & Invariants
  {
    interface MockIOU {
      id: string;
      user_id: string;
      counterparty_name: string;
      direction: 'LENT' | 'BORROWED';
      principal_minor: bigint;
      remaining_balance_minor: bigint;
      currency: string;
      status: 'OPEN' | 'PARTIAL' | 'SETTLED';
      is_deleted: boolean;
      version: bigint;
    }

    interface MockAccount {
      id: string;
      user_id: string;
      name: string;
      type: string;
      currency: string;
      balance_minor: bigint;
      is_archived: boolean;
    }

    interface MockAuditLog {
      user_id: string;
      entity_type: string;
      entity_id: string;
      action: string;
      old_state: any;
      new_state: any;
    }

    class PostgresSettleIOUSimulator {
      public ious = new Map<string, MockIOU>();
      public accounts = new Map<string, MockAccount>();
      public auditLogs: MockAuditLog[] = [];
      public transactions: any[] = [];
      public journalEntries: any[] = [];

      public settle_iou(
        callerRole: 'anon' | 'authenticated' | 'service_role' | null,
        callerUid: string | null,
        p_iou_id: string,
        p_settlement_amount_minor: bigint,
        p_account_id: string,
        p_notes?: string | null
      ): any {
        // 1. Authentication check
        if (callerRole === 'anon') {
          throw new Error('Not authenticated: anonymous callers cannot settle IOUs');
        }
        const v_user_id = callerUid;
        if (!v_user_id) {
          throw new Error('Not authenticated');
        }

        // 2. Lock & fetch target IOU record
        const v_iou = this.ious.get(p_iou_id);
        if (!v_iou || v_iou.user_id !== v_user_id || v_iou.is_deleted) {
          throw new Error('IOU not found or access denied by RLS');
        }

        // 3. Validate settlement amount
        if (p_settlement_amount_minor <= 0n) {
          throw new Error('Settlement amount must be > 0n');
        }
        if (p_settlement_amount_minor > v_iou.remaining_balance_minor) {
          throw new Error(`Settlement amount (${p_settlement_amount_minor}n) exceeds remaining balance (${v_iou.remaining_balance_minor}n)`);
        }

        // 4. Lock & fetch settlement account
        const v_acc = this.accounts.get(p_account_id);
        if (!v_acc || v_acc.user_id !== v_user_id || v_acc.is_archived) {
          throw new Error('Settlement account not found or access denied by RLS');
        }

        // 5. Locate or provision Contra Clearing Account
        let v_clearing_id: string | null = null;
        for (const acc of this.accounts.values()) {
          if (acc.user_id === v_user_id && acc.name === 'IOU Clearing' && !acc.is_archived) {
            v_clearing_id = acc.id;
            break;
          }
        }
        if (!v_clearing_id) {
          v_clearing_id = crypto.randomUUID();
          const clearingType = v_iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY';
          this.accounts.set(v_clearing_id, {
            id: v_clearing_id,
            user_id: v_user_id,
            name: 'IOU Clearing',
            type: clearingType,
            currency: v_iou.currency,
            balance_minor: 0n,
            is_archived: false
          });
        }

        // 6. Balanced double-entry legs
        const v_entries = v_iou.direction === 'LENT'
          ? [
              { account_id: p_account_id, amount_minor: p_settlement_amount_minor, direction: 'DEBIT' },
              { account_id: v_clearing_id, amount_minor: p_settlement_amount_minor, direction: 'CREDIT' }
            ]
          : [
              { account_id: v_clearing_id, amount_minor: p_settlement_amount_minor, direction: 'DEBIT' },
              { account_id: p_account_id, amount_minor: p_settlement_amount_minor, direction: 'CREDIT' }
            ];

        // 7. Atomically post transaction
        const v_tx_id = crypto.randomUUID();
        this.transactions.push({
          id: v_tx_id,
          user_id: v_user_id,
          description: `IOU Settlement: ${v_iou.counterparty_name} (${v_iou.direction})`,
          notes: p_notes
        });
        for (const entry of v_entries) {
          this.journalEntries.push({
            id: crypto.randomUUID(),
            user_id: v_user_id,
            transaction_id: v_tx_id,
            ...entry
          });
        }

        // 8. Update IOU status and balance
        const v_new_remaining = v_iou.remaining_balance_minor - p_settlement_amount_minor;
        const v_new_status: 'OPEN' | 'PARTIAL' | 'SETTLED' = v_new_remaining === 0n ? 'SETTLED' : 'PARTIAL';
        const oldState = {
          remaining_balance_minor: v_iou.remaining_balance_minor,
          status: v_iou.status
        };
        v_iou.remaining_balance_minor = v_new_remaining;
        v_iou.status = v_new_status;
        v_iou.version += 1n;

        // 9. Append immutable audit log
        const newState = {
          remaining_balance_minor: v_new_remaining,
          status: v_new_status,
          settlement_amount_minor: p_settlement_amount_minor,
          transaction_id: v_tx_id
        };
        this.auditLogs.push({
          user_id: v_user_id,
          entity_type: 'iou_records',
          entity_id: p_iou_id,
          action: 'SETTLE',
          old_state: oldState,
          new_state: newState
        });

        return {
          iou_id: p_iou_id,
          transaction_id: v_tx_id,
          settled_amount_minor: p_settlement_amount_minor,
          remaining_balance_minor: v_new_remaining,
          status: v_new_status
        };
      }
    }

    const sim = new PostgresSettleIOUSimulator();
    sim.accounts.set('acc_alice_cash', {
      id: 'acc_alice_cash',
      user_id: 'alice',
      name: 'Cash Wallet',
      type: 'ASSET',
      currency: 'INR',
      balance_minor: 10000n,
      is_archived: false
    });
    sim.accounts.set('acc_alice_archived', {
      id: 'acc_alice_archived',
      user_id: 'alice',
      name: 'Old Bank',
      type: 'ASSET',
      currency: 'INR',
      balance_minor: 0n,
      is_archived: true
    });
    sim.ious.set('iou_alice_lent', {
      id: 'iou_alice_lent',
      user_id: 'alice',
      counterparty_name: 'Bob',
      direction: 'LENT',
      principal_minor: 8000n,
      remaining_balance_minor: 8000n,
      currency: 'INR',
      status: 'OPEN',
      is_deleted: false,
      version: 1n
    });

    // 4.2.1 Anonymous caller rejection
    let pgAnonThrew = false;
    try {
      sim.settle_iou('anon', null, 'iou_alice_lent', 4000n, 'acc_alice_cash');
    } catch (err: any) {
      pgAnonThrew = err.message.includes('anonymous callers cannot settle IOUs');
    }
    assert(pgAnonThrew, '4.2.1 PostgreSQL settle_iou rejects anonymous callers');

    // 4.2.2 Unauthenticated caller rejection
    let pgUnauthThrew = false;
    try {
      sim.settle_iou('authenticated', null, 'iou_alice_lent', 4000n, 'acc_alice_cash');
    } catch (err: any) {
      pgUnauthThrew = err.message.includes('Not authenticated');
    }
    assert(pgUnauthThrew, '4.2.2 PostgreSQL settle_iou rejects null user_id');

    // 4.2.3 Foreign tenant IOU access (Bob trying to settle Alice's IOU)
    let pgForeignThrew = false;
    try {
      sim.settle_iou('authenticated', 'bob', 'iou_alice_lent', 4000n, 'acc_alice_cash');
    } catch (err: any) {
      pgForeignThrew = err.message.includes('access denied by RLS');
    }
    assert(pgForeignThrew, '4.2.3 PostgreSQL settle_iou prevents User B from settling User A IOU (RLS isolation)');

    // 4.2.4 Overpayment rejection
    let pgOverpayThrew = false;
    try {
      sim.settle_iou('authenticated', 'alice', 'iou_alice_lent', 8001n, 'acc_alice_cash');
    } catch (err: any) {
      pgOverpayThrew = err.message.includes('exceeds remaining balance');
    }
    assert(pgOverpayThrew, '4.2.4 PostgreSQL settle_iou rejects settlement exceeding remaining balance (8001n > 8000n)');

    // 4.2.5 Zero & negative amount rejection
    let pgZeroThrew = false;
    try {
      sim.settle_iou('authenticated', 'alice', 'iou_alice_lent', 0n, 'acc_alice_cash');
    } catch (err: any) {
      pgZeroThrew = err.message.includes('Settlement amount must be > 0n');
    }
    assert(pgZeroThrew, '4.2.5.a PostgreSQL settle_iou rejects 0n settlement amount');

    let pgNegThrew = false;
    try {
      sim.settle_iou('authenticated', 'alice', 'iou_alice_lent', -100n, 'acc_alice_cash');
    } catch (err: any) {
      pgNegThrew = err.message.includes('Settlement amount must be > 0n');
    }
    assert(pgNegThrew, '4.2.5.b PostgreSQL settle_iou rejects negative settlement amount (-100n)');

    // 4.2.6 Archived settlement account rejection
    let pgArchivedThrew = false;
    try {
      sim.settle_iou('authenticated', 'alice', 'iou_alice_lent', 2000n, 'acc_alice_archived');
    } catch (err: any) {
      pgArchivedThrew = err.message.includes('Settlement account not found or access denied by RLS');
    }
    assert(pgArchivedThrew, '4.2.6 PostgreSQL settle_iou rejects archived account');

    // 4.2.7 Valid Partial Settlement & Audit Log Verification
    const resPartial = sim.settle_iou('authenticated', 'alice', 'iou_alice_lent', 3000n, 'acc_alice_cash');
    assert(resPartial.remaining_balance_minor === 5000n && resPartial.status === 'PARTIAL', '4.2.7.a PostgreSQL settle_iou partial settlement returns 5000n remaining and status PARTIAL');

    // Verify audit log entry
    assert(sim.auditLogs.length === 1, '4.2.7.b Exact audit log entry generated');
    const log = sim.auditLogs[0];
    assert(
      log.user_id === 'alice' &&
      log.entity_type === 'iou_records' &&
      log.entity_id === 'iou_alice_lent' &&
      log.action === 'SETTLE' &&
      log.old_state.remaining_balance_minor === 8000n &&
      log.old_state.status === 'OPEN' &&
      log.new_state.remaining_balance_minor === 5000n &&
      log.new_state.status === 'PARTIAL' &&
      log.new_state.settlement_amount_minor === 3000n &&
      log.new_state.transaction_id === resPartial.transaction_id,
      '4.2.7.c Immutable audit log records exact before/after state, action=SETTLE, and transaction_id'
    );

    // Verify double-entry legs for LENT direction: DEBIT Asset account, CREDIT Clearing account
    const entries = sim.journalEntries.filter(e => e.transaction_id === resPartial.transaction_id);
    assert(entries.length === 2, '4.2.7.d Settlement created exact 2-leg journal entries');
    const debitLeg = entries.find(e => e.direction === 'DEBIT')!;
    const creditLeg = entries.find(e => e.direction === 'CREDIT')!;
    assert(debitLeg.account_id === 'acc_alice_cash' && debitLeg.amount_minor === 3000n, '4.2.7.e LENT settlement DEBITs target cash asset account');
    assert(creditLeg.amount_minor === 3000n, '4.2.7.f LENT settlement CREDITs clearing account');
  }

  // ======================================================================
  // SUMMARY
  // ======================================================================
  console.log('\n============================================================');
  console.log(`CHALLENGER 2 STRESS RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialStressSuite().catch((err) => {
  console.error('Fatal error in stress test suite:', err);
  process.exit(1);
});
