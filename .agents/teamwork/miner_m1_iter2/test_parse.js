function parseDecimalToMinor(input, decimals = 2) {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0n;
  }

  const isNegative = trimmed.startsWith('-');
  const cleanStr = isNegative ? trimmed.slice(1) : trimmed;

  const parts = cleanStr.split('.');
  const integerPart = parts[0] || '0';
  let fractionPart = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');

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

const testInputs = [
  "",
  "   ",
  ".",
  "0",
  "0.0",
  "0.00",
  "-0.00",
  "0.01",
  "-0.01",
  "0.5",
  "0.50",
  ".75",
  "12",
  "12.",
  "12.3",
  "12.34",
  "12.345",
  "1000000000000.50",
  "-1234.56",
  "9007199254740992.00"
];

for (const input of testInputs) {
  const minor = parseDecimalToMinor(input);
  const back = formatMinorToDecimal(minor);
  console.log(`${JSON.stringify(input)} => minor: ${minor.toString()}n => formatted: ${JSON.stringify(back)}`);
}
