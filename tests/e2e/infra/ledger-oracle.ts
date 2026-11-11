/**
 * Reference Oracle for FinVault Double-Entry Lite Ledger
 * 
 * Implements authoritative mathematical models and verification invariants
 * for double-entry bookkeeping, multi-split allocations, BIGINT minor units,
 * and account balance transitions.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type EntryDirection = 'DEBIT' | 'CREDIT';

export interface AccountModel {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  balanceMinor: bigint;
  isArchived: boolean;
  version: bigint;
}

export interface JournalEntryModel {
  id: string;
  userId: string;
  transactionId: string;
  accountId: string;
  amountMinor: bigint;
  direction: EntryDirection;
}

export interface TransactionModel {
  id: string;
  userId: string;
  idempotencyKey: string;
  transactionDate: string;
  description: string;
  notes?: string;
  isReconciled: boolean;
  isDeleted: boolean;
  version: bigint;
  entries: JournalEntryModel[];
}

export interface LedgerValidationResult {
  isValid: boolean;
  totalDebits: bigint;
  totalCredits: bigint;
  delta: bigint;
  errorMessage?: string;
}

export class LedgerOracle {
  /**
   * Validates Double-Entry Lite Invariant:
   * SUM(debits) == SUM(credits) and all amountMinor > 0n
   */
  public static validateTransaction(entries: JournalEntryModel[]): LedgerValidationResult {
    if (!entries || entries.length < 2) {
      return {
        isValid: false,
        totalDebits: 0n,
        totalCredits: 0n,
        delta: 0n,
        errorMessage: 'A transaction must contain at least two journal entries'
      };
    }

    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const entry of entries) {
      // Validate BIGINT type
      if (typeof entry.amountMinor !== 'bigint') {
        return {
          isValid: false,
          totalDebits,
          totalCredits,
          delta: totalDebits - totalCredits,
          errorMessage: `Non-bigint monetary amount detected: ${typeof entry.amountMinor}. Floating-point money prohibited.`
        };
      }

      // Check positive amount constraint: amount_minor > 0
      if (entry.amountMinor <= 0n) {
        return {
          isValid: false,
          totalDebits,
          totalCredits,
          delta: totalDebits - totalCredits,
          errorMessage: `Journal entry amount must be strictly positive (> 0n), received: ${entry.amountMinor}n`
        };
      }

      if (entry.direction === 'DEBIT') {
        totalDebits += entry.amountMinor;
      } else if (entry.direction === 'CREDIT') {
        totalCredits += entry.amountMinor;
      } else {
        return {
          isValid: false,
          totalDebits,
          totalCredits,
          delta: totalDebits - totalCredits,
          errorMessage: `Invalid direction: ${(entry as any).direction}`
        };
      }
    }

    const delta = totalDebits - totalCredits;
    const isValid = delta === 0n;

    return {
      isValid,
      totalDebits,
      totalCredits,
      delta,
      errorMessage: isValid ? undefined : `Ledger imbalance: debits (${totalDebits}n) != credits (${totalCredits}n), delta: ${delta}n`
    };
  }

  /**
   * Computes the balance change for an account given an entry direction and amount
   * ASSET & EXPENSE: Debit (+), Credit (-)
   * LIABILITY, EQUITY, INCOME: Credit (+), Debit (-)
   */
  public static calculateBalanceDelta(accountType: AccountType, direction: EntryDirection, amountMinor: bigint): bigint {
    if (accountType === 'ASSET' || accountType === 'EXPENSE') {
      return direction === 'DEBIT' ? amountMinor : -amountMinor;
    } else {
      return direction === 'CREDIT' ? amountMinor : -amountMinor;
    }
  }

  /**
   * Evaluates the fundamental accounting equation across all accounts:
   * SUM(Assets) - SUM(Liabilities) == SUM(Equity) + (SUM(Income) - SUM(Expenses))
   */
  public static verifyAccountingEquation(accounts: AccountModel[]): { isBalanced: boolean; netWorth: bigint; equationDelta: bigint } {
    let assets = 0n;
    let liabilities = 0n;
    let equity = 0n;
    let income = 0n;
    let expenses = 0n;

    for (const acc of accounts) {
      switch (acc.type) {
        case 'ASSET':
          assets += acc.balanceMinor;
          break;
        case 'LIABILITY':
          liabilities += acc.balanceMinor;
          break;
        case 'EQUITY':
          equity += acc.balanceMinor;
          break;
        case 'INCOME':
          income += acc.balanceMinor;
          break;
        case 'EXPENSE':
          expenses += acc.balanceMinor;
          break;
      }
    }

    const netWorth = assets - liabilities;
    const retainedEarnings = income - expenses;
    const rightHandSide = equity + retainedEarnings;
    const equationDelta = netWorth - rightHandSide;

    return {
      isBalanced: equationDelta === 0n,
      netWorth,
      equationDelta
    };
  }

  /**
   * Parse decimal currency string to BIGINT minor units safely without float error.
   * e.g. "123.45" -> 12345n (for 2 decimal currency like INR/USD)
   */
  public static parseDecimalToMinor(input: string, decimals: number = 2): bigint {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Cannot parse empty string as currency');
    }

    // Prohibit exponential notation, NaNs, floats with trailing garbage
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid monetary decimal format: "${input}"`);
    }

    const isNegative = trimmed.startsWith('-');
    const cleanStr = isNegative ? trimmed.slice(1) : trimmed;

    const parts = cleanStr.split('.');
    const integerPart = parts[0];
    let fractionPart = parts[1] || '';

    if (fractionPart.length > decimals) {
      throw new Error(`Monetary precision overflow: maximum ${decimals} decimal places allowed, received ${fractionPart.length}`);
    }

    // Pad with zeroes up to decimals count
    while (fractionPart.length < decimals) {
      fractionPart += '0';
    }

    const minorStr = integerPart + fractionPart;
    const result = BigInt(minorStr);
    return isNegative ? -result : result;
  }

  /**
   * Format minor units back to standard decimal string
   */
  public static formatMinorToDecimal(amountMinor: bigint, decimals: number = 2): string {
    const isNegative = amountMinor < 0n;
    const absVal = isNegative ? -amountMinor : amountMinor;
    const str = absVal.toString().padStart(decimals + 1, '0');
    const integerPart = str.slice(0, str.length - decimals);
    const fractionPart = str.slice(str.length - decimals);
    return `${isNegative ? '-' : ''}${integerPart}.${fractionPart}`;
  }
}
