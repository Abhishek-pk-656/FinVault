import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatMinorToDecimal } from '../utils/money';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface BalanceBadgeProps {
  differenceMinor: bigint;
  currencyPrefix?: string;
  decimals?: number;
  className?: string;
}

/**
 * Venzer BalanceBadge Component
 * Real-time double-entry indicator:
 * - Green (#7AAA4A) "Balanced" when differenceMinor === 0n
 * - Terracotta Alert (#E06A55) "Difference: [delta]" when unbalanced
 */
export const BalanceBadge: React.FC<BalanceBadgeProps> = ({
  differenceMinor,
  currencyPrefix = '₹',
  decimals = 2,
  className,
}) => {
  const isBalanced = differenceMinor === 0n;
  const formattedDifference = formatMinorToDecimal(differenceMinor, decimals);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 ease-out select-none',
        isBalanced
          ? 'bg-[#7AAA4A]/15 text-[#7AAA4A] border border-[#7AAA4A]/30'
          : 'bg-[#E06A55]/15 text-[#E06A55] border border-[#E06A55]/30',
        className
      )}
      role="status"
      aria-label={isBalanced ? 'Ledger Balanced' : `Ledger Imbalance of ${currencyPrefix}${formattedDifference}`}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full transition-colors duration-150 ease-out',
          isBalanced ? 'bg-[#7AAA4A]' : 'bg-[#E06A55]'
        )}
      />
      {isBalanced ? 'Balanced' : `Difference: ${currencyPrefix}${formattedDifference}`}
    </span>
  );
};
