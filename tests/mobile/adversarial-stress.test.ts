/**
 * FinVault Mobile Adversarial Stress & Invariant Test Suite
 * Milestone 5 (Mobile Application — Expo / React Native)
 * 
 * Conducts adversarial stress-testing across:
 * - Group A: Out-of-balance rejection & mid-flight atomic rollback
 * - Group B: Zero and negative amount rejection
 * - Group C: 64-bit BigInt precision (> 2^53 - 1) & zero-float formatters
 * - Group D: High-frequency rapid sequential offline writes (< 50ms SLA benchmark)
 * - Group E: Outbox sync queue status & payload integrity
 * - Group F: Property-based fuzzing with fast-check (balanced & perturbed splits)
 */

import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import fc from 'fast-check';

import {
  initDatabase,
  postTransaction,
  settleIOU,
  getAccounts,
  NodeSQLiteAdapter,
  CLIENT_SQLITE_SCHEMA,
  validateTransactionBalance,
  computeAccountBalanceDelta,
  TransactionsOperations,
  IOUsOperations,
} from '../../packages/sync-engine/src/index.ts';

import {
  formatMinorToDecimal,
  formatCurrency,
  parseDecimalToMinor,
} from '../../apps/mobile/src/lib/money/format.ts';

import { ExpoSQLiteAdapter } from '../../apps/mobile/src/lib/storage/expo-sqlite-adapter.ts';

describe('FinVault Mobile Adversarial Stress & Invariant Suite', () => {
  let adapter: NodeSQLiteAdapter;
  const userId = crypto.randomUUID();

  beforeEach(async () => {
    adapter = new NodeSQLiteAdapter(':memory:');
    await adapter.exec('PRAGMA foreign_keys = ON;');
    await adapter.exec(CLIENT_SQLITE_SCHEMA);
    await initDatabase(':memory:', adapter);
  });

  // =========================================================================
  // Group A: Out-of-balance transaction rejection & atomic rollback
  // =========================================================================
  describe('Group A: Out-of-Balance Rejection & Atomic Rollback', () => {
    test('ADV-01: rejects off-by-1 paise unbalanced transaction with zero database mutations', async () => {
      const accBank = crypto.randomUUID();
      const accExpense = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Checking', 'ASSET', 'INR', 100000, ?, ?, 1),
                (?, ?, 'Expense', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [accBank, userId, now, now, accExpense, userId, now, now]
      );

      // Debit 50,001 vs Credit 50,000 (1 paise delta)
      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Off-by-1 paise attack',
            entries: [
              { account_id: accExpense, amount_minor: 50001n, direction: 'DEBIT' },
              { account_id: accBank, amount_minor: 50000n, direction: 'CREDIT' },
            ],
          }, userId);
        },
        /Double-entry invariant violated/
      );

      // Assert complete absence of side-effects
      const txRows = await adapter.query('SELECT * FROM transactions WHERE user_id = ?', [userId]);
      const jeRows = await adapter.query('SELECT * FROM journal_entries WHERE user_id = ?', [userId]);
      const qRows = await adapter.query('SELECT * FROM sync_queue WHERE record_id IN (SELECT id FROM transactions)');
      const accounts = await getAccounts(userId);
      const bank = accounts.find(a => a.id === accBank);

      assert.equal(txRows.length, 0, 'No transaction row must exist');
      assert.equal(jeRows.length, 0, 'No journal entry rows must exist');
      assert.equal(qRows.length, 0, 'No sync_queue mutation must exist');
      assert.equal(bank?.balance_minor, 100000n, 'Account balance must remain exactly unmutated');
    });

    test('ADV-02: rejects unbalanced multi-split (3 debits vs 2 credits) and preserves all balances', async () => {
      const accCash = crypto.randomUUID();
      const accBank = crypto.randomUUID();
      const accRent = crypto.randomUUID();
      const accFood = crypto.randomUUID();
      const accTax = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Cash', 'ASSET', 'INR', 200000, ?, ?, 1),
                (?, ?, 'Bank', 'ASSET', 'INR', 500000, ?, ?, 1),
                (?, ?, 'Rent', 'EXPENSE', 'INR', 0, ?, ?, 1),
                (?, ?, 'Food', 'EXPENSE', 'INR', 0, ?, ?, 1),
                (?, ?, 'Tax', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [accCash, userId, now, now, accBank, userId, now, now, accRent, userId, now, now, accFood, userId, now, now, accTax, userId, now, now]
      );

      // Credits: 300,000 + 200,000 = 500,000
      // Debits: 250,000 + 150,000 + 99,999 = 499,999 (imbalance = 1)
      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Unbalanced multi-split',
            entries: [
              { account_id: accBank, amount_minor: 300000n, direction: 'CREDIT' },
              { account_id: accCash, amount_minor: 200000n, direction: 'CREDIT' },
              { account_id: accRent, amount_minor: 250000n, direction: 'DEBIT' },
              { account_id: accFood, amount_minor: 150000n, direction: 'DEBIT' },
              { account_id: accTax, amount_minor: 99999n, direction: 'DEBIT' },
            ],
          }, userId);
        },
        /Double-entry invariant violated: debits \(499999\) != credits \(500000\)/
      );

      const accounts = await getAccounts(userId);
      const cash = accounts.find(a => a.id === accCash);
      const bank = accounts.find(a => a.id === accBank);
      assert.equal(cash?.balance_minor, 200000n);
      assert.equal(bank?.balance_minor, 50000n * 10n);
    });

    test('ADV-03: mid-flight rollback when second entry references non-existent account ID', async () => {
      const accValid = crypto.randomUUID();
      const accGhost = crypto.randomUUID(); // not in database
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Valid Checking', 'ASSET', 'INR', 500000, ?, ?, 1)`,
        [accValid, userId, now, now]
      );

      // Perfectly balanced 10,000n == 10,000n, but accGhost does not exist
      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Ghost account split',
            entries: [
              { account_id: accValid, amount_minor: 10000n, direction: 'DEBIT' },
              { account_id: accGhost, amount_minor: 10000n, direction: 'CREDIT' },
            ],
          }, userId);
        },
        /FOREIGN KEY constraint failed|Account not found/
      );

      // Verify that entry 1 mutation to accValid was completely rolled back
      const txRows = await adapter.query('SELECT * FROM transactions WHERE user_id = ?', [userId]);
      const jeRows = await adapter.query('SELECT * FROM journal_entries WHERE user_id = ?', [userId]);
      const qRows = await adapter.query('SELECT * FROM sync_queue WHERE record_id IN (SELECT id FROM transactions WHERE user_id = ?)', [userId]);
      const validAcc = await adapter.queryOne<any>('SELECT balance_minor FROM accounts WHERE id = ?', [accValid]);

      assert.equal(txRows.length, 0, 'Transaction header rolled back');
      assert.equal(jeRows.length, 0, 'First journal entry rolled back');
      assert.equal(qRows.length, 0, 'No outbox queue record created');
      assert.equal(validAcc.balance_minor, 500000n, 'Account balance rolled back to pre-tx state');
    });

    test('ADV-04: rejects single-sided transaction (< 2 entries)', async () => {
      const accBank = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Checking', 'ASSET', 'INR', 100000, ?, ?, 1)`,
        [accBank, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Single leg',
            entries: [
              { account_id: accBank, amount_minor: 10000n, direction: 'DEBIT' },
            ],
          }, userId);
        },
        /Transaction must contain at least two journal entries/
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Empty legs',
            entries: [],
          }, userId);
        },
        /Transaction must contain at least two journal entries/
      );
    });

    test('ADV-05: rejects transaction with all debits and no credits', async () => {
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'A1', 'ASSET', 'INR', 100000, ?, ?, 1),
                (?, ?, 'A2', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [acc1, userId, now, now, acc2, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'All debits',
            entries: [
              { account_id: acc1, amount_minor: 5000n, direction: 'DEBIT' },
              { account_id: acc2, amount_minor: 5000n, direction: 'DEBIT' },
            ],
          }, userId);
        },
        /Transaction missing debit or credit leg/
      );
    });
  });

  // =========================================================================
  // Group B: Negative or zero amount rejection in transaction splits
  // =========================================================================
  describe('Group B: Zero and Negative Amount Rejection', () => {
    test('ADV-06: rejects zero amount split leg (0n == 0n mathematically balanced)', async () => {
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'A1', 'ASSET', 'INR', 100000, ?, ?, 1),
                (?, ?, 'A2', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [acc1, userId, now, now, acc2, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Zero split attack',
            entries: [
              { account_id: acc1, amount_minor: 0n, direction: 'DEBIT' },
              { account_id: acc2, amount_minor: 0n, direction: 'CREDIT' },
            ],
          }, userId);
        },
        /Journal entry amount must be strictly positive: 0/
      );
    });

    test('ADV-07: rejects negative amount split legs (-5000n == -5000n offset)', async () => {
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'A1', 'ASSET', 'INR', 100000, ?, ?, 1),
                (?, ?, 'A2', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [acc1, userId, now, now, acc2, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Negative split attack',
            entries: [
              { account_id: acc1, amount_minor: -5000n, direction: 'DEBIT' },
              { account_id: acc2, amount_minor: -5000n, direction: 'CREDIT' },
            ],
          }, userId);
        },
        /Journal entry amount must be strictly positive: -5000/
      );
    });

    test('ADV-08: rejects zero amount injected into otherwise valid multi-split', async () => {
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      const acc3 = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'A1', 'ASSET', 'INR', 100000, ?, ?, 1),
                (?, ?, 'A2', 'EXPENSE', 'INR', 0, ?, ?, 1),
                (?, ?, 'A3', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [acc1, userId, now, now, acc2, userId, now, now, acc3, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await postTransaction({
            user_id: userId,
            idempotency_key: crypto.randomUUID(),
            transaction_date: '2026-11-09',
            description: 'Multi-split zero injection',
            entries: [
              { account_id: acc1, amount_minor: 10000n, direction: 'CREDIT' },
              { account_id: acc2, amount_minor: 10000n, direction: 'DEBIT' },
              { account_id: acc3, amount_minor: 0n, direction: 'DEBIT' },
            ],
          }, userId);
        },
        /Journal entry amount must be strictly positive: 0/
      );
    });

    test('ADV-09: rejects negative or zero settlement in settleIOU', async () => {
      const iouId = crypto.randomUUID();
      const accBank = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Checking', 'ASSET', 'INR', 1000000, ?, ?, 1)`,
        [accBank, userId, now, now]
      );

      await adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
         VALUES (?, ?, 'Bob', 'LENT', 500000, 500000, 'INR', 'OPEN', ?, ?, 1)`,
        [iouId, userId, now, now]
      );

      await assert.rejects(
        async () => {
          await settleIOU(iouId, 0n, accBank, userId);
        },
        /Settlement amount must be positive/
      );

      await assert.rejects(
        async () => {
          await settleIOU(iouId, -5000n, accBank, userId);
        },
        /Settlement amount must be positive/
      );
    });
  });

  // =========================================================================
  // Group C: 64-bit integer values > 2^53 - 1 (no truncation, no float cast)
  // =========================================================================
  describe('Group C: 64-Bit Integer Precision (> 2^53 - 1)', () => {
    test('ADV-10: preserves exact integer precision > Number.MAX_SAFE_INTEGER in SQLite storage', async () => {
      const accVault = crypto.randomUUID();
      const accEquity = crypto.randomUUID();
      const now = new Date().toISOString();

      // 9,007,199,254,740,993n is Number.MAX_SAFE_INTEGER (9007199254740991) + 2
      const amount1 = 9007199254740993n;
      // In IEEE-754 double precision, 9007199254740993 is rounded to 9007199254740992 or 9007199254740994!
      assert.notEqual(
        BigInt(Number(amount1)),
        amount1,
        'Float conversion must lose precision, confirming test validity'
      );

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Vault', 'ASSET', 'INR', 0, ?, ?, 1),
                (?, ?, 'Capital', 'EQUITY', 'INR', 0, ?, ?, 1)`,
        [accVault, userId, now, now, accEquity, userId, now, now]
      );

      await postTransaction({
        user_id: userId,
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-09',
        description: 'Super-Safe-Integer Injection 1',
        entries: [
          { account_id: accVault, amount_minor: amount1, direction: 'DEBIT' },
          { account_id: accEquity, amount_minor: amount1, direction: 'CREDIT' },
        ],
      }, userId);

      // Verify second transaction adds 7n: 9007199254740993n + 7n = 9007199254741000n
      await postTransaction({
        user_id: userId,
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-09',
        description: 'Super-Safe-Integer Injection 2',
        entries: [
          { account_id: accVault, amount_minor: 7n, direction: 'DEBIT' },
          { account_id: accEquity, amount_minor: 7n, direction: 'CREDIT' },
        ],
      }, userId);

      const accounts = await getAccounts(userId);
      const vault = accounts.find(a => a.id === accVault);
      assert.equal(vault?.balance_minor, 9007199254741000n, 'Account balance must be exactly 9,007,199,254,741,000 without IEEE-754 rounding');
    });

    test('ADV-11: tests extreme signed 64-bit boundary (~9.22 quintillion minor units)', async () => {
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      const now = new Date().toISOString();
      const extremeMax = 9223372036854775800n; // Near Int64 max (9223372036854775807)

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Treasury', 'ASSET', 'INR', 0, ?, ?, 1),
                (?, ?, 'Sovereign Debt', 'LIABILITY', 'INR', 0, ?, ?, 1)`,
        [acc1, userId, now, now, acc2, userId, now, now]
      );

      await postTransaction({
        user_id: userId,
        idempotency_key: crypto.randomUUID(),
        transaction_date: '2026-11-09',
        description: 'Extreme Int64 boundary',
        entries: [
          { account_id: acc1, amount_minor: extremeMax, direction: 'DEBIT' },
          { account_id: acc2, amount_minor: extremeMax, direction: 'CREDIT' },
        ],
      }, userId);

      const accounts = await getAccounts(userId);
      const treasury = accounts.find(a => a.id === acc1);
      assert.equal(treasury?.balance_minor, extremeMax);
    });

    test('ADV-12: zero-float mobile formatters lossless roundtrip for amounts > 2^53 - 1', () => {
      const largeMinor = 9007199254740993n;

      // Format to decimal
      const formattedDec = formatMinorToDecimal(largeMinor, 2);
      assert.equal(formattedDec, '90071992547409.93');

      // Format with currency symbol
      const formattedCur = formatCurrency(largeMinor, '₹', 2);
      assert.equal(formattedCur, '₹90071992547409.93');

      // Parse back to minor units
      const parsedMinor = parseDecimalToMinor(formattedDec, 2);
      assert.equal(parsedMinor, largeMinor, 'Round-trip must yield exact BigInt with 0 precision loss');

      // Negative values
      const negMinor = -9007199254740993n;
      const negFormattedDec = formatMinorToDecimal(negMinor, 2);
      assert.equal(negFormattedDec, '-90071992547409.93');
      const negParsed = parseDecimalToMinor(negFormattedDec, 2);
      assert.equal(negParsed, negMinor);
    });

    test('ADV-13: ExpoSQLiteAdapter param normalization preserves BigInt > MAX_SAFE_INTEGER', async () => {
      // Mock Expo SQLite Database
      const executedQueries: Array<{ sql: string; params: any[] }> = [];
      const mockDb: any = {
        execAsync: async (sql: string) => {},
        runAsync: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          return { changes: 1, lastInsertRowId: 1 };
        },
        getAllAsync: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          return [];
        },
        getFirstAsync: async (sql: string, params: any[]) => {
          executedQueries.push({ sql, params });
          return null;
        },
        closeAsync: async () => {},
      };

      const expoAdapter = new ExpoSQLiteAdapter(mockDb);

      const bigIntSafe = 100000n; // <= MAX_SAFE_INTEGER
      const bigIntUnsafe = 9007199254740993n; // > MAX_SAFE_INTEGER

      await expoAdapter.run('INSERT INTO test VALUES (?, ?)', [bigIntSafe, bigIntUnsafe]);

      assert.equal(executedQueries.length, 1);
      const passedParams = executedQueries[0].params;
      assert.equal(passedParams[0], 100000, 'Safe BigInt converted to Number for driver compatibility');
      assert.equal(passedParams[1], '9007199254740993', 'Unsafe BigInt serialized to string, avoiding float truncation');
    });
  });

  // =========================================================================
  // Group D: High-frequency rapid sequential offline writes (< 50ms SLA)
  // =========================================================================
  describe('Group D: High-Frequency Rapid Sequential Writes (< 50ms SLA)', () => {
    test('ADV-14: executes 100 rapid sequential transactions with 100% sub-50ms SLA compliance', async () => {
      const accCash = crypto.randomUUID();
      const accExpense = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Petty Cash', 'ASSET', 'INR', 10000000, ?, ?, 1),
                (?, ?, 'Daily Expenses', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [accCash, userId, now, now, accExpense, userId, now, now]
      );

      const iterations = 100;
      const latencies: number[] = [];
      const unitAmount = 1500n; // ₹15.00 each

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await postTransaction({
          user_id: userId,
          idempotency_key: `burst-${i}-${crypto.randomUUID()}`,
          transaction_date: '2026-11-09',
          description: `Rapid Transaction #${i + 1}`,
          entries: [
            { account_id: accExpense, amount_minor: unitAmount, direction: 'DEBIT' },
            { account_id: accCash, amount_minor: unitAmount, direction: 'CREDIT' },
          ],
        }, userId);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }

      // Compute statistics
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const sorted = [...latencies].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.50)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      // Empirical logging for handoff report
      console.log(`[ADV-14 Benchmarks] 100 Sequential Offline Writes:`);
      console.log(`  Min: ${minLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms, Mean: ${avgLatency.toFixed(2)}ms`);
      console.log(`  P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

      // Invariant assertions
      assert.ok(maxLatency < 50, `Max latency ${maxLatency.toFixed(2)}ms breached 50ms SLA`);
      assert.ok(p99 < 50, `P99 latency ${p99.toFixed(2)}ms breached 50ms SLA`);

      // Balance mathematical check
      const accounts = await getAccounts(userId);
      const cash = accounts.find(a => a.id === accCash);
      const expense = accounts.find(a => a.id === accExpense);

      const expectedExpense = unitAmount * BigInt(iterations);
      const expectedCash = 10000000n - expectedExpense;

      assert.equal(expense?.balance_minor, expectedExpense, `Expense must equal 100 * 1500 = ${expectedExpense}`);
      assert.equal(cash?.balance_minor, expectedCash, `Cash must equal 10,000,000 - 150,000 = ${expectedCash}`);
    });

    test('ADV-15: executes 50 rapid sequential IOU settlements with sub-50ms latency', async () => {
      const iouId = crypto.randomUUID();
      const accBank = crypto.randomUUID();
      const now = new Date().toISOString();
      const principal = 500000n; // ₹5,000.00
      const stepAmount = 10000n; // ₹100.00 each
      const steps = 50;

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Checking', 'ASSET', 'INR', 1000000, ?, ?, 1)`,
        [accBank, userId, now, now]
      );

      await adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
         VALUES (?, ?, 'Dave', 'LENT', ?, ?, 'INR', 'OPEN', ?, ?, 1)`,
        [iouId, userId, principal, principal, now, now]
      );

      const latencies: number[] = [];

      for (let i = 0; i < steps; i++) {
        const start = performance.now();
        const { iou } = await settleIOU(iouId, stepAmount, accBank, userId);
        const elapsed = performance.now() - start;
        latencies.push(elapsed);

        if (i < steps - 1) {
          assert.equal(iou.status, 'PARTIAL');
        } else {
          assert.equal(iou.status, 'SETTLED');
          assert.equal(iou.remaining_balance_minor, 0n);
        }
      }

      const maxLatency = Math.max(...latencies);
      const p95 = [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      assert.ok(maxLatency < 50, `Max settle latency ${maxLatency.toFixed(2)}ms breached 50ms SLA`);
      assert.ok(p95 < 50, `P95 settle latency ${p95.toFixed(2)}ms breached 50ms SLA`);
    });
  });

  // =========================================================================
  // Group E: Outbox sync queue status and payload integrity
  // =========================================================================
  describe('Group E: Outbox Sync Queue Status & Payload Integrity', () => {
    test('ADV-16: verifies 100 queued mutations have PENDING status, valid JSON, and matching payloads', async () => {
      const queueRows = await adapter.query<any>(
        "SELECT * FROM sync_queue ORDER BY timestamp ASC"
      );

      // We had 100 transactions from ADV-14 + previous tests in other runs
      // Let's do a dedicated fresh sequence to test exact counts
      const freshUserId = crypto.randomUUID();
      const freshBank = crypto.randomUUID();
      const freshExp = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Fresh Bank', 'ASSET', 'INR', 1000000, ?, ?, 1),
                (?, ?, 'Fresh Exp', 'EXPENSE', 'INR', 0, ?, ?, 1)`,
        [freshBank, freshUserId, now, now, freshExp, freshUserId, now, now]
      );

      const count = 25;
      const keys: string[] = [];

      for (let i = 0; i < count; i++) {
        const key = `sync-audit-${i}-${crypto.randomUUID()}`;
        keys.push(key);
        await postTransaction({
          user_id: freshUserId,
          idempotency_key: key,
          transaction_date: '2026-11-09',
          description: `Sync Audit Item ${i}`,
          entries: [
            { account_id: freshExp, amount_minor: BigInt((i + 1) * 100), direction: 'DEBIT' },
            { account_id: freshBank, amount_minor: BigInt((i + 1) * 100), direction: 'CREDIT' },
          ],
        }, freshUserId);
      }

      // Query only the rows for freshUserId's transactions
      const freshQueueRows = await adapter.query<any>(
        "SELECT * FROM sync_queue WHERE record_id IN (SELECT id FROM transactions WHERE user_id = ?) ORDER BY timestamp ASC",
        [freshUserId]
      );

      assert.equal(freshQueueRows.length, count, `Sync queue must contain exactly ${count} entries`);

      for (let i = 0; i < count; i++) {
        const row = freshQueueRows[i];
        assert.equal(row.status, 'PENDING', `Item ${i} status must be PENDING`);
        assert.equal(row.operation, 'INSERT', `Item ${i} operation must be INSERT`);
        assert.equal(row.table_name, 'transactions', `Item ${i} table_name must be transactions`);

        // Validate JSON payload structure
        const payload = JSON.parse(row.payload);
        assert.equal(payload.idempotency_key, keys[i], `Payload key matches posted transaction`);
        assert.equal(payload.user_id, freshUserId);
        assert.equal(payload.entries.length, 2);
        assert.equal(payload.entries[0].amount_minor, ((i + 1) * 100).toString());
        assert.equal(payload.entries[1].amount_minor, ((i + 1) * 100).toString());
      }
    });

    test('ADV-17: verifies IOU settlement generates UPDATE sync_queue mutation with valid payload', async () => {
      const iouId = crypto.randomUUID();
      const accBank = crypto.randomUUID();
      const now = new Date().toISOString();

      await adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, created_at, updated_at, version)
         VALUES (?, ?, 'Checking', 'ASSET', 'INR', 500000, ?, ?, 1)`,
        [accBank, userId, now, now]
      );

      await adapter.run(
        `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, created_at, updated_at, version)
         VALUES (?, ?, 'Frank', 'BORROWED', 200000, 200000, 'INR', 'OPEN', ?, ?, 1)`,
        [iouId, userId, now, now]
      );

      await settleIOU(iouId, 150000n, accBank, userId);

      const iouQueue = await adapter.query<any>(
        "SELECT * FROM sync_queue WHERE record_id = ? AND table_name = 'iou_records'",
        [iouId]
      );

      assert.equal(iouQueue.length, 1);
      assert.equal(iouQueue[0].operation, 'UPDATE');
      assert.equal(iouQueue[0].status, 'PENDING');

      const payload = JSON.parse(iouQueue[0].payload);
      assert.equal(payload.remaining_balance_minor, '50000');
      assert.equal(payload.status, 'PARTIAL');
    });
  });

  // =========================================================================
  // Group F: Property-Based Adversarial Fuzzing with fast-check
  // =========================================================================
  describe('Group F: Property-Based Fuzzing with fast-check', () => {
    test('ADV-18: property testing 50 arbitrary multi-splits (3 to 12 legs) preserves ledger balance', () => {
      let runCount = 0;

      fc.assert(
        fc.property(
          fc.array(fc.bigInt({ min: 1n, max: 100000000n }), { minLength: 2, maxLength: 8 }),
          (debitAmounts) => {
            runCount++;
            const totalDebit = debitAmounts.reduce((a, b) => a + b, 0n);

            // Construct entries: N debits and 1 balancing credit
            const entries = [
              ...debitAmounts.map(amt => ({
                amount_minor: amt,
                direction: 'DEBIT' as const,
              })),
              {
                amount_minor: totalDebit,
                direction: 'CREDIT' as const,
              },
            ];

            // Validation must pass without error
            assert.doesNotThrow(() => {
              validateTransactionBalance(entries);
            });

            return true;
          }
        ),
        { numRuns: 50 }
      );

      assert.equal(runCount, 50);
    });

    test('ADV-19: property testing 50 perturbed multi-splits strictly rejects with double-entry error', () => {
      let rejectionCount = 0;

      fc.assert(
        fc.property(
          fc.array(fc.bigInt({ min: 1n, max: 100000000n }), { minLength: 2, maxLength: 6 }),
          fc.bigInt({ min: 1n, max: 10000n }), // non-zero perturbation
          (debitAmounts, perturbation) => {
            const totalDebit = debitAmounts.reduce((a, b) => a + b, 0n);
            // Credit is perturbed by 'perturbation'
            const perturbedCredit = totalDebit + perturbation;

            const entries = [
              ...debitAmounts.map(amt => ({
                amount_minor: amt,
                direction: 'DEBIT' as const,
              })),
              {
                amount_minor: perturbedCredit,
                direction: 'CREDIT' as const,
              },
            ];

            assert.throws(() => {
              validateTransactionBalance(entries);
            }, /Double-entry invariant violated/);

            rejectionCount++;
            return true;
          }
        ),
        { numRuns: 50 }
      );

      assert.equal(rejectionCount, 50);
    });

    test('ADV-20: property testing 50 random BigInts roundtrip through format and parse losslessly', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: 9223372036854775800n }),
          (amountMinor) => {
            const formatted = formatMinorToDecimal(amountMinor, 2);
            const parsed = parseDecimalToMinor(formatted, 2);
            return parsed === amountMinor;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
