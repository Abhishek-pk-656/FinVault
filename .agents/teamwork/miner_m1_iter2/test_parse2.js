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

const tests = [
  "", "   ", ".", "-.", "-0", "-0.00", "0", "0.00", "0.01", "-0.01",
  ".5", ".05", "12", "12.", "12.3", "12.34", "12.345", "-12.34",
  "$12.34", "1,234.56", "9007199254740992.00", "92233720368547758.07"
];

for (const t of tests) {
  console.log(`${JSON.stringify(t)} => ${parseDecimalToMinor(t).toString()}n`);
}
