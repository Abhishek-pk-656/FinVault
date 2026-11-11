export interface PreValidationResult {
  isValid: boolean;
  differenceMinor: bigint;
  totalDebitsMinor: bigint;
  totalCreditsMinor: bigint;
  error?: string;
}

export function validateTransactionEntries(
  entries: { account_id: string; amount_minor: bigint; direction: 'DEBIT' | 'CREDIT' }[]
): PreValidationResult {
  if (!entries || entries.length < 2) {
    return {
      isValid: false,
      differenceMinor: 0n,
      totalDebitsMinor: 0n,
      totalCreditsMinor: 0n,
      error: 'A transaction must contain at least two entries.',
    };
  }

  let debits = 0n;
  let credits = 0n;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} is invalid.`,
      };
    }

    if (!entry.account_id || entry.account_id.trim() === '') {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} is missing a selected account.`,
      };
    }

    if (entry.amount_minor <= 0n) {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} amount must be greater than zero.`,
      };
    }

    if (entry.direction === 'DEBIT') {
      debits += entry.amount_minor;
    } else if (entry.direction === 'CREDIT') {
      credits += entry.amount_minor;
    } else {
      return {
        isValid: false,
        differenceMinor: 0n,
        totalDebitsMinor: debits,
        totalCreditsMinor: credits,
        error: `Entry #${i + 1} has an invalid direction.`,
      };
    }
  }

  if (debits === 0n || credits === 0n) {
    return {
      isValid: false,
      differenceMinor: debits - credits,
      totalDebitsMinor: debits,
      totalCreditsMinor: credits,
      error: 'A transaction cannot be single-sided (must have both debits and credits).',
    };
  }

  const diff = debits - credits;
  if (diff !== 0n) {
    return {
      isValid: false,
      differenceMinor: diff,
      totalDebitsMinor: debits,
      totalCreditsMinor: credits,
      error: `Double-entry violation: debits (${debits}) do not equal credits (${credits}). Difference: ${diff}`,
    };
  }

  return {
    isValid: true,
    differenceMinor: 0n,
    totalDebitsMinor: debits,
    totalCreditsMinor: credits,
  };
}
