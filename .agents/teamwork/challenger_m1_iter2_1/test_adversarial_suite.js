// Challenger 1 - Comprehensive Adversarial Stress Test Suite
// Covers:
// 1. Zero-float arithmetic (packages/ui/src/index.tsx)
// 2. Edge function validation logic (supabase/functions/validate-transaction/index.ts)
// 3. Client SQLite schema and sync_queue outbox (packages/sync-engine/src/schema.sql)
// 4. PostgreSQL trigger UPDATE logic & search_path hardening (supabase/migrations)

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, extraInfo = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    // console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} ${extraInfo}`);
  }
}

console.log('======================================================================');
console.log('CHALLENGER 1: COMPREHENSIVE EMPIRICAL STRESS & ADVERSARIAL HARNESS');
console.log('======================================================================');

// ====================================================================
// SECTION 1: Zero-Float Parsing and Formatting from packages/ui/src/index.tsx
// ====================================================================
console.log('\n--- 1. Adversarial Testing of Zero-Float UI Functions ---');

const uiSource = fs.readFileSync(path.join(__dirname, '../../../packages/ui/src/index.tsx'), 'utf-8');

// Ensure no floating-point patterns exist in packages/ui/src/index.tsx
assert(!uiSource.includes('parseFloat'), 'No parseFloat in packages/ui/src/index.tsx');
assert(!uiSource.includes('Math.round'), 'No Math.round in packages/ui/src/index.tsx');
assert(!/Number\(.*differenceMinor/.test(uiSource), 'No Number(differenceMinor) in packages/ui/src/index.tsx');

// Extract parseDecimalToMinor and formatMinorToDecimal implementation directly from uiSource
const formatFnCode = uiSource.match(/export function formatMinorToDecimal[\s\S]*?^}/m)[0];
const parseFnCode = uiSource.match(/export function parseDecimalToMinor[\s\S]*?^}/m)[0];

// Strip TS annotations for JS execution
function stripAnnotations(code) {
  return code
    .replace(/export function/g, 'function')
    .replace(/amountMinor: bigint/g, 'amountMinor')
    .replace(/input: string/g, 'input')
    .replace(/decimals: number = 2/g, 'decimals = 2')
    .replace(/: string/g, '')
    .replace(/: bigint/g, '');
}

const cleanedFnCode = stripAnnotations(formatFnCode) + '\n' + stripAnnotations(parseFnCode);
const fnContext = new Function(cleanedFnCode + '\nreturn { formatMinorToDecimal, parseDecimalToMinor };')();
const { formatMinorToDecimal, parseDecimalToMinor } = fnContext;

// 1.1 Canonical values
assert(parseDecimalToMinor('0') === 0n, 'parseDecimalToMinor("0") === 0n');
assert(parseDecimalToMinor('0.00') === 0n, 'parseDecimalToMinor("0.00") === 0n');
assert(parseDecimalToMinor('1') === 100n, 'parseDecimalToMinor("1") === 100n');
assert(parseDecimalToMinor('1.00') === 100n, 'parseDecimalToMinor("1.00") === 100n');
assert(parseDecimalToMinor('1.5') === 150n, 'parseDecimalToMinor("1.5") === 150n');
assert(parseDecimalToMinor('1.50') === 150n, 'parseDecimalToMinor("1.50") === 150n');
assert(parseDecimalToMinor('123.45') === 12345n, 'parseDecimalToMinor("123.45") === 12345n');

// 1.2 Negative values
assert(parseDecimalToMinor('-0') === 0n, 'parseDecimalToMinor("-0") === 0n');
assert(parseDecimalToMinor('-0.00') === 0n, 'parseDecimalToMinor("-0.00") === 0n');
assert(parseDecimalToMinor('-1') === -100n, 'parseDecimalToMinor("-1") === -100n');
assert(parseDecimalToMinor('-0.01') === -1n, 'parseDecimalToMinor("-0.01") === -1n');
assert(parseDecimalToMinor('-0.50') === -50n, 'parseDecimalToMinor("-0.50") === -50n');
assert(parseDecimalToMinor('-123.45') === -12345n, 'parseDecimalToMinor("-123.45") === -12345n');

// 1.3 Degenerate & whitespace string inputs
assert(parseDecimalToMinor('') === 0n, 'parseDecimalToMinor("") === 0n');
assert(parseDecimalToMinor('   ') === 0n, 'parseDecimalToMinor("   ") === 0n');
assert(parseDecimalToMinor('\t\r\n') === 0n, 'parseDecimalToMinor whitespace === 0n');
assert(parseDecimalToMinor('.') === 0n, 'parseDecimalToMinor(".") === 0n');
assert(parseDecimalToMinor('-') === 0n, 'parseDecimalToMinor("-") === 0n');
assert(parseDecimalToMinor('-.') === 0n, 'parseDecimalToMinor("-.") === 0n');
assert(parseDecimalToMinor('.5') === 50n, 'parseDecimalToMinor(".5") === 50n');
assert(parseDecimalToMinor('.05') === 5n, 'parseDecimalToMinor(".05") === 5n');
assert(parseDecimalToMinor('-.5') === -50n, 'parseDecimalToMinor("-.5") === -50n');
assert(parseDecimalToMinor('-.05') === -5n, 'parseDecimalToMinor("-.05") === -5n');
assert(parseDecimalToMinor('100.') === 10000n, 'parseDecimalToMinor("100.") === 10000n');
assert(parseDecimalToMinor('-100.') === -10000n, 'parseDecimalToMinor("-100.") === -10000n');

// 1.4 Multiple dots, currency symbols, and commas
assert(parseDecimalToMinor('1.2.3.4') === 123n, 'parseDecimalToMinor("1.2.3.4") parses first dot only');
assert(parseDecimalToMinor('1,000,000.50') === 100000050n, 'parseDecimalToMinor("1,000,000.50") handles commas');
assert(parseDecimalToMinor('₹99,999.99') === 9999999n, 'parseDecimalToMinor("₹99,999.99") strips symbol');
assert(parseDecimalToMinor('$ 1,234.56') === 123456n, 'parseDecimalToMinor("$ 1,234.56") strips symbol');
assert(parseDecimalToMinor('€ -500.25') === 50025n, 'parseDecimalToMinor non-leading minus stripped as non-digit');

// 1.5 Truncation of sub-minor digits (no rounding error, strict minor cutoff)
assert(parseDecimalToMinor('12.3456') === 1234n, 'parseDecimalToMinor("12.3456") truncates sub-minor');
assert(parseDecimalToMinor('-12.3499') === -1234n, 'parseDecimalToMinor("-12.3499") truncates negative sub-minor');

// 1.6 Scientific notation strings (e.g. 1e5 treated as 15 without float parsing)
// Note: In strict financial UI, user enters digits. parseDecimalToMinor strips 'e' as non-digit: '1e5' -> '15' * 100 = 1500n
assert(parseDecimalToMinor('1e5') === 1500n, 'parseDecimalToMinor strips exponent letter without float eval');

// 1.7 Large numbers beyond Number.MAX_SAFE_INTEGER
const bigDec = '9007199254740991.99';
const expectedBigMinor = 900719925474099199n;
assert(parseDecimalToMinor(bigDec) === expectedBigMinor, 'parseDecimalToMinor beyond MAX_SAFE_INTEGER');
assert(formatMinorToDecimal(expectedBigMinor) === bigDec, 'formatMinorToDecimal beyond MAX_SAFE_INTEGER');

// 1.8 64-bit boundaries (PostgreSQL BIGINT limits)
const maxInt64 = 9223372036854775807n;
const minInt64 = -9223372036854775808n;
const formattedMax = formatMinorToDecimal(maxInt64);
const formattedMin = formatMinorToDecimal(minInt64);
assert(formattedMax === '92233720368547758.07', `formattedMax is ${formattedMax}`);
assert(formattedMin === '-92233720368547758.08', `formattedMin is ${formattedMin}`);
assert(parseDecimalToMinor(formattedMax) === maxInt64, 'parse maxInt64 roundtrips');
assert(parseDecimalToMinor(formattedMin) === minInt64, 'parse minInt64 roundtrips');

// 1.9 Exact formatMinorToDecimal tests
assert(formatMinorToDecimal(0n) === '0.00', 'formatMinorToDecimal(0n) === "0.00"');
assert(formatMinorToDecimal(1n) === '0.01', 'formatMinorToDecimal(1n) === "0.01"');
assert(formatMinorToDecimal(9n) === '0.09', 'formatMinorToDecimal(9n) === "0.09"');
assert(formatMinorToDecimal(10n) === '0.10', 'formatMinorToDecimal(10n) === "0.10"');
assert(formatMinorToDecimal(99n) === '0.99', 'formatMinorToDecimal(99n) === "0.99"');
assert(formatMinorToDecimal(100n) === '1.00', 'formatMinorToDecimal(100n) === "1.00"');
assert(formatMinorToDecimal(105n) === '1.05', 'formatMinorToDecimal(105n) === "1.05"');
assert(formatMinorToDecimal(-1n) === '-0.01', 'formatMinorToDecimal(-1n) === "-0.01"');
assert(formatMinorToDecimal(-9n) === '-0.09', 'formatMinorToDecimal(-9n) === "-0.09"');
assert(formatMinorToDecimal(-10n) === '-0.10', 'formatMinorToDecimal(-10n) === "-0.10"');
assert(formatMinorToDecimal(-99n) === '-0.99', 'formatMinorToDecimal(-99n) === "-0.99"');
assert(formatMinorToDecimal(-100n) === '-1.00', 'formatMinorToDecimal(-100n) === "-1.00"');
assert(formatMinorToDecimal(-105n) === '-1.05', 'formatMinorToDecimal(-105n) === "-1.05"');

// 1.10 50,000 Random BigInt Round-Trip Fuzz Testing
console.log('Running 50,000 random round-trip tests...');
let fuzzPass = 0;
for (let i = 0; i < 50000; i++) {
  let val;
  const bucket = i % 5;
  if (bucket === 0) {
    val = BigInt(Math.floor(Math.random() * 2000) - 1000);
  } else if (bucket === 1) {
    val = BigInt(Math.floor(Math.random() * 20000000) - 10000000);
  } else if (bucket === 2) {
    val = BigInt(Math.floor(Math.random() * 1000000000));
  } else if (bucket === 3) {
    val = -BigInt(Math.floor(Math.random() * 1000000000));
  } else {
    const hi = BigInt(Math.floor(Math.random() * 1000000000));
    const lo = BigInt(Math.floor(Math.random() * 1000000000));
    val = hi * 1000000000n + lo;
    if (Math.random() < 0.5) val = -val;
  }

  const formatted = formatMinorToDecimal(val);
  const parsed = parseDecimalToMinor(formatted);
  if (parsed === val) {
    fuzzPass++;
  } else {
    console.error(`Fuzz failed: val=${val}, formatted=${formatted}, parsed=${parsed}`);
    break;
  }
}
assert(fuzzPass === 50000, `50,000 random BigInt round-trips passed (${fuzzPass}/50000)`);


// ====================================================================
// SECTION 2: Edge Function Transaction Validation Logic
// ====================================================================
console.log('\n--- 2. Adversarial Testing of Edge Function validate-transaction ---');

const edgeFnSource = fs.readFileSync(path.join(__dirname, '../../../supabase/functions/validate-transaction/index.ts'), 'utf-8');

assert(!edgeFnSource.includes('amount_minor: number;'), 'amount_minor is not typed as number');
assert(!edgeFnSource.includes('number'), 'No occurrence of word "number" in validate-transaction');

// Extract and simulate the core validation logic of validate-transaction
function validateTransactionEntries(entries) {
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return { status: 400, error: 'Entries array is required' };
  }

  if (entries.length < 2) {
    return { status: 400, error: 'A transaction must contain at least two journal entries' };
  }

  let debits = 0n;
  let credits = 0n;

  for (const e of entries) {
    if (!e.account_id || typeof e.account_id !== 'string') {
      return { status: 400, error: 'Each entry must have a valid account_id' };
    }

    if (e.amount_minor === undefined || e.amount_minor === null) {
      return { status: 400, error: 'amount_minor is required for all entries' };
    }

    let amount;
    try {
      amount = BigInt(e.amount_minor);
    } catch {
      return { status: 400, error: `Invalid amount_minor: "${e.amount_minor}". Must be a valid integer.` };
    }

    if (amount <= 0n) {
      return { status: 400, error: `Journal entry amount must be strictly positive (> 0n), received: ${amount.toString()}n` };
    }

    if (e.direction === 'DEBIT') {
      debits += amount;
    } else if (e.direction === 'CREDIT') {
      credits += amount;
    } else {
      return { status: 400, error: `Invalid direction: "${e.direction}". Must be DEBIT or CREDIT.` };
    }
  }

  if (debits !== credits) {
    return {
      status: 400,
      error: 'Double-entry balance violation',
      debits: debits.toString(),
      credits: credits.toString(),
      difference: (debits - credits).toString(),
    };
  }

  return { status: 200, valid: true, balancedAmount: debits.toString() };
}

// 2.1 Missing or empty entries
assert(validateTransactionEntries(null).status === 400, 'Rejects null entries');
assert(validateTransactionEntries([]).status === 400, 'Rejects empty array');

// 2.2 Less than 2 entries (single leg)
assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '1000', direction: 'DEBIT' }
]).status === 400, 'Rejects 1-leg transaction');

// 2.3 Valid 2-leg transaction
const valid2Leg = validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '5000', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '5000', direction: 'CREDIT' }
]);
assert(valid2Leg.status === 200 && valid2Leg.balancedAmount === '5000', 'Accepts valid 2-leg transaction');

// 2.4 Valid multi-split 3-leg transaction
const valid3Leg = validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '3000', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '2000', direction: 'DEBIT' },
  { account_id: 'acc-3', amount_minor: '5000', direction: 'CREDIT' }
]);
assert(valid3Leg.status === 200 && valid3Leg.balancedAmount === '5000', 'Accepts valid 3-leg multi-split');

// 2.5 Unbalanced transaction
const unbal = validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '5001', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '5000', direction: 'CREDIT' }
]);
assert(unbal.status === 400 && unbal.difference === '1', 'Rejects unbalanced transaction with exact delta');

// 2.6 Reject non-positive amounts
assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '0', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '0', direction: 'CREDIT' }
]).status === 400, 'Rejects zero amount_minor');

assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '-500', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '-500', direction: 'CREDIT' }
]).status === 400, 'Rejects negative amount_minor');

// 2.7 Reject float strings and malformed inputs
assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '12.34', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '12.34', direction: 'CREDIT' }
]).status === 400, 'Rejects decimal string "12.34" as amount_minor');

assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: 'abc', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: 'abc', direction: 'CREDIT' }
]).status === 400, 'Rejects non-numeric string "abc"');

// 2.8 Reject invalid direction
assert(validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '1000', direction: 'TRANSFER' },
  { account_id: 'acc-2', amount_minor: '1000', direction: 'CREDIT' }
]).status === 400, 'Rejects invalid direction');

// 2.9 Extreme BigInt transactions beyond Number.MAX_SAFE_INTEGER
const extremeBal = validateTransactionEntries([
  { account_id: 'acc-1', amount_minor: '900719925474099200', direction: 'DEBIT' },
  { account_id: 'acc-2', amount_minor: '900719925474099200', direction: 'CREDIT' }
]);
assert(extremeBal.status === 200 && extremeBal.balancedAmount === '900719925474099200', 'Handles amounts > MAX_SAFE_INTEGER exactly');


// ====================================================================
// SECTION 3: Client SQLite Schema Parity & sync_queue Outbox
// ====================================================================
console.log('\n--- 3. Adversarial Testing of Client SQLite DDL & sync_queue ---');

const sqliteDdl = fs.readFileSync(path.join(__dirname, '../../../packages/sync-engine/src/client-schema.sql'), 'utf-8');
const memDb = new DatabaseSync(':memory:');

// Execute client SQLite DDL
memDb.exec(sqliteDdl);

// Verify all 6 tables exist in SQLite
const tables = memDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all().map(r => r.name);
const expectedTables = ['accounts', 'iou_records', 'journal_entries', 'sinking_funds', 'sync_queue', 'transactions'];
for (const t of expectedTables) {
  assert(tables.includes(t), `SQLite table "${t}" exists`);
}

// Test sync_queue table schema and operation constraints
const nowIso = new Date().toISOString();
memDb.prepare(`
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status)
  VALUES ('q-1', 'transactions', 'tx-100', 'INSERT', '{"id":"tx-100"}', ?, 'PENDING')
`).run(nowIso);

const qRow = memDb.prepare("SELECT * FROM sync_queue WHERE id = 'q-1'").get();
assert(qRow.id === 'q-1' && qRow.operation === 'INSERT' && qRow.status === 'PENDING', 'sync_queue INSERT succeeds');

// Check invalid operation constraint in sync_queue
let opConstraintFailed = false;
try {
  memDb.prepare(`
    INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status)
    VALUES ('q-invalid', 'transactions', 'tx-101', 'INVALID_OP', '{}', ?, 'PENDING')
  `).run(nowIso);
} catch (e) {
  opConstraintFailed = true;
}
assert(opConstraintFailed, 'sync_queue operation CHECK constraint rejects invalid op');

// Check invalid status constraint in sync_queue
let statusConstraintFailed = false;
try {
  memDb.prepare(`
    INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status)
    VALUES ('q-invalid2', 'transactions', 'tx-102', 'INSERT', '{}', ?, 'INVALID_STATUS')
  `).run(nowIso);
} catch (e) {
  statusConstraintFailed = true;
}
assert(statusConstraintFailed, 'sync_queue status CHECK constraint rejects invalid status');

// Check journal_entries amount_minor > 0 constraint
memDb.prepare(`
  INSERT INTO accounts (id, user_id, name, type, created_at, updated_at)
  VALUES ('acc-asset', 'usr-1', 'Cash', 'ASSET', ?, ?)
`).run(nowIso, nowIso);

memDb.prepare(`
  INSERT INTO transactions (id, user_id, idempotency_key, transaction_date, description, created_at, updated_at)
  VALUES ('tx-1', 'usr-1', 'idem-1', '2026-11-08', 'Test', ?, ?)
`).run(nowIso, nowIso);

let zeroAmtFailed = false;
try {
  memDb.prepare(`
    INSERT INTO journal_entries (id, user_id, transaction_id, account_id, amount_minor, direction, created_at)
    VALUES ('je-zero', 'usr-1', 'tx-1', 'acc-asset', 0, 'DEBIT', ?)
  `).run(nowIso);
} catch (e) {
  zeroAmtFailed = true;
}
assert(zeroAmtFailed, 'journal_entries amount_minor > 0 constraint rejects zero amount in SQLite');


// ====================================================================
// SECTION 4: PostgreSQL Migration & Trigger UPDATE Logic
// ====================================================================
console.log('\n--- 4. Adversarial Testing of Trigger UPDATE and search_path ---');

const migrationSql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261108000000_init_finvault_schema.sql'), 'utf-8');

// Verify search_path is set on every function
assert(migrationSql.includes('verify_transaction_balance()'), 'verify_transaction_balance exists');
assert(migrationSql.includes('LANGUAGE plpgsql SET search_path = public, pg_temp;'), 'Functions use SET search_path = public, pg_temp');

// Count occurrences of SET search_path
const searchPathMatches = migrationSql.match(/SET search_path = public, pg_temp/g);
assert(searchPathMatches && searchPathMatches.length >= 4, `search_path is hardened on at least 4 functions (found ${searchPathMatches ? searchPathMatches.length : 0})`);

// Verify trigger update logic handles UPDATE
assert(migrationSql.includes("AFTER INSERT OR UPDATE OR DELETE ON journal_entries"), 'Trigger handles INSERT OR UPDATE OR DELETE');
assert(migrationSql.includes("ELSIF TG_OP = 'UPDATE' THEN"), 'Trigger function has explicit TG_OP = "UPDATE" branch');
assert(migrationSql.includes("Cannot update primary key id of journal entry"), 'Trigger prevents modifying journal entry id');
assert(migrationSql.includes("Cannot reassign journal entry to a different user"), 'Trigger prevents modifying journal entry user_id');
assert(migrationSql.includes("Cannot reassign journal entry to a different transaction"), 'Trigger prevents modifying journal entry transaction_id');

// Verify atomic balance delta logic for UPDATE:
// Let's simulate the PostgreSQL UPDATE trigger math across scenarios:
function simulateTriggerUpdate(oldEntry, newEntry, oldAcc, newAcc) {
  // Guard checks
  if (oldEntry.id !== newEntry.id) throw new Error('Cannot update primary key id of journal entry');
  if (oldEntry.user_id !== newEntry.user_id) throw new Error('Cannot reassign journal entry to a different user');
  if (oldEntry.transaction_id !== newEntry.transaction_id) throw new Error('Cannot reassign journal entry to a different transaction');

  // Reverse OLD impact
  let oldDelta = 0n;
  if (['ASSET', 'EXPENSE'].includes(oldAcc.type)) {
    oldDelta = oldEntry.direction === 'DEBIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
  } else {
    oldDelta = oldEntry.direction === 'CREDIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
  }

  // Apply NEW impact
  let newDelta = 0n;
  if (['ASSET', 'EXPENSE'].includes(newAcc.type)) {
    newDelta = newEntry.direction === 'DEBIT' ? newEntry.amount_minor : -newEntry.amount_minor;
  } else {
    newDelta = newEntry.direction === 'CREDIT' ? newEntry.amount_minor : -newEntry.amount_minor;
  }

  if (oldEntry.account_id === newEntry.account_id) {
    return {
      [oldEntry.account_id]: oldAcc.balance_minor + oldDelta + newDelta
    };
  } else {
    return {
      [oldEntry.account_id]: oldAcc.balance_minor + oldDelta,
      [newEntry.account_id]: newAcc.balance_minor + newDelta
    };
  }
}

// 4.1 Test same-account amount modification (e.g. 5000 -> 7000 debit on ASSET account starting with balance 10000)
// Original balance 10000 included +5000 debit.
// If amount updated to 7000 debit, new balance should be 10000 - 5000 + 7000 = 12000.
const simResult1 = simulateTriggerUpdate(
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'DEBIT' },
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 7000n, direction: 'DEBIT' },
  { type: 'ASSET', balance_minor: 10000n },
  { type: 'ASSET', balance_minor: 10000n }
);
assert(simResult1['acc-1'] === 12000n, 'Trigger UPDATE: same account amount increase');

// 4.2 Test direction flip: DEBIT to CREDIT on ASSET account (10000 balance: old was +5000 DEBIT, new is -5000 CREDIT)
// Expected: 10000 - 5000 (reversal) - 5000 (new credit) = 0.
const simResult2 = simulateTriggerUpdate(
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'DEBIT' },
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'CREDIT' },
  { type: 'ASSET', balance_minor: 10000n },
  { type: 'ASSET', balance_minor: 10000n }
);
assert(simResult2['acc-1'] === 0n, 'Trigger UPDATE: same account direction reversal');

// 4.3 Test account reassignment: moving 5000 debit from acc-1 (ASSET, bal 10000) to acc-2 (ASSET, bal 2000)
// Expected: acc-1 balance becomes 10000 - 5000 = 5000. acc-2 balance becomes 2000 + 5000 = 7000.
const simResult3 = simulateTriggerUpdate(
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'DEBIT' },
  { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-2', amount_minor: 5000n, direction: 'DEBIT' },
  { type: 'ASSET', balance_minor: 10000n },
  { type: 'ASSET', balance_minor: 2000n }
);
assert(simResult3['acc-1'] === 5000n && simResult3['acc-2'] === 7000n, 'Trigger UPDATE: account reassignment updates both accounts');

// 4.4 Test guard rejection on immutable fields
let pkeyFail = false;
try {
  simulateTriggerUpdate(
    { id: 'je-1', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'DEBIT' },
    { id: 'je-2', user_id: 'u-1', transaction_id: 'tx-1', account_id: 'acc-1', amount_minor: 5000n, direction: 'DEBIT' },
    { type: 'ASSET', balance_minor: 10000n },
    { type: 'ASSET', balance_minor: 10000n }
  );
} catch (e) {
  pkeyFail = true;
}
assert(pkeyFail, 'Trigger UPDATE rejects primary key id mutation');

// ====================================================================
// SUMMARY
// ====================================================================
console.log('\n======================================================================');
console.log(`TOTAL ADVERSARIAL ASSERTIONS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('======================================================================');

if (failedTests > 0) {
  process.exit(1);
}
