/**
 * Zero-Float BigInt Money Formatting & Parsing
 * 
 * Complies with FinVault Rule 01 & PRD:
 * - Pure integer arithmetic in BigInt minor units (paise/cents).
 * - Zero IEEE-754 binary floating-point representation.
 * - Prevents runtime serialization crashes in React Native.
 */

export function formatMinorToDecimal(amountMinor: bigint, decimals: number = 2): string {
  const isNegative = amountMinor < 0n;
  const absVal = isNegative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(decimals);
  const whole = absVal / divisor;
  const frac = absVal % divisor;
  return `${isNegative ? '-' : ''}${whole}.${frac.toString().padStart(decimals, '0')}`;
}

export function formatCurrency(
  amountMinor: bigint,
  symbol: string = '₹',
  decimals: number = 2
): string {
  const isNegative = amountMinor < 0n;
  const absVal = isNegative ? -amountMinor : amountMinor;
  const decimalStr = formatMinorToDecimal(absVal, decimals);
  return `${isNegative ? '-' : ''}${symbol}${decimalStr}`;
}

export function parseDecimalToMinor(input: string, decimals: number = 2): bigint {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '.' || trimmed === '-' || trimmed === '-.') {
    return 0n;
  }
  const isNegative = trimmed.startsWith('-');
  const cleanStr = isNegative ? trimmed.slice(1) : trimmed;

  const dotIndex = cleanStr.indexOf('.');
  let integerPart: string;
  let fractionPart: string;

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
