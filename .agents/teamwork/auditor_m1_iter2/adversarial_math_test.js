// Adversarial Math Verification Script for parseDecimalToMinor and formatMinorToDecimal

// Exact code from packages/ui/src/index.tsx
function formatMinorToDecimal(amountMinor, decimals = 2) {
  const isNegative = amountMinor < 0n;
  const absVal = isNegative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(decimals);
  const whole = absVal / divisor;
  const frac = absVal % divisor;
  return `${isNegative ? '-' : ''}${whole}.${frac.toString().padStart(decimals, '0')}`;
}

function parseDecimalToMinor(input, decimals = 2) {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '.' || trimmed === '-' || trimmed === '-.') {
    return 0n;
  }

  const isNegative = trimmed.startsWith('-');
  const cleanStr = isNegative ? trimmed.slice(1) : trimmed;

  const dotIndex = cleanStr.indexOf('.');
  let integerPart;
  let fractionPart;

  if (dotIndex === -1) {
    integerPart = cleanStr;
    fractionPart = '';
  } else {
    integerPart = cleanStr.slice(0, dotIndex);
    fractionPart = cleanStr.slice(dotIndex + 1).replace(/\./g, '');
  }

  const cleanInt = integerPart.replace(/\D/g, '') || '0';
  const cleanFrac = fractionPart.replace(/\D/g, '').slice(0, decimals).padEnd(decimals, '0');

  const divisor = 10n ** BigInt(decimals);
  const result = BigInt(cleanInt) * divisor + BigInt(cleanFrac);
  return isNegative && result !== 0n ? -result : result;
}

let assertions = 0;
function assertEq(actual, expected, desc) {
  assertions++;
  if (actual !== expected) {
    throw new Error(`FAIL: ${desc} - expected ${expected}, got ${actual}`);
  }
}

console.log('Testing specific edge cases...');

// 1. Boundary & degenerate inputs
assertEq(parseDecimalToMinor(''), 0n, 'empty string');
assertEq(parseDecimalToMinor('   '), 0n, 'spaces');
assertEq(parseDecimalToMinor('.'), 0n, 'single dot');
assertEq(parseDecimalToMinor('-'), 0n, 'single minus');
assertEq(parseDecimalToMinor('-.'), 0n, 'minus dot');
assertEq(parseDecimalToMinor('0'), 0n, 'zero string');
assertEq(parseDecimalToMinor('0.00'), 0n, '0.00');
assertEq(parseDecimalToMinor('-0.00'), 0n, '-0.00');
assertEq(parseDecimalToMinor('-0'), 0n, '-0');

// 2. Normal formatting and parsing
assertEq(formatMinorToDecimal(0n), '0.00', 'format 0n');
assertEq(formatMinorToDecimal(1n), '0.01', 'format 1n');
assertEq(formatMinorToDecimal(9n), '0.09', 'format 9n');
assertEq(formatMinorToDecimal(10n), '0.10', 'format 10n');
assertEq(formatMinorToDecimal(99n), '0.99', 'format 99n');
assertEq(formatMinorToDecimal(100n), '1.00', 'format 100n');
assertEq(formatMinorToDecimal(1234n), '12.34', 'format 1234n');

// 3. Negative formatting and parsing
assertEq(formatMinorToDecimal(-1n), '-0.01', 'format -1n');
assertEq(formatMinorToDecimal(-9n), '-0.09', 'format -9n');
assertEq(formatMinorToDecimal(-10n), '-0.10', 'format -10n');
assertEq(formatMinorToDecimal(-50n), '-0.50', 'format -50n');
assertEq(formatMinorToDecimal(-100n), '-1.00', 'format -100n');
assertEq(formatMinorToDecimal(-1234n), '-12.34', 'format -1234n');

// 4. Decimal parsing variations
assertEq(parseDecimalToMinor('.5'), 50n, 'parse .5');
assertEq(parseDecimalToMinor('.05'), 5n, 'parse .05');
assertEq(parseDecimalToMinor('-.5'), -50n, 'parse -.5');
assertEq(parseDecimalToMinor('-.05'), -5n, 'parse -.05');
assertEq(parseDecimalToMinor('12.3'), 1230n, 'parse 12.3');
assertEq(parseDecimalToMinor('12.34'), 1234n, 'parse 12.34');
assertEq(parseDecimalToMinor('12.3456'), 1234n, 'parse 12.3456 (truncates to 2 decimals)');
assertEq(parseDecimalToMinor('-12.34'), -1234n, 'parse -12.34');

// 5. Extreme 64-bit integer numbers
const maxInt64 = 9223372036854775807n;
const minInt64 = -9223372036854775808n;
const formattedMax = formatMinorToDecimal(maxInt64);
assertEq(formattedMax, '92233720368547758.07', 'format max int64');
assertEq(parseDecimalToMinor(formattedMax), maxInt64, 'parse max int64');

const formattedMin = formatMinorToDecimal(minInt64);
assertEq(formattedMin, '-92233720368547758.08', 'format min int64');
assertEq(parseDecimalToMinor(formattedMin), minInt64, 'parse min int64');

// 6. Roundtrip Fuzzing: 50,000 iterations
console.log('Running 50,000 round-trip fuzz tests...');
for (let i = 0; i < 50000; i++) {
  // Generate random BigInt between -10^15 and 10^15
  const high = BigInt(Math.floor(Math.random() * 100000000));
  const low = BigInt(Math.floor(Math.random() * 100000000));
  const sign = Math.random() < 0.5 ? -1n : 1n;
  const val = sign * (high * 100000000n + low);

  const formatted = formatMinorToDecimal(val);
  const parsed = parseDecimalToMinor(formatted);
  if (parsed !== val) {
    throw new Error(`Roundtrip mismatch for ${val}: formatted as "${formatted}", parsed as ${parsed}`);
  }
}

console.log(`ALL TESTS PASSED! (${assertions} explicit assertions + 50,000 fuzz rounds clean)`);
