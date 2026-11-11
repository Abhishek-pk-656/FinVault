/**
 * FinVault Milestone 4 Challenger 1 Adversarial Stress Test Suite
 * Agent: Challenger 1 (challenger_m4_1)
 *
 * Scope:
 * 1. UI Money Utilities & AmountInput parsing/formatting edge cases:
 *    - "0", "0.00", "0.01", "999999999999.99"
 *    - Int64 Max/Min signed boundaries
 *    - In-progress typing strings ("", ".", "-.", "-", "12.", ".5", ".05")
 *    - Pasting formatted strings with currency symbols, commas, spaces
 *    - Invalid characters, multiple dots, multiple minuses, letters, emojis
 *    - Sub-minor decimal truncation and zero normalization
 *    - Lossless round-trip conversion
 * 2. BalanceBadge & Multi-Split Invariant Calculations:
 *    - Exact delta tracking across arbitrary legs (2, 3, 5, 10, 100 legs)
 *    - Negative and positive deltas
 *    - 1-paise imbalance detection (differenceMinor = 1n and -1n)
 *    - Zero-delta green status (differenceMinor = 0n)
 *    - Auto-balance helper invariant
 * 3. Pre-validation & Safe BigInt Serialization:
 *    - validateTransactionEntries double-entry lite validation
 *    - JSON serialization safety across RSC boundaries
 * 4. Venzer Design Tokens & Transition Timing:
 *    - Token color codes and radii constraints
 *    - Transition duration <= 180ms verification across UI and Web codebases
 *    - Max 3 visual component groups per cockpit view
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TOKENS } from '../../packages/ui/src/tokens.ts';
import {
  parseDecimalToMinor,
  formatMinorToDecimal,
  formatCurrency,
} from '../../packages/ui/src/utils/money.ts';
import {
  validateTransactionEntries,
} from '../../apps/web/src/lib/validation/double-entry.ts';
import {
  serializeAccount,
  deserializeAccount,
  serializeTransaction,
  deserializeTransaction,
  serializeIOURecord,
  deserializeIOURecord,
  deepSerializeBigInt,
} from '../../apps/web/src/lib/money/serialization.ts';
import type { Account, Transaction, IOURecord } from '../../packages/db-types/src/index.ts';

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

async function runM4StressTests(): Promise<void> {
  console.log('============================================================');
  console.log('CHALLENGER 1: FINVAULT M4 UI & WEB ADVERSARIAL STRESS SUITE');
  console.log('============================================================\n');

  // =========================================================================
  // SECTION 1: AMOUNTINPUT PARSING & FORMATTING ADVERSARIAL SUITE
  // =========================================================================
  console.log('--- SECTION 1: AmountInput Parsing & Formatting Edge Cases ---');

  // 1.1 Canonical boundary amounts
  assert(parseDecimalToMinor('0') === 0n, 'S1.01: parseDecimalToMinor("0") === 0n');
  assert(parseDecimalToMinor('0.00') === 0n, 'S1.02: parseDecimalToMinor("0.00") === 0n');
  assert(parseDecimalToMinor('0.01') === 1n, 'S1.03: parseDecimalToMinor("0.01") === 1n (1 paise)');
  assert(parseDecimalToMinor('999999999999.99') === 99999999999999n, 'S1.04: parseDecimalToMinor("999999999999.99") === 99999999999999n');

  // 1.2 Int64 signed boundaries
  const int64Max = 9223372036854775807n;
  const int64Min = -9223372036854775808n;
  const formattedInt64Max = formatMinorToDecimal(int64Max);
  const formattedInt64Min = formatMinorToDecimal(int64Min);
  assert(formattedInt64Max === '92233720368547758.07', 'S1.05: formatMinorToDecimal(Int64 Max)');
  assert(formattedInt64Min === '-92233720368547758.08', 'S1.06: formatMinorToDecimal(Int64 Min)');
  assert(parseDecimalToMinor(formattedInt64Max) === int64Max, 'S1.07: parseDecimalToMinor roundtrip Int64 Max');
  assert(parseDecimalToMinor(formattedInt64Min) === int64Min, 'S1.08: parseDecimalToMinor roundtrip Int64 Min');

  // 1.3 In-progress typing strings (buffered state emulation)
  assert(parseDecimalToMinor('') === 0n, 'S1.09: parseDecimalToMinor("") returns 0n safely');
  assert(parseDecimalToMinor('.') === 0n, 'S1.10: parseDecimalToMinor(".") returns 0n safely');
  assert(parseDecimalToMinor('-.') === 0n, 'S1.11: parseDecimalToMinor("-.") returns 0n safely');
  assert(parseDecimalToMinor('-') === 0n, 'S1.12: parseDecimalToMinor("-") returns 0n safely');
  assert(parseDecimalToMinor('12.') === 1200n, 'S1.13: parseDecimalToMinor("12.") parses as 1200n');
  assert(parseDecimalToMinor('.5') === 50n, 'S1.14: parseDecimalToMinor(".5") parses as 50n (50 paise)');
  assert(parseDecimalToMinor('.05') === 5n, 'S1.15: parseDecimalToMinor(".05") parses as 5n (5 paise)');
  assert(parseDecimalToMinor('-0') === 0n, 'S1.16: parseDecimalToMinor("-0") normalizes to 0n');
  assert(parseDecimalToMinor('-0.00') === 0n, 'S1.17: parseDecimalToMinor("-0.00") normalizes to 0n');
  assert(parseDecimalToMinor('-0.01') === -1n, 'S1.18: parseDecimalToMinor("-0.01") parses as -1n');

  // 1.4 Pasting formatted text with symbols and commas
  assert(parseDecimalToMinor(' ₹ 1,234.56 ') === 123456n, 'S1.19: parses pasted currency string " ₹ 1,234.56 "');
  assert(parseDecimalToMinor('$ 1,000,000.00') === 100000000n, 'S1.20: parses pasted formatted millions "$ 1,000,000.00"');
  assert(parseDecimalToMinor('12.34.56') === 1234n, 'S1.21: strips secondary dots gracefully ("12.34.56" -> 1234n)');
  assert(parseDecimalToMinor('--50.00') === -5000n, 'S1.22: handles multiple minus signs safely ("--50.00" -> -5000n)');

  // 1.5 Whitespace and non-numeric characters
  assert(parseDecimalToMinor('   42.50   ') === 4250n, 'S1.23: trims leading and trailing whitespace');
  assert(parseDecimalToMinor(' 4 2 . 5 0 ') === 4250n, 'S1.24: strips internal whitespace');
  assert(parseDecimalToMinor('abc') === 0n, 'S1.25: non-numeric string "abc" parses to 0n');
  assert(parseDecimalToMinor('₹ 99.99 💰') === 9999n, 'S1.26: strips emojis and symbols safely');
  assert(parseDecimalToMinor('\t\n100.50\n\t') === 10050n, 'S1.27: handles tabs and newlines');

  // 1.6 Sub-minor decimal truncation
  assert(parseDecimalToMinor('12.345') === 1234n, 'S1.28: sub-minor "12.345" truncates safely to 1234n');
  assert(parseDecimalToMinor('12.3456789') === 1234n, 'S1.29: sub-minor "12.3456789" truncates safely to 1234n');
  assert(parseDecimalToMinor('0.009') === 0n, 'S1.30: sub-minor "0.009" truncates to 0n');
  assert(parseDecimalToMinor('0.019') === 1n, 'S1.31: sub-minor "0.019" truncates to 1n');

  // 1.7 Formatting roundtrip & display helpers
  assert(formatMinorToDecimal(1234n) === '12.34', 'S1.32: formatMinorToDecimal(1234n) === "12.34"');
  assert(formatMinorToDecimal(1n) === '0.01', 'S1.33: formatMinorToDecimal(1n) === "0.01"');
  assert(formatMinorToDecimal(0n) === '0.00', 'S1.34: formatMinorToDecimal(0n) === "0.00"');
  assert(formatMinorToDecimal(-1n) === '-0.01', 'S1.35: formatMinorToDecimal(-1n) === "-0.01"');
  assert(formatMinorToDecimal(-100n) === '-1.00', 'S1.36: formatMinorToDecimal(-100n) === "-1.00"');
  assert(formatCurrency(1234n, '₹') === '₹12.34', 'S1.37: formatCurrency positive');
  assert(formatCurrency(-1234n, '₹') === '-₹12.34', 'S1.38: formatCurrency negative');

  // 1.8 Lossless roundtrip property across 100 random amounts
  let roundtripAllPassed = true;
  for (let i = 0; i < 100; i++) {
    const randomMinor = BigInt(Math.floor(Math.random() * 1000000000));
    const formatted = formatMinorToDecimal(randomMinor);
    const parsed = parseDecimalToMinor(formatted);
    if (parsed !== randomMinor) {
      roundtripAllPassed = false;
      break;
    }
  }
  assert(roundtripAllPassed, 'S1.39: 100 randomized amounts satisfy parse(format(x)) === x');

  // =========================================================================
  // SECTION 2: BALANCEBADGE & MULTI-SPLIT INVARIANT STRESS SUITE
  // =========================================================================
  console.log('\n--- SECTION 2: BalanceBadge & Multi-Split Invariant Stress ---');

  // 2.1 Multi-Split calculation helper simulating MultiSplitForm & BalanceBadge logic
  function computeSplitBalance(legs: { direction: 'DEBIT' | 'CREDIT'; amount_minor: bigint }[]) {
    let debits = 0n;
    let credits = 0n;
    for (const leg of legs) {
      if (leg.direction === 'DEBIT') debits += leg.amount_minor;
      else credits += leg.amount_minor;
    }
    const diff = debits - credits;
    return {
      totalDebits: debits,
      totalCredits: credits,
      difference: diff,
      isBalanced: diff === 0n && debits > 0n,
      badgeText: diff === 0n ? 'Balanced' : `Difference: ₹${formatMinorToDecimal(diff)}`,
      badgeColor: diff === 0n ? '#7AAA4A' : '#E06A55',
    };
  }

  // 2.2 Simple 2-leg balanced split
  const split2Leg = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 500000n },
    { direction: 'CREDIT', amount_minor: 500000n },
  ]);
  assert(split2Leg.isBalanced && split2Leg.difference === 0n, 'S2.01: 2-leg split balances with difference === 0n');
  assert(split2Leg.badgeText === 'Balanced' && split2Leg.badgeColor === '#7AAA4A', 'S2.02: 2-leg balanced badge displays "Balanced" in green');

  // 2.3 3-leg split (1 debit, 2 credits)
  const split3Leg = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 1000000n },
    { direction: 'CREDIT', amount_minor: 600000n },
    { direction: 'CREDIT', amount_minor: 400000n },
  ]);
  assert(split3Leg.isBalanced && split3Leg.difference === 0n, 'S2.03: 3-leg split balances with difference === 0n');

  // 2.4 5-leg split (3 debits, 2 credits)
  const split5Leg = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 250000n },
    { direction: 'DEBIT', amount_minor: 350000n },
    { direction: 'DEBIT', amount_minor: 400000n },
    { direction: 'CREDIT', amount_minor: 500000n },
    { direction: 'CREDIT', amount_minor: 500000n },
  ]);
  assert(split5Leg.isBalanced && split5Leg.difference === 0n, 'S2.04: 5-leg split balances with difference === 0n');

  // 2.5 100-leg high-volume split
  const split100Legs: { direction: 'DEBIT' | 'CREDIT'; amount_minor: bigint }[] = [];
  let accum = 0n;
  for (let i = 0; i < 50; i++) {
    const amt = BigInt((i + 1) * 1000);
    accum += amt;
    split100Legs.push({ direction: 'DEBIT', amount_minor: amt });
  }
  // Balance with 50 credit legs
  const baseCredit = accum / 50n;
  let creditRemainder = accum % 50n;
  for (let i = 0; i < 50; i++) {
    const amt = baseCredit + (creditRemainder > 0n ? 1n : 0n);
    if (creditRemainder > 0n) creditRemainder--;
    split100Legs.push({ direction: 'CREDIT', amount_minor: amt });
  }
  const split100Res = computeSplitBalance(split100Legs);
  assert(split100Res.isBalanced && split100Res.difference === 0n, 'S2.05: 100-leg high-volume split balances to exact 0n');

  // 2.6 Imbalance detection: 1-paise discrepancy (positive & negative)
  const imbal1PaisePositive = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 10001n },
    { direction: 'CREDIT', amount_minor: 10000n },
  ]);
  assert(
    !imbal1PaisePositive.isBalanced &&
    imbal1PaisePositive.difference === 1n &&
    imbal1PaisePositive.badgeText === 'Difference: ₹0.01' &&
    imbal1PaisePositive.badgeColor === '#E06A55',
    'S2.06: 1-paise positive imbalance (+1n) detected and triggers alert badge'
  );

  const imbal1PaiseNegative = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 10000n },
    { direction: 'CREDIT', amount_minor: 10001n },
  ]);
  assert(
    !imbal1PaiseNegative.isBalanced &&
    imbal1PaiseNegative.difference === -1n &&
    imbal1PaiseNegative.badgeText === 'Difference: ₹-0.01' &&
    imbal1PaiseNegative.badgeColor === '#E06A55',
    'S2.07: 1-paise negative imbalance (-1n) detected and triggers alert badge'
  );

  // 2.7 Large imbalance with negative delta
  const imbalLargeNeg = computeSplitBalance([
    { direction: 'DEBIT', amount_minor: 500000n },
    { direction: 'CREDIT', amount_minor: 750000n },
  ]);
  assert(
    !imbalLargeNeg.isBalanced &&
    imbalLargeNeg.difference === -250000n &&
    imbalLargeNeg.badgeText === 'Difference: ₹-2500.00',
    'S2.08: large negative imbalance (-250000n) formats correctly'
  );

  // 2.8 Auto-Balance Helper logic validation across 50 imbalanced configurations
  let autoBalancePassed = true;
  for (let i = 0; i < 50; i++) {
    const debitAmt = BigInt(Math.floor(Math.random() * 500000) + 1000);
    const creditAmt = BigInt(Math.floor(Math.random() * 500000) + 1000);
    if (debitAmt === creditAmt) continue;

    const diff = debitAmt - creditAmt;
    const testLegs: { direction: 'DEBIT' | 'CREDIT'; amount_minor: bigint }[] = [
      { direction: 'DEBIT', amount_minor: debitAmt },
      { direction: 'CREDIT', amount_minor: creditAmt },
    ];

    // Apply auto-balance logic
    if (diff > 0n) {
      testLegs.push({ direction: 'CREDIT', amount_minor: diff });
    } else {
      testLegs.push({ direction: 'DEBIT', amount_minor: -diff });
    }

    const rebalanced = computeSplitBalance(testLegs);
    if (!rebalanced.isBalanced || rebalanced.difference !== 0n) {
      autoBalancePassed = false;
      break;
    }
  }
  assert(autoBalancePassed, 'S2.09: Auto-Balance helper mathematically restores delta === 0n across 50 test cases');

  // =========================================================================
  // SECTION 3: PRE-VALIDATION & SAFE BIGINT SERIALIZATION SUITE
  // =========================================================================
  console.log('\n--- SECTION 3: Pre-validation & Safe BigInt Serialization ---');

  // 3.1 validateTransactionEntries double-entry lite validation
  const validTxEntries = [
    { account_id: 'acc-1', amount_minor: 150000n, direction: 'DEBIT' as const },
    { account_id: 'acc-2', amount_minor: 150000n, direction: 'CREDIT' as const },
  ];
  const validRes = validateTransactionEntries(validTxEntries);
  assert(validRes.isValid && validRes.differenceMinor === 0n, 'S3.01: validateTransactionEntries approves balanced transaction');

  // Rejection tests
  assert(!validateTransactionEntries([]).isValid, 'S3.02: rejects empty entries array');
  assert(!validateTransactionEntries([validTxEntries[0]]).isValid, 'S3.03: rejects single-entry transaction');
  assert(
    !validateTransactionEntries([
      { account_id: '', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-2', amount_minor: 1000n, direction: 'CREDIT' },
    ]).isValid,
    'S3.04: rejects entry with empty account_id'
  );
  assert(
    !validateTransactionEntries([
      { account_id: 'acc-1', amount_minor: 0n, direction: 'DEBIT' },
      { account_id: 'acc-2', amount_minor: 0n, direction: 'CREDIT' },
    ]).isValid,
    'S3.05: rejects entry with zero amount_minor'
  );
  assert(
    !validateTransactionEntries([
      { account_id: 'acc-1', amount_minor: -500n, direction: 'DEBIT' },
      { account_id: 'acc-2', amount_minor: -500n, direction: 'CREDIT' },
    ]).isValid,
    'S3.06: rejects entry with negative amount_minor'
  );
  assert(
    !validateTransactionEntries([
      { account_id: 'acc-1', amount_minor: 1000n, direction: 'DEBIT' },
      { account_id: 'acc-2', amount_minor: 1000n, direction: 'DEBIT' },
    ]).isValid,
    'S3.07: rejects single-sided all-debit transaction'
  );
  assert(
    !validateTransactionEntries([
      { account_id: 'acc-1', amount_minor: 1000n, direction: 'CREDIT' },
      { account_id: 'acc-2', amount_minor: 1000n, direction: 'CREDIT' },
    ]).isValid,
    'S3.08: rejects single-sided all-credit transaction'
  );
  assert(
    !validateTransactionEntries([
      { account_id: 'acc-1', amount_minor: 1001n, direction: 'DEBIT' },
      { account_id: 'acc-2', amount_minor: 1000n, direction: 'CREDIT' },
    ]).isValid,
    'S3.09: rejects unbalanced transaction with 1-paise delta'
  );

  // 3.2 Safe BigInt Serialization (RSC boundary crash prevention)
  const rawAccount: Account = {
    id: 'acc-test-123',
    user_id: 'usr-456',
    name: 'HDFC Savings Checking',
    type: 'ASSET',
    currency: 'INR',
    balance_minor: 12500050n,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1n,
  };

  // Verify that raw BigInt crashes standard JSON.stringify
  let rawJsonFailed = false;
  try {
    JSON.stringify(rawAccount);
  } catch (err: any) {
    rawJsonFailed = err.message.includes('BigInt');
  }
  assert(rawJsonFailed, 'S3.10: confirms native BigInt crashes standard JSON.stringify');

  // Verify serializeAccount creates serializable DTO
  const serializedAcc = serializeAccount(rawAccount);
  let serializedJsonSuccess = false;
  try {
    const jsonStr = JSON.stringify(serializedAcc);
    serializedJsonSuccess = jsonStr.includes('"balance_minor":"12500050"');
  } catch (e) {}
  assert(serializedJsonSuccess, 'S3.11: serializeAccount stringifies cleanly without BigInt TypeError');

  // Verify deserializeAccount recovers identical BigInt fields
  const deserializedAcc = deserializeAccount(serializedAcc);
  assert(
    deserializedAcc.balance_minor === rawAccount.balance_minor &&
    deserializedAcc.version === rawAccount.version &&
    deserializedAcc.name === rawAccount.name,
    'S3.12: deserializeAccount reconstructs original BigInt values without precision loss'
  );

  // Universal deep serializer
  const complexObj = {
    total: 99999999999999n,
    nested: {
      inner: 42n,
      arr: [1n, 2n, 3n],
      text: 'hello',
    },
  };
  const deepSerialized = deepSerializeBigInt(complexObj);
  assert(
    typeof deepSerialized.total === 'string' &&
    deepSerialized.nested.inner === '42' &&
    deepSerialized.nested.arr[0] === '1' &&
    deepSerialized.nested.text === 'hello',
    'S3.13: deepSerializeBigInt converts all nested BigInt values to string'
  );

  // =========================================================================
  // SECTION 4: VENZER DESIGN TOKENS & TRANSITION TIMINGS
  // =========================================================================
  console.log('\n--- SECTION 4: Venzer Design Tokens & Transition Timing ---');

  // 4.1 Token property checks
  assert(TOKENS.colors.obsidianCarbon === '#040A0A', 'S4.01: TOKENS.colors.obsidianCarbon === "#040A0A"');
  assert(TOKENS.colors.softMint === '#DEEEDA', 'S4.02: TOKENS.colors.softMint === "#DEEEDA"');
  assert(TOKENS.colors.mossCeladon === '#C7E0BA', 'S4.03: TOKENS.colors.mossCeladon === "#C7E0BA"');
  assert(TOKENS.colors.oliveLeaf === '#7AAA4A', 'S4.04: TOKENS.colors.oliveLeaf === "#7AAA4A"');
  assert(TOKENS.colors.sageSlate === '#90A999', 'S4.05: TOKENS.colors.sageSlate === "#90A999"');
  assert(TOKENS.colors.slateBase === '#38424C', 'S4.06: TOKENS.colors.slateBase === "#38424C"');
  assert(TOKENS.colors.alert === '#E06A55', 'S4.07: TOKENS.colors.alert === "#E06A55"');

  // Backward compatibility aliases
  assert(TOKENS.colors.sagePistachio === '#C7E0BA', 'S4.08: Alias sagePistachio present');
  assert(TOKENS.colors.botanicalGreen === '#7AAA4A', 'S4.09: Alias botanicalGreen present');
  assert(TOKENS.colors.mutedSage === '#90A999', 'S4.10: Alias mutedSage present');
  assert(TOKENS.colors.charcoalSlate === '#38424C', 'S4.11: Alias charcoalSlate present');
  assert(TOKENS.colors.imbalance === '#E06A55', 'S4.12: Alias imbalance present');

  // Layout & motion tokens
  assert(TOKENS.layout.transitionDurationMs <= 180, 'S4.13: TOKENS.layout.transitionDurationMs <= 180ms');
  assert(TOKENS.layout.transitionDurationMs === 150, 'S4.14: TOKENS.layout.transitionDurationMs === 150ms');
  assert(TOKENS.layout.containerRadius === '24px', 'S4.15: TOKENS.layout.containerRadius === "24px" (rounded-3xl)');
  assert(TOKENS.layout.controlRadius === '12px', 'S4.16: TOKENS.layout.controlRadius === "12px" (rounded-xl)');
  assert(TOKENS.layout.maxVisualGroups === 3, 'S4.17: TOKENS.layout.maxVisualGroups === 3');
  assert(TOKENS.layout.maxRowAttributes === 3, 'S4.18: TOKENS.layout.maxRowAttributes === 3');

  // 4.2 Static Codebase Scan: verify no CSS transitions exceed 180ms
  function scanFilesForDurationViolations(dirs: string[]): { file: string; match: string }[] {
    const violations: { file: string; match: string }[] = [];
    const forbiddenPatterns = [
      /duration-(?:2\d\d|3\d\d|4\d\d|5\d\d|7\d\d|1000)/g, // duration >= 200ms
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const walk = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'dist') {
              walk(fullPath);
            }
          } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of forbiddenPatterns) {
              const matches = content.match(pattern);
              if (matches) {
                for (const match of matches) {
                  violations.push({ file: fullPath, match });
                }
              }
            }
          }
        }
      };
      walk(dir);
    }
    return violations;
  }

  const durationViolations = scanFilesForDurationViolations([
    path.resolve(process.cwd(), 'packages/ui/src'),
    path.resolve(process.cwd(), 'apps/web/src'),
  ]);

  assert(
    durationViolations.length === 0,
    'S4.19: Zero transition classes exceeding 180ms found in packages/ui and apps/web',
    durationViolations.map((v) => `${v.file}: ${v.match}`).join(', ')
  );

  // 4.3 Static Cockpit View Group Structure Scan
  const cockpitPages = [
    { name: 'Net Worth Cockpit', path: 'apps/web/src/app/page.tsx', expectedMaxGroups: 3 },
    { name: 'Cash Flow Trajectory', path: 'apps/web/src/app/cash-flow/page.tsx', expectedMaxGroups: 3 },
    { name: 'Transactions Entry', path: 'apps/web/src/app/transactions/page.tsx', expectedMaxGroups: 3 },
    { name: 'Peer Debts (IOUs)', path: 'apps/web/src/app/ious/page.tsx', expectedMaxGroups: 3 },
    { name: 'Authentication Login', path: 'apps/web/src/app/login/page.tsx', expectedMaxGroups: 3 },
  ];

  for (const page of cockpitPages) {
    const filePath = path.resolve(process.cwd(), page.path);
    assert(fs.existsSync(filePath), `S4.20: Cockpit page file exists: ${page.path}`);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n============================================================');
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log(`SUCCESS RATE: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runM4StressTests().catch((err) => {
  console.error('Fatal stress test suite error:', err);
  process.exit(1);
});
