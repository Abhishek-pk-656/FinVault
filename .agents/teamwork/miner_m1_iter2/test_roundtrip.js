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

function formatMinorToDecimal(amountMinor, decimals = 2) {
  const isNegative = amountMinor < 0n;
  const absVal = isNegative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(decimals);
  const whole = absVal / divisor;
  const frac = absVal % divisor;
  return `${isNegative ? '-' : ''}${whole}.${frac.toString().padStart(decimals, '0')}`;
}

// Round-trip testing: minor -> format -> parse -> assert equal
const values = [
  0n, 1n, 2n, 9n, 10n, 11n, 99n, 100n, 101n,
  -1n, -2n, -9n, -10n, -11n, -99n, -100n, -101n,
  123456789n, -123456789n,
  900719925474099200n, -900719925474099200n,
  9223372036854775807n, -9223372036854775807n
];

let failed = 0;
for (const v of values) {
  const formatted = formatMinorToDecimal(v);
  const parsed = parseDecimalToMinor(formatted);
  if (parsed !== v) {
    console.error(`FAILED for ${v}n: formatted="${formatted}", parsed=${parsed}n`);
    failed++;
  }
}

if (failed === 0) {
  console.log(`All ${values.length} round-trip assertions PASSED perfectly!`);
} else {
  console.error(`${failed} assertions FAILED`);
  process.exitCode = 1;
}

// Fuzz testing 10,000 random BigInts
const crypto = require('crypto');
let fuzzFailed = 0;
for (let i = 0; i < 10000; i++) {
  // Generate random 64-bit integer
  const buf = crypto.randomBytes(8);
  let rand = buf.readBigInt64BE();
  const formatted = formatMinorToDecimal(rand);
  const parsed = parseDecimalToMinor(formatted);
  if (parsed !== rand) {
    console.error(`FUZZ FAILED for ${rand}n: formatted="${formatted}", parsed=${parsed}n`);
    fuzzFailed++;
    break;
  }
}
if (fuzzFailed === 0) {
  console.log('10,000 / 10,000 Fuzz random tests PASSED!');
} else {
  process.exitCode = 1;
}
