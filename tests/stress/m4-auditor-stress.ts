import assert from 'node:assert';
import {
  parseDecimalToMinor,
  formatMinorToDecimal,
  formatCurrency,
} from '../../packages/ui/src/utils/money.ts';
import {
  TOKENS,
} from '../../packages/ui/src/tokens.ts';
import {
  validateTransactionEntries
} from '../../apps/web/src/lib/validation/double-entry.ts';
import {
  serializeAccount,
  deserializeAccount,
  serializeIOURecord,
  deserializeIOURecord,
  deepSerializeBigInt
} from '../../apps/web/src/lib/money/serialization.ts';

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failCount++;
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

console.log('======================================================');
console.log('   M4 FORENSIC AUDITOR ADVERSARIAL STRESS TEST SUITE  ');
console.log('======================================================');

// 1. Lossless BigInt String Parsing & Formatting (Zero Floats)
test('UI-01: parseDecimalToMinor with empty, dot, and partial typing', () => {
  assert.strictEqual(parseDecimalToMinor(''), 0n);
  assert.strictEqual(parseDecimalToMinor('.'), 0n);
  assert.strictEqual(parseDecimalToMinor('-.'), 0n);
  assert.strictEqual(parseDecimalToMinor('-'), 0n);
  assert.strictEqual(parseDecimalToMinor('   '), 0n);
});

test('UI-02: parseDecimalToMinor standard amounts', () => {
  assert.strictEqual(parseDecimalToMinor('12.34'), 1234n);
  assert.strictEqual(parseDecimalToMinor('0.5'), 50n);
  assert.strictEqual(parseDecimalToMinor('100'), 10000n);
  assert.strictEqual(parseDecimalToMinor('0.01'), 1n);
  assert.strictEqual(parseDecimalToMinor('-50.25'), -5025n);
});

test('UI-03: parseDecimalToMinor multiple decimal dots cleaned safely', () => {
  assert.strictEqual(parseDecimalToMinor('12.34.56'), 1234n);
});

test('UI-04: parseDecimalToMinor beyond Number.MAX_SAFE_INTEGER (> 2^53 - 1)', () => {
  const hugeStr = '9007199254740992.55';
  const expectedMinor = 900719925474099255n;
  const parsed = parseDecimalToMinor(hugeStr);
  assert.strictEqual(parsed, expectedMinor);
  const formatted = formatMinorToDecimal(parsed);
  assert.strictEqual(formatted, hugeStr);
});

test('UI-05: formatMinorToDecimal edge cases', () => {
  assert.strictEqual(formatMinorToDecimal(0n), '0.00');
  assert.strictEqual(formatMinorToDecimal(1n), '0.01');
  assert.strictEqual(formatMinorToDecimal(9n), '0.09');
  assert.strictEqual(formatMinorToDecimal(10n), '0.10');
  assert.strictEqual(formatMinorToDecimal(100n), '1.00');
  assert.strictEqual(formatMinorToDecimal(-1n), '-0.01');
  assert.strictEqual(formatMinorToDecimal(-5000n), '-50.00');
});

test('UI-06: formatCurrency symbol and decimal handling', () => {
  assert.strictEqual(formatCurrency(125000n, '₹'), '₹1250.00');
  assert.strictEqual(formatCurrency(-7500n, '$'), '-$75.00');
  assert.strictEqual(formatCurrency(0n, '₹'), '₹0.00');
});

test('UI-07: Round-trip consistency across 500 arbitrary steps without float deviation', () => {
  for (let i = 0n; i < 500n; i++) {
    const minor = i * 137n;
    const formatted = formatMinorToDecimal(minor);
    const roundTripped = parseDecimalToMinor(formatted);
    assert.strictEqual(roundTripped, minor, `Round-trip mismatch for ${minor}`);
  }
});

// 2. Double-Entry Validation Invariants
test('VAL-01: validateTransactionEntries rejects < 2 entries', () => {
  const res1 = validateTransactionEntries([]);
  assert.strictEqual(res1.isValid, false);
  assert.match(res1.error!, /at least two entries/);

  const res2 = validateTransactionEntries([{ account_id: 'a1', amount_minor: 100n, direction: 'DEBIT' }]);
  assert.strictEqual(res2.isValid, false);
});

test('VAL-02: validateTransactionEntries rejects non-positive amounts', () => {
  const resZero = validateTransactionEntries([
    { account_id: 'a1', amount_minor: 0n, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: 0n, direction: 'CREDIT' },
  ]);
  assert.strictEqual(resZero.isValid, false);
  assert.match(resZero.error!, /greater than zero/);

  const resNeg = validateTransactionEntries([
    { account_id: 'a1', amount_minor: -100n, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: -100n, direction: 'CREDIT' },
  ]);
  assert.strictEqual(resNeg.isValid, false);
});

test('VAL-03: validateTransactionEntries rejects missing account_id', () => {
  const res = validateTransactionEntries([
    { account_id: '', amount_minor: 100n, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: 100n, direction: 'CREDIT' },
  ]);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error!, /missing a selected account/);
});

test('VAL-04: validateTransactionEntries rejects single-sided legs', () => {
  const resAllDebits = validateTransactionEntries([
    { account_id: 'a1', amount_minor: 100n, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: 100n, direction: 'DEBIT' },
  ]);
  assert.strictEqual(resAllDebits.isValid, false);
  assert.match(resAllDebits.error!, /cannot be single-sided/);
});

test('VAL-05: validateTransactionEntries rejects unbalanced multi-split', () => {
  const res = validateTransactionEntries([
    { account_id: 'a1', amount_minor: 1000n, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: 400n, direction: 'CREDIT' },
    { account_id: 'a3', amount_minor: 599n, direction: 'CREDIT' }, // 999n != 1000n
  ]);
  assert.strictEqual(res.isValid, false);
  assert.strictEqual(res.differenceMinor, 1n);
  assert.match(res.error!, /Double-entry violation/);
});

test('VAL-06: validateTransactionEntries accepts balanced multi-split beyond 2^53 - 1', () => {
  const hugeAmount = 900719925474099200n;
  const split1 = 450359962737049600n;
  const split2 = 450359962737049600n;
  assert.strictEqual(split1 + split2, hugeAmount);

  const res = validateTransactionEntries([
    { account_id: 'a1', amount_minor: hugeAmount, direction: 'DEBIT' },
    { account_id: 'a2', amount_minor: split1, direction: 'CREDIT' },
    { account_id: 'a3', amount_minor: split2, direction: 'CREDIT' },
  ]);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.differenceMinor, 0n);
  assert.strictEqual(res.totalDebitsMinor, hugeAmount);
  assert.strictEqual(res.totalCreditsMinor, hugeAmount);
});

// 3. Serialization and DTO Fidelity
test('DTO-01: serializeAccount converts BigInt to string and deserialize restores exact BigInt', () => {
  const rawAccount = {
    id: 'acc-test',
    user_id: 'user-test',
    name: 'Wealth Reserve',
    type: 'ASSET' as const,
    currency: 'INR',
    balance_minor: 900719925474099500n,
    is_archived: false,
    created_at: '2026-11-09T00:00:00Z',
    updated_at: '2026-11-09T00:00:00Z',
    version: 42n,
  };

  const serialized = serializeAccount(rawAccount);
  assert.strictEqual(typeof serialized.balance_minor, 'string');
  assert.strictEqual(serialized.balance_minor, '900719925474099500');
  assert.strictEqual(serialized.version, '42');

  const deserialized = deserializeAccount(serialized);
  assert.strictEqual(typeof deserialized.balance_minor, 'bigint');
  assert.strictEqual(deserialized.balance_minor, rawAccount.balance_minor);
  assert.strictEqual(deserialized.version, 42n);
});

test('DTO-02: serializeIOURecord and deserializeIOURecord preserve 64-bit BigInt', () => {
  const rawIOU = {
    id: 'iou-test',
    user_id: 'user-test',
    counterparty_name: 'Adversary',
    direction: 'LENT' as const,
    principal_minor: 500000000000000000n,
    remaining_balance_minor: 250000000000000000n,
    currency: 'INR',
    status: 'PARTIAL' as const,
    is_deleted: false,
    created_at: '2026-11-09T00:00:00Z',
    updated_at: '2026-11-09T00:00:00Z',
    version: 5n,
  };

  const serialized = serializeIOURecord(rawIOU);
  assert.strictEqual(serialized.principal_minor, '500000000000000000');
  assert.strictEqual(serialized.remaining_balance_minor, '250000000000000000');

  const deserialized = deserializeIOURecord(serialized);
  assert.strictEqual(deserialized.principal_minor, rawIOU.principal_minor);
  assert.strictEqual(deserialized.remaining_balance_minor, rawIOU.remaining_balance_minor);
});

test('DTO-03: deepSerializeBigInt recursively serializes complex nested object graphs', () => {
  const complex = {
    id: 'test',
    amount: 1234567890123456789n,
    nested: {
      innerAmount: 9876543210987654321n,
      items: [100n, 200n, { deep: 300n }],
    },
    plainNum: 42,
    str: 'hello',
  };

  const serialized = deepSerializeBigInt(complex);
  assert.strictEqual(serialized.amount, '1234567890123456789');
  assert.strictEqual(serialized.nested.innerAmount, '9876543210987654321');
  assert.strictEqual(serialized.nested.items[0], '100');
  assert.strictEqual(serialized.nested.items[1], '200');
  assert.strictEqual(serialized.nested.items[2].deep, '300');
  assert.strictEqual(serialized.plainNum, 42);
  assert.strictEqual(serialized.str, 'hello');

  const jsonStr = JSON.stringify(serialized);
  assert.ok(jsonStr.includes('"1234567890123456789"'));
});

// 4. Botanical Minimalist Tokens Invariants
test('TOKENS-01: Venzer design tokens strictly adhere to ADR-007 specifications', () => {
  assert.strictEqual(TOKENS.colors.obsidianCarbon, '#040A0A');
  assert.strictEqual(TOKENS.colors.softMint, '#DEEEDA');
  assert.strictEqual(TOKENS.colors.mossCeladon, '#C7E0BA');
  assert.strictEqual(TOKENS.colors.oliveLeaf, '#7AAA4A');
  assert.strictEqual(TOKENS.colors.sageSlate, '#90A999');
  assert.strictEqual(TOKENS.colors.slateBase, '#38424C');
  assert.strictEqual(TOKENS.colors.alert, '#E06A55');

  assert.strictEqual(TOKENS.layout.maxVisualGroups, 3);
  assert.strictEqual(TOKENS.layout.maxRowAttributes, 3);
  assert.strictEqual(TOKENS.layout.containerRadius, '24px');
  assert.strictEqual(TOKENS.layout.controlRadius, '12px');
  assert.ok(TOKENS.layout.transitionDurationMs <= 180, 'Transition duration must be <= 180ms');
});

console.log('======================================================');
console.log(`TOTAL ADVERSARIAL CHECKS: ${passCount + failCount}`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log('======================================================');

if (failCount > 0) {
  process.exit(1);
}
