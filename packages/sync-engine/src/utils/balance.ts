import type { AccountType, EntryDirection, JournalDirection } from '@finvault/db-types';

/**
 * Computes the signed balance delta for an account given its type, entry direction, and amount.
 * Invariant: ASSET and EXPENSE normal balance is DEBIT; all others are CREDIT.
 */
export function computeAccountBalanceDelta(
  accountType: AccountType,
  direction: EntryDirection | JournalDirection,
  amountMinor: bigint
): bigint {
  if (amountMinor <= 0n) {
    throw new Error(`Amount must be positive: ${amountMinor}`);
  }
  if (accountType === 'ASSET' || accountType === 'EXPENSE') {
    return direction === 'DEBIT' ? amountMinor : -amountMinor;
  } else {
    return direction === 'CREDIT' ? amountMinor : -amountMinor;
  }
}

/**
 * Validates double-entry lite invariant: SUM(debits) === SUM(credits).
 * Throws check_violation error if unbalanced.
 */
export function validateTransactionBalance(
  entries: Array<{ amount_minor: bigint; direction: EntryDirection | JournalDirection }>
): void {
  if (!entries || entries.length < 2) {
    throw new Error('Transaction must contain at least two journal entries');
  }

  let sumDebits = 0n;
  let sumCredits = 0n;

  for (const entry of entries) {
    if (entry.amount_minor <= 0n) {
      throw new Error(`Journal entry amount must be strictly positive: ${entry.amount_minor}`);
    }
    if (entry.direction === 'DEBIT') {
      sumDebits += entry.amount_minor;
    } else if (entry.direction === 'CREDIT') {
      sumCredits += entry.amount_minor;
    } else {
      throw new Error(`Invalid direction: ${(entry as any).direction}`);
    }
  }

  if (sumDebits === 0n || sumCredits === 0n) {
    throw new Error(`Transaction missing debit or credit leg: debits=${sumDebits}, credits=${sumCredits}`);
  }

  if (sumDebits !== sumCredits) {
    throw new Error(`Double-entry invariant violated: debits (${sumDebits}) != credits (${sumCredits})`);
  }
}
