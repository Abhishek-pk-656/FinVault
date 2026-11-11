// Adversarial Stress Harness for Zero-Float Functions and Edge Function Logic
import { formatMinorToDecimal, parseDecimalToMinor } from '../../../packages/ui/src/index.tsx';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`[FAIL] ${testName}`, details !== undefined ? details : '');
  }
}

console.log('====================================================');
console.log('CHALLENGER 1: ADVERSARIAL STRESS TEST - ZERO FLOAT');
console.log('====================================================');

// 1. Basic & Canonical cases
assert(parseDecimalToMinor('0') === 0n, 'parseDecimalToMinor("0") === 0n');
assert(parseDecimalToMinor('0.00') === 0n, 'parseDecimalToMinor("0.00") === 0n');
assert(parseDecimalToMinor('1') === 100n, 'parseDecimalToMinor("1") === 100n');
assert(parseDecimalToMinor('1.00') === 100n, 'parseDecimalToMinor("1.00") === 100n');
assert(parseDecimalToMinor('1.5') === 150n, 'parseDecimalToMinor("1.5") === 150n');
assert(parseDecimalToMinor('1.50') === 150n, 'parseDecimalToMinor("1.50") === 150n');
assert(parseDecimalToMinor('123.45') === 12345n, 'parseDecimalToMinor("123.45") === 12345n');

// 2. Negative values
assert(parseDecimalToMinor('-0') === 0n, 'parseDecimalToMinor("-0") === 0n');
assert(parseDecimalToMinor('-0.00') === 0n, 'parseDecimalToMinor("-0.00") === 0n');
assert(parseDecimalToMinor('-1') === -100n, 'parseDecimalToMinor("-1") === -100n');
assert(parseDecimalToMinor('-0.01') === -1n, 'parseDecimalToMinor("-0.01") === -1n');
assert(parseDecimalToMinor('-0.50') === -50n, 'parseDecimalToMinor("-0.50") === -50n');
assert(parseDecimalToMinor('-123.45') === -12345n, 'parseDecimalToMinor("-123.45") === -12345n');

// 3. Degenerate and tricky string inputs
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

// 4. Multiple dots & formatting
assert(parseDecimalToMinor('1.2.3.4') === 123n, 'parseDecimalToMinor("1.2.3.4") removes trailing dots');
assert(parseDecimalToMinor('1,000,000.50') === 100000050n, 'parseDecimalToMinor with thousand commas');
assert(parseDecimalToMinor('₹99,999.99') === 9999999n, 'parseDecimalToMinor with currency symbol');
assert(parseDecimalToMinor('$ 1,234.56') === 123456n, 'parseDecimalToMinor with dollar symbol');

// 5. Truncation of sub-minor precision
assert(parseDecimalToMinor('12.3456') === 1234n, 'parseDecimalToMinor truncates sub-minor fractions');
assert(parseDecimalToMinor('-12.3499') === -1234n, 'parseDecimalToMinor truncates negative sub-minor fractions');

// 6. Large numbers beyond IEEE-754 Number.MAX_SAFE_INTEGER
const bigDec = '9007199254740991.99';
const expectedBigMinor = 900719925474099199n;
assert(parseDecimalToMinor(bigDec) === expectedBigMinor, 'parseDecimalToMinor beyond MAX_SAFE_INTEGER');
assert(formatMinorToDecimal(expectedBigMinor) === bigDec, 'formatMinorToDecimal beyond MAX_SAFE_INTEGER');

// 7. 64-bit Signed Integer Boundaries (PostgreSQL BIGINT range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807)
const maxInt64 = 9223372036854775807n;
const minInt64 = -9223372036854775808n;
const formattedMax = formatMinorToDecimal(maxInt64);
const formattedMin = formatMinorToDecimal(minInt64);
assert(formattedMax === '92233720368547758.07', `formattedMax is ${formattedMax}`);
assert(formattedMin === '-92233720368547758.08', `formattedMin is ${formattedMin}`);
assert(parseDecimalToMinor(formattedMax) === maxInt64, 'parse maxInt64 roundtrips');
assert(parseDecimalToMinor(formattedMin) === minInt64, 'parse minInt64 roundtrips');

// 8. formatMinorToDecimal specific formatting tests
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

// 9. Massive Round-Trip Fuzz (50,000 iterations)
console.log('Running 50,000 random round-trip tests...');
let fuzzPass = 0;
for (let i = 0; i < 50000; i++) {
  // Generate random BigInts across ranges: small (0-1000), medium (1000-10000000), large (up to 10^16)
  let val: bigint;
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
    // Large 64-bit random number
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
    console.error(`Fuzz fail on val=${val}, formatted=${formatted}, parsed=${parsed}`);
    break;
  }
}
assert(fuzzPass === 50000, `50,000 random BigInt round-trips passed (${fuzzPass}/50000)`);

console.log('====================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('====================================================');
if (failed > 0) process.exit(1);
