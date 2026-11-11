/**
 * FinVault Milestone 3 Challenger 1 Deep Adversarial Stress Test Suite
 * Agent: Challenger 1 (challenger_m3_iter2_1)
 *
 * Scope:
 * 1. iOS Keychain 1024-byte Chunking Adapter (apps/mobile/src/lib/supabase/secure-store-adapter.ts)
 *    - Real code execution with MockSecureStore enforcing 2048-byte iOS Keychain limit
 *    - Small (< 1KB), boundary (1024B, 1025B, 2048B), medium (2KB - 8KB OAuth sessions), large (10KB - 100KB)
 *    - 100KB max safeguard rejection
 *    - Dynamic stale chunk cleanup on shrink (multi-chunk -> fewer chunks, multi-chunk -> unchunked)
 *    - Incomplete / corrupted chunk detection
 *    - Legacy unchunked backward compatibility & removeItem cleanup
 * 2. Double-Entry Lite Ledger Invariants & 64-bit BigInt Precision (> 2^53 - 1)
 *    - Lossless 64-bit BigInt precision up to Int64 Max (9,223,372,036,854,775,807n)
 *    - Double-entry balance invariant SUM(debits) === SUM(credits) under 1-paise discrepancy attack
 *    - Dynamic IOU Clearing contra account provisioning without Opening Balance Equity pollution
 *    - Edge Function sync-reconcile double-entry enforcement
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  initDatabase,
  getAccounts,
  postTransaction,
  settleIOU,
  NodeSQLiteAdapter,
  OutboxQueueManager,
  validateTransactionBalance,
  computeAccountBalanceDelta
} from '../../packages/sync-engine/src/index.ts';

// Direct import of production mobile adapter (intercepted via secure-store-loader)
import { ExpoSecureStoreAdapter } from '../../apps/mobile/src/lib/supabase/secure-store-adapter.ts';
import { mockStorage, resetMockStorage, KEYCHAIN_LIMIT } from './mock-secure-store.mjs';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}${details ? ': ' + details : ''}`);
  }
}

async function runDeepStressTests(): Promise<void> {
  console.log('============================================================');
  console.log('CHALLENGER 1: KEYCHAIN CHUNKING & BIGINT LEDGER STRESS PROBE');
  console.log('============================================================\n');

  // =========================================================================
  // SECTION 1: IOS KEYCHAIN 1024-BYTE CHUNKING ADAPTER STRESS
  // =========================================================================
  console.log('--- SECTION 1: iOS Keychain 1024-Byte Chunking Adapter Stress ---');

  // 1.1 Small Payloads (< 1024 Bytes)
  {
    resetMockStorage();

    // Empty payload
    await ExpoSecureStoreAdapter.setItem('k_empty', '');
    assert(mockStorage.has('k_empty'), '1.1.1 Empty string stored at direct key');
    assert(!mockStorage.has('k_empty_chunks'), '1.1.2 Empty string does not generate chunk metadata');
    assert(await ExpoSecureStoreAdapter.getItem('k_empty') === '', '1.1.3 Empty string round-trips cleanly');

    // 1-byte payload
    await ExpoSecureStoreAdapter.setItem('k_1byte', 'Z');
    assert(mockStorage.has('k_1byte') && !mockStorage.has('k_1byte_chunks'), '1.1.4 1-byte stored directly unchunked');
    assert(await ExpoSecureStoreAdapter.getItem('k_1byte') === 'Z', '1.1.5 1-byte round-trips cleanly');

    // 500-byte payload
    const str500 = 'X'.repeat(500);
    await ExpoSecureStoreAdapter.setItem('k_500', str500);
    assert(mockStorage.has('k_500') && !mockStorage.has('k_500_chunks'), '1.1.6 500 bytes stored directly unchunked');
    assert(await ExpoSecureStoreAdapter.getItem('k_500') === str500, '1.1.7 500 bytes round-trips losslessly');

    // 1023-byte payload
    const str1023 = 'Y'.repeat(1023);
    await ExpoSecureStoreAdapter.setItem('k_1023', str1023);
    assert(mockStorage.has('k_1023') && !mockStorage.has('k_1023_chunks'), '1.1.8 1023 bytes stored directly unchunked');
    assert(await ExpoSecureStoreAdapter.getItem('k_1023') === str1023, '1.1.9 1023 bytes round-trips losslessly');
  }

  // 1.2 Boundary Payloads (1024, 1025, 2048, 2049)
  {
    resetMockStorage();

    // Exact 1024 bytes (1 chunk -> stored unchunked)
    const str1024 = 'A'.repeat(1024);
    await ExpoSecureStoreAdapter.setItem('k_1024', str1024);
    assert(mockStorage.has('k_1024'), '1.2.1 1024 bytes boundary stored directly at key');
    assert(!mockStorage.has('k_1024_chunks'), '1.2.2 1024 bytes does not generate chunk metadata');
    assert(await ExpoSecureStoreAdapter.getItem('k_1024') === str1024, '1.2.3 1024 bytes retrieved losslessly');

    // 1025 bytes (2 chunks)
    const str1025 = 'B'.repeat(1024) + '!';
    await ExpoSecureStoreAdapter.setItem('k_1025', str1025);
    assert(!mockStorage.has('k_1025'), '1.2.4 Direct key removed for 1025-byte chunked payload');
    assert(mockStorage.get('k_1025_chunks') === '2', '1.2.5 k_1025_chunks metadata equals 2');
    assert(mockStorage.get('k_1025_chunk_0')?.length === 1024, '1.2.6 chunk_0 is exact 1024 bytes');
    assert(mockStorage.get('k_1025_chunk_1') === '!', '1.2.7 chunk_1 is remaining 1 byte');
    assert(await ExpoSecureStoreAdapter.getItem('k_1025') === str1025, '1.2.8 1025 bytes retrieved losslessly');

    // 2048 bytes (exact Keychain limit without chunking; with 1024B chunking -> 2 full chunks)
    const str2048 = 'C'.repeat(2048);
    await ExpoSecureStoreAdapter.setItem('k_2048', str2048);
    assert(mockStorage.get('k_2048_chunks') === '2', '1.2.9 2048 bytes chunked into 2 chunks');
    assert(mockStorage.get('k_2048_chunk_0')?.length === 1024, '1.2.10 chunk 0 is 1024 bytes');
    assert(mockStorage.get('k_2048_chunk_1')?.length === 1024, '1.2.11 chunk 1 is 1024 bytes');
    assert(await ExpoSecureStoreAdapter.getItem('k_2048') === str2048, '1.2.12 2048 bytes retrieved losslessly');

    // 2049 bytes (3 chunks: 1024, 1024, 1)
    const str2049 = 'D'.repeat(2048) + '#';
    await ExpoSecureStoreAdapter.setItem('k_2049', str2049);
    assert(mockStorage.get('k_2049_chunks') === '3', '1.2.13 2049 bytes chunked into 3 chunks');
    assert(mockStorage.get('k_2049_chunk_2') === '#', '1.2.14 chunk 2 is 1 byte');
    assert(await ExpoSecureStoreAdapter.getItem('k_2049') === str2049, '1.2.15 2049 bytes retrieved losslessly');
  }

  // 1.3 Medium Payloads (2KB - 8KB, Realistic Google OAuth Sessions)
  {
    resetMockStorage();

    // Typical Google OAuth Session: access_token (~2KB) + id_token (~1KB) + refresh_token + profile
    const oauthSession = JSON.stringify({
      access_token: 'ya29.a0AfH6SM' + 'x'.repeat(1800),
      refresh_token: '1//0g' + 'y'.repeat(450),
      id_token: 'eyJhbGciOiJSUzI1NiIs' + 'z'.repeat(1200),
      token_type: 'Bearer',
      expires_in: 3599,
      user: {
        id: '1098234710293847',
        email: 'user.testing.finvault@gmail.com',
        verified_email: true,
        name: 'FinVault Beta Tester',
        given_name: 'FinVault',
        family_name: 'Tester',
        picture: 'https://lh3.googleusercontent.com/a/ACg8oc' + 'p'.repeat(120)
      }
    });

    const byteLen = Buffer.byteLength(oauthSession, 'utf8');
    assert(byteLen >= 3500 && byteLen <= 5000, `1.3.1 Realistic OAuth session payload size: ${byteLen} bytes`);

    // Verify raw direct setItemAsync would violate Keychain 2048 limit:
    let directExceeded = false;
    try {
      const { setItemAsync } = await import('./mock-secure-store.mjs');
      await setItemAsync('raw_oauth', oauthSession);
    } catch {
      directExceeded = true;
    }
    assert(directExceeded, '1.3.2 Raw unchunked write of OAuth session strictly violates 2048B Keychain limit');

    // ExpoSecureStoreAdapter must safely handle it:
    await ExpoSecureStoreAdapter.setItem('supabase.auth.token', oauthSession);
    const expectedChunks = Math.ceil(byteLen / 1024);
    assert(mockStorage.get('supabase.auth.token_chunks') === expectedChunks.toString(), `1.3.3 Stored across exactly ${expectedChunks} chunks`);

    // Verify each chunk is <= 1024 bytes (well within Keychain 2048B limit)
    let allChunksSafe = true;
    for (let i = 0; i < expectedChunks; i++) {
      const chunk = mockStorage.get(`supabase.auth.token_chunk_${i}`) || '';
      if (Buffer.byteLength(chunk, 'utf8') > 1024) {
        allChunksSafe = false;
        break;
      }
    }
    assert(allChunksSafe, '1.3.4 Every individual chunk is <= 1024 bytes');

    // Retrieve and verify bit-for-bit equality
    const retrievedSession = await ExpoSecureStoreAdapter.getItem('supabase.auth.token');
    assert(retrievedSession === oauthSession, '1.3.5 OAuth session reconstructed losslessly without data corruption');

    const parsed = JSON.parse(retrievedSession!);
    assert(parsed.user.email === 'user.testing.finvault@gmail.com', '1.3.6 Reconstructed session parses back to valid JSON');
  }

  // 1.4 Large Payloads (10KB - 100KB)
  {
    resetMockStorage();

    const sizes = [
      { label: '10KB', len: 10 * 1024 },
      { label: '25KB', len: 25 * 1024 },
      { label: '50KB', len: 50 * 1024 },
      { label: '95KB', len: 95 * 1024 },
      { label: '100KB (Max Boundary)', len: 100 * 1024 }
    ];

    for (const s of sizes) {
      const data = crypto.randomBytes(s.len).toString('hex').substring(0, s.len);
      const key = `key_${s.label}`;
      await ExpoSecureStoreAdapter.setItem(key, data);

      const expectedChunks = Math.ceil(s.len / 1024);
      assert(mockStorage.get(`${key}_chunks`) === expectedChunks.toString(), `1.4.${s.label} stored in ${expectedChunks} chunks`);

      const retrieved = await ExpoSecureStoreAdapter.getItem(key);
      assert(retrieved?.length === s.len, `1.4.${s.label} retrieved length matches exact ${s.len} bytes`);
      assert(retrieved === data, `1.4.${s.label} exact bit-for-bit content verification`);
    }
  }

  // 1.5 Safeguard & Boundary Protection (> 100KB)
  {
    resetMockStorage();

    // 100KB + 1 byte (102,401 bytes)
    const over100KB = 'W'.repeat(100 * 1024 + 1);
    let threwOver100KB = false;
    let errMsg = '';
    try {
      await ExpoSecureStoreAdapter.setItem('over_100kb', over100KB);
    } catch (err: any) {
      threwOver100KB = true;
      errMsg = err.message;
    }
    assert(threwOver100KB, '1.5.1 setItem rejects payload exceeding 100KB (102,401 bytes)');
    assert(errMsg.includes('maximum allowed session size of 102400 bytes'), '1.5.2 Error identifies maximum allowed size');
    assert(!mockStorage.has('over_100kb'), '1.5.3 Rejected write leaves no orphaned storage keys');

    // 150KB runaway payload
    const huge150KB = 'H'.repeat(150 * 1024);
    let threw150KB = false;
    try {
      await ExpoSecureStoreAdapter.setItem('huge_150kb', huge150KB);
    } catch {
      threw150KB = true;
    }
    assert(threw150KB, '1.5.4 150KB runaway payload strictly blocked');
  }

  // 1.6 Stale Chunk Cleanup on Payload Shrinking & Growing
  {
    resetMockStorage();
    const testKey = 'dynamic_shrink_key';

    // Step 1: Write 15KB (15 chunks: _chunk_0 .. _chunk_14)
    const str15KB = '15K_'.repeat(15 * 256); // 15360 bytes -> 15 chunks
    await ExpoSecureStoreAdapter.setItem(testKey, str15KB);
    assert(mockStorage.get(`${testKey}_chunks`) === '15', '1.6.1 Initial state: 15 chunks created');
    assert(mockStorage.has(`${testKey}_chunk_14`), '1.6.2 chunk 14 exists');

    // Step 2: Overwrite with 4KB (4 chunks: _chunk_0 .. _chunk_3)
    const str4KB = '4K__'.repeat(1024); // 4096 bytes -> 4 chunks
    await ExpoSecureStoreAdapter.setItem(testKey, str4KB);
    assert(mockStorage.get(`${testKey}_chunks`) === '4', '1.6.3 Chunks metadata updated to 4');
    assert(mockStorage.has(`${testKey}_chunk_0`) && mockStorage.has(`${testKey}_chunk_3`), '1.6.4 Chunks 0..3 exist');

    // Verify stale chunks 4..14 are DELETED
    let staleCleaned = true;
    for (let i = 4; i < 15; i++) {
      if (mockStorage.has(`${testKey}_chunk_${i}`)) {
        staleCleaned = false;
        break;
      }
    }
    assert(staleCleaned, '1.6.5 All stale chunks 4..14 cleaned up on payload shrink (15 -> 4 chunks)');
    assert(await ExpoSecureStoreAdapter.getItem(testKey) === str4KB, '1.6.6 Shrunk value retrieved cleanly');

    // Step 3: Overwrite with 500 bytes (unchunked single item)
    const str500 = 'SMALL_500_'.repeat(50);
    await ExpoSecureStoreAdapter.setItem(testKey, str500);
    assert(mockStorage.has(testKey), '1.6.7 Stored unchunked at direct key');
    assert(!mockStorage.has(`${testKey}_chunks`), '1.6.8 Metadata _chunks removed');
    assert(!mockStorage.has(`${testKey}_chunk_0`) && !mockStorage.has(`${testKey}_chunk_3`), '1.6.9 Chunks 0..3 completely purged');
    assert(await ExpoSecureStoreAdapter.getItem(testKey) === str500, '1.6.10 Unchunked value retrieved cleanly');

    // Step 4: Expand from unchunked to 12KB (12 chunks)
    const str12KB = '12KB'.repeat(3072);
    await ExpoSecureStoreAdapter.setItem(testKey, str12KB);
    assert(!mockStorage.has(testKey), '1.6.11 Direct key removed upon expanding to chunks');
    assert(mockStorage.get(`${testKey}_chunks`) === '12', '1.6.12 Metadata set to 12 chunks');
    assert(mockStorage.has(`${testKey}_chunk_11`), '1.6.13 Chunk 11 exists');
    assert(await ExpoSecureStoreAdapter.getItem(testKey) === str12KB, '1.6.14 Expanded 12KB payload retrieved losslessly');
  }

  // 1.7 Corrupted / Incomplete Chunk Handling
  {
    resetMockStorage();
    const cKey = 'corrupt_test_key';
    const cData = 'DATA_FOR_CHUNKS_'.repeat(200); // 3200 bytes -> 4 chunks
    await ExpoSecureStoreAdapter.setItem(cKey, cData);
    assert(mockStorage.get(`${cKey}_chunks`) === '4', '1.7.1 4 chunks written');

    // Simulate Keychain corruption: chunk 2 was evicted or lost
    mockStorage.delete(`${cKey}_chunk_2`);

    const result = await ExpoSecureStoreAdapter.getItem(cKey);
    assert(result === null, '1.7.2 Missing chunk causes getItem to return null safely instead of truncated data');
  }

  // 1.8 Backward Compatibility with Pre-existing Legacy Unchunked Keys
  {
    resetMockStorage();
    const legacyKey = 'legacy_session_token';
    const legacyVal = 'legacy_token_value_abc123';
    // Directly set in storage without _chunks metadata (simulating old app version data)
    mockStorage.set(legacyKey, legacyVal);

    const retrievedLegacy = await ExpoSecureStoreAdapter.getItem(legacyKey);
    assert(retrievedLegacy === legacyVal, '1.8.1 Pre-existing unchunked legacy key retrieved seamlessly');
  }

  // 1.9 removeItem Complete Purge
  {
    resetMockStorage();
    const rKey = 'remove_target_key';
    await ExpoSecureStoreAdapter.setItem(rKey, 'PURGE_'.repeat(1000)); // ~6KB
    assert(mockStorage.has(`${rKey}_chunks`), '1.9.1 Multi-chunk stored');

    await ExpoSecureStoreAdapter.removeItem(rKey);
    assert(!mockStorage.has(rKey), '1.9.2 Direct key removed');
    assert(!mockStorage.has(`${rKey}_chunks`), '1.9.3 Metadata _chunks removed');
    assert(!mockStorage.has(`${rKey}_chunk_0`), '1.9.4 Chunk 0 removed');
    assert(!mockStorage.has(`${rKey}_chunk_5`), '1.9.5 Chunk 5 removed');
    assert(await ExpoSecureStoreAdapter.getItem(rKey) === null, '1.9.6 getItem returns null after removeItem');
  }

  console.log();

  // =========================================================================
  // SECTION 2: DOUBLE-ENTRY LEDGER INVARIANTS & 64-BIT BIGINT PRECISION
  // =========================================================================
  console.log('--- SECTION 2: Double-Entry Ledger Invariants & 64-Bit BigInt Precision ---');

  const MAX_SAFE_INT = 9007199254740991n; // 2^53 - 1
  const INT64_MAX = 9223372036854775807n; // 2^63 - 1
  const INT64_MIN = -9223372036854775808n;

  // 2.1 Full Spectrum BigInt Precision in NodeSQLiteAdapter (> 2^53 - 1)
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    const testValues: bigint[] = [
      0n,
      1n,
      MAX_SAFE_INT,
      MAX_SAFE_INT + 1n,
      MAX_SAFE_INT + 17n,
      100000000000000000n, // 10^17
      1152921504606846976n, // 2^60
      4611686018427387904n, // 2^62
      INT64_MAX - 1n,
      INT64_MAX
    ];

    await adapter.run('CREATE TABLE bigint_verify (id TEXT PRIMARY KEY, amt INTEGER)');

    for (let i = 0; i < testValues.length; i++) {
      const val = testValues[i]!;
      await adapter.run('INSERT INTO bigint_verify (id, amt) VALUES (?, ?)', [`row_${i}`, val]);
      const retrieved = adapter.queryOne<{ id: string; amt: bigint }>('SELECT * FROM bigint_verify WHERE id = ?', [`row_${i}`]);
      assert(typeof retrieved?.amt === 'bigint', `2.1.${i} Retrieved amount is native BigInt`);
      assert(retrieved?.amt === val, `2.1.${i}b Exact value match: ${retrieved?.amt} === ${val}`);
    }

    adapter.close();
  }

  // 2.2 postTransaction at Int64 Max with Atomic Balance Progression
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    const uid = 'u_bigint_ledger';
    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES ('acc_asset_max', ?, 'Vault Cash', 'ASSET', 'INR', 0, '2026-11-09', '2026-11-09'),
              ('acc_equity_max', ?, 'Capital Fund', 'EQUITY', 'INR', 0, '2026-11-09', '2026-11-09')`,
      [uid, uid]
    );

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    const tx = await txOps.postTransaction({
      idempotency_key: 'bigint_tx_int64_max',
      transaction_date: '2026-11-09',
      description: 'Capitalization at 64-bit Int64 Max',
      entries: [
        { account_id: 'acc_asset_max', amount_minor: INT64_MAX, direction: 'DEBIT' },
        { account_id: 'acc_equity_max', amount_minor: INT64_MAX, direction: 'CREDIT' }
      ]
    }, uid);

    assert(Boolean(tx.id), '2.2.1 Transaction posted at Int64 Max');

    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const accounts = await accountsOps.getAccounts(uid);
    const asset = accounts.find(a => a.id === 'acc_asset_max')!;
    const equity = accounts.find(a => a.id === 'acc_equity_max')!;

    assert(asset.balance_minor === INT64_MAX, '2.2.2 Asset balance updated to exact INT64_MAX');
    assert(equity.balance_minor === INT64_MAX, '2.2.3 Equity balance updated to exact INT64_MAX');

    // Fundamental Accounting Equation: Assets (INT64_MAX) === Liabilities (0) + Equity (INT64_MAX)
    assert(asset.balance_minor === equity.balance_minor, '2.2.4 Accounting equation preserved: Assets === Liabilities + Equity');

    adapter.close();
  }

  // 2.3 50-Leg Multi-Split Transaction Beyond 2^53 - 1
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    const uid = 'u_50leg';
    const numLegs = 25; // 25 debits + 25 credits = 50 legs
    const debitAccounts: string[] = [];
    const creditAccounts: string[] = [];

    for (let i = 0; i < numLegs; i++) {
      const dId = `acc_deb_${i}`;
      const cId = `acc_cred_${i}`;
      debitAccounts.push(dId);
      creditAccounts.push(cId);

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
         VALUES (?, ?, ?, 'EXPENSE', 'INR', 0, '2026-11-09', '2026-11-09'),
                (?, ?, ?, 'INCOME', 'INR', 0, '2026-11-09', '2026-11-09')`,
        [dId, uid, `Expense ${i}`, cId, uid, `Income ${i}`]
      );
    }

    // Generate 25 distinct BigInt amounts > 2^53 - 1
    const baseBigInt = 900719925474099200n; // ~90 Quadrillion paise
    const legAmounts: bigint[] = [];
    let sumTotal = 0n;

    for (let i = 0; i < numLegs; i++) {
      const legAmt = baseBigInt + BigInt(i * 1234567);
      legAmounts.push(legAmt);
      sumTotal += legAmt;
    }

    const entries: Array<{ account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }> = [];
    for (let i = 0; i < numLegs; i++) {
      entries.push({ account_id: debitAccounts[i]!, amount_minor: legAmounts[i]!, direction: 'DEBIT' });
      entries.push({ account_id: creditAccounts[i]!, amount_minor: legAmounts[i]!, direction: 'CREDIT' });
    }

    assert(entries.length === 50, '2.3.1 Constructed 50-leg balanced transaction');

    const txOps = new (await import('../../packages/sync-engine/src/operations/transactions.ts')).TransactionsOperations(adapter);
    const multiTx = await txOps.postTransaction({
      idempotency_key: '50_leg_huge_split_key',
      transaction_date: '2026-11-09',
      description: '50-Leg Corporate Settlement',
      entries
    }, uid);

    assert(Boolean(multiTx.id), '2.3.2 50-leg transaction committed atomically');

    // Verify all 50 accounts updated with exact BigInt amounts
    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const accs = await accountsOps.getAccounts(uid);

    let allLegsAccurate = true;
    for (let i = 0; i < numLegs; i++) {
      const debAcc = accs.find(a => a.id === debitAccounts[i]!);
      const credAcc = accs.find(a => a.id === creditAccounts[i]!);
      if (debAcc?.balance_minor !== legAmounts[i]! || credAcc?.balance_minor !== legAmounts[i]!) {
        allLegsAccurate = false;
        break;
      }
    }
    assert(allLegsAccurate, '2.3.3 All 50 account balances reflect exact BigInt allocations');

    adapter.close();
  }

  // 2.4 Double-Entry Invariant: 1-Paise Discrepancy Strict Rejection
  {
    const dAmt = 900719925474099200n;
    const cAmt = dAmt - 1n; // Off-by-1 paise

    let threw = false;
    let errText = '';
    try {
      validateTransactionBalance([
        { amount_minor: dAmt, direction: 'DEBIT' },
        { amount_minor: cAmt, direction: 'CREDIT' }
      ]);
    } catch (e: any) {
      threw = true;
      errText = e.message;
    }
    assert(threw, '2.4.1 validateTransactionBalance strictly catches 1-paise discrepancy');
    assert(errText.includes('Double-entry invariant violated: debits'), '2.4.2 Error message identifies balance mismatch');
  }

  // 2.5 Dynamic IOU Clearing Contra Account Creation without Equity Pollution
  {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);

    const uid = 'u_iou_equity_check';
    const bankId = 'acc_iou_bank_clean';
    const equityId = 'acc_opening_balance_equity';

    // Seed checking account and Opening Balance Equity
    await adapter.run(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at)
       VALUES (?, ?, 'Checking Account', 'ASSET', 'INR', ?, '2026-11-09', '2026-11-09'),
              (?, ?, 'Opening Balance Equity', 'EQUITY', 'INR', ?, '2026-11-09', '2026-11-09')`,
      [bankId, uid, 100000000000000000n, equityId, uid, 0n]
    );

    // Create a BORROWED IOU
    const borrowedPrincipal = 50000000000000000n; // 50 Quadrillion paise (> 2^53 - 1)
    await adapter.run(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_borrowed_huge', ?, 'Venture Lender', 'BORROWED', ?, ?, 'INR', 'OPEN', 0, '2026-11-09', '2026-11-09', 1)`,
      [uid, borrowedPrincipal, borrowedPrincipal]
    );

    const iouOps = new (await import('../../packages/sync-engine/src/operations/ious.ts')).IOUsOperations(adapter);
    const settleRes = await iouOps.settleIOU('iou_borrowed_huge', borrowedPrincipal, bankId, uid);

    assert(settleRes.iou.status === 'SETTLED', '2.5.1 IOU settled cleanly');

    const accountsOps = new (await import('../../packages/sync-engine/src/operations/accounts.ts')).AccountsOperations(adapter);
    const postAccounts = await accountsOps.getAccounts(uid);

    // Verify Opening Balance Equity was NOT touched (stays 0n)
    const equityAcc = postAccounts.find(a => a.name === 'Opening Balance Equity')!;
    assert(equityAcc.balance_minor === 0n, '2.5.2 Opening Balance Equity was untouched (balance strictly 0n)');

    // Verify dynamic "IOU Clearing" account was created with type LIABILITY for BORROWED
    const clearingAcc = postAccounts.find(a => a.name === 'IOU Clearing')!;
    assert(Boolean(clearingAcc), '2.5.3 Dynamic IOU Clearing contra account created');
    assert(clearingAcc.type === 'LIABILITY', '2.5.4 IOU Clearing account has type LIABILITY for BORROWED debt');

    adapter.close();
  }

  // 2.6 Edge Function sync-reconcile Double-Entry Mutation Validation
  {
    // Reconcile logic simulation mirroring index.ts
    function reconcileMutations(mutations: any[]) {
      const appliedIds: string[] = [];
      const conflicts: { mutationId: string; reason: string }[] = [];
      const errors: string[] = [];

      for (const m of mutations) {
        try {
          const parsedPayload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;
          if ((m.table_name === 'transactions' || m.table_name === 'transaction') && m.operation === 'INSERT') {
            if (!parsedPayload || typeof parsedPayload !== 'object') {
              conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation: missing or invalid transaction payload' });
              continue;
            }
            const entries = parsedPayload.entries;
            if (!entries || !Array.isArray(entries) || entries.length < 2) {
              conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation: transaction must contain at least two journal entries' });
              continue;
            }
            let debits = 0n;
            let credits = 0n;
            let hasConflict = false;
            for (const e of entries) {
              if (!e || typeof e !== 'object') {
                conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation: journal entry must be a valid object' });
                hasConflict = true;
                break;
              }
              if (!e.account_id || typeof e.account_id !== 'string' || e.account_id.trim() === '') {
                conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation: journal entry missing valid account_id' });
                hasConflict = true;
                break;
              }
              if (e.direction !== 'DEBIT' && e.direction !== 'CREDIT') {
                conflicts.push({ mutationId: m.id, reason: `Double-entry balance violation: invalid entry direction "${e.direction}"` });
                hasConflict = true;
                break;
              }
              if (e.amount_minor === undefined || e.amount_minor === null) {
                conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation: journal entry missing amount_minor' });
                hasConflict = true;
                break;
              }
              if (typeof e.amount_minor === 'number' && !Number.isInteger(e.amount_minor)) {
                throw new Error(`Floating-point monetary amounts are prohibited: ${e.amount_minor}`);
              }
              const amount = BigInt(e.amount_minor);
              if (amount <= 0n) throw new Error('Entry amount must be > 0');
              if (e.direction === 'DEBIT') debits += amount;
              else if (e.direction === 'CREDIT') credits += amount;
            }
            if (hasConflict) continue;
            if (debits === 0n || credits === 0n) {
              conflicts.push({ mutationId: m.id, reason: `Double-entry balance violation: missing debit or credit leg` });
              continue;
            }
            if (debits !== credits) {
              conflicts.push({ mutationId: m.id, reason: 'Double-entry balance violation' });
              continue;
            }
          }
          appliedIds.push(m.id);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Mutation ${m.id} failed: ${msg}`);
        }
      }
      return { appliedIds, conflicts, errors };
    }

    // 1. Valid 2-leg BigInt transaction
    const r1 = reconcileMutations([{
      id: 'm1',
      table_name: 'transactions',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '900719925474099200', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '900719925474099200', direction: 'CREDIT' }
        ]
      }
    }]);
    assert(r1.appliedIds.includes('m1'), '2.6.1 Valid BigInt transaction accepted into appliedIds');

    // 2. Imbalanced transaction (1 paise difference)
    const r2 = reconcileMutations([{
      id: 'm2',
      table_name: 'transactions',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '1000', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '999', direction: 'CREDIT' }
        ]
      }
    }]);
    assert(r2.conflicts.some(c => c.mutationId === 'm2'), '2.6.2 Imbalanced transaction routed to conflicts');
    assert(!r2.appliedIds.includes('m2'), '2.6.3 Imbalanced transaction excluded from appliedIds');

    // 3. Single leg transaction
    const r3 = reconcileMutations([{
      id: 'm3',
      table_name: 'transaction',
      operation: 'INSERT',
      payload: {
        entries: [{ account_id: 'a1', amount_minor: '1000', direction: 'DEBIT' }]
      }
    }]);
    assert(r3.conflicts.some(c => c.mutationId === 'm3'), '2.6.4 Single-leg transaction rejected into conflicts');

    // 4. Non-positive amount
    const r4 = reconcileMutations([{
      id: 'm4',
      table_name: 'transactions',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: '0', direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: '0', direction: 'CREDIT' }
        ]
      }
    }]);
    assert(r4.errors.some(e => e.includes('Entry amount must be > 0')), '2.6.5 Zero amount routed to errors');

    // 5. Floating point amount
    const r5 = reconcileMutations([{
      id: 'm5',
      table_name: 'transactions',
      operation: 'INSERT',
      payload: {
        entries: [
          { account_id: 'a1', amount_minor: 12.5, direction: 'DEBIT' },
          { account_id: 'a2', amount_minor: 12.5, direction: 'CREDIT' }
        ]
      }
    }]);
    assert(r5.errors.some(e => e.includes('Floating-point monetary amounts are prohibited')), '2.6.6 Float amount routed to errors');
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n============================================================');
  console.log('CHALLENGER 1 DEEP STRESS TEST RESULTS');
  console.log('============================================================');
  console.log(`Total Invariant Checks: ${totalTests}`);
  console.log(`Passed:                 ${passedTests}`);
  console.log(`Failed:                 ${failedTests}`);
  console.log(`Success Rate:           ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDeepStressTests().catch(err => {
  console.error('Fatal unhandled error during deep stress test execution:', err);
  process.exit(1);
});
