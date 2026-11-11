/**
 * Lossless BigInt currency formatting and parsing utilities.
 * Completely eliminates floating-point arithmetic (IEEE-754) errors.
 */

/**
 * Formats BigInt minor units (e.g. paise/cents) to a standard decimal string.
 * @param amountMinor - Monetary amount in minor units as BigInt (e.g. 1234n)
 * @param decimals - Number of decimal positions (default: 2)
 * @returns Formatted decimal string (e.g. "12.34", "-0.50", "0.00")
 */
export function formatMinorToDecimal(amountMinor: bigint, decimals: number = 2): string {
  const isNegative = amountMinor < 0n;
  const absVal = isNegative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(decimals);
  const whole = absVal / divisor;
  const frac = absVal % divisor;
  return `${isNegative ? '-' : ''}${whole}.${frac.toString().padStart(decimals, '0')}`;
}

/**
 * Formats BigInt minor units to currency display with symbol.
 * @param amountMinor - Monetary amount in minor units
 * @param symbol - Currency symbol (default: "₹")
 * @param decimals - Number of decimal positions (default: 2)
 */
export function formatCurrency(amountMinor: bigint, symbol: string = '₹', decimals: number = 2): string {
  const isNegative = amountMinor < 0n;
  const decimalStr = formatMinorToDecimal(isNegative ? -amountMinor : amountMinor, decimals);
  return `${isNegative ? '-' : ''}${symbol}${decimalStr}`;
}

/**
 * Safely parses human-entered decimal string into BigInt minor units.
 * Operates purely via string parsing and BigInt arithmetic.
 * Handles partial inputs during typing ("", ".", "-") returning 0n safely.
 *
 * @param input - Raw input string
 * @param decimals - Number of decimal positions (default: 2)
 */
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
