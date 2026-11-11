import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatMinorToDecimal, parseDecimalToMinor } from '../utils/money';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  valueMinor: bigint;
  onChangeMinor: (val: bigint) => void;
  currencyPrefix?: string;
  decimals?: number;
  allowNegative?: boolean;
  variant?: 'surface' | 'dark';
}

/**
 * Venzer AmountInput Component
 * Zero floating-point arithmetic. Manages internal text state during active typing
 * to allow seamless decimal input (".") without jumping cursors.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      valueMinor,
      onChangeMinor,
      currencyPrefix = '₹',
      decimals = 2,
      allowNegative = false,
      variant = 'surface',
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    // Local string buffer to handle in-progress typing (e.g. "12.")
    const [rawInput, setRawInput] = useState<string>(() => formatMinorToDecimal(valueMinor, decimals));
    const [isFocused, setIsFocused] = useState<boolean>(false);

    // Keep internal buffer in sync when external valueMinor changes while not actively focused
    useEffect(() => {
      if (!isFocused) {
        setRawInput(formatMinorToDecimal(valueMinor, decimals));
      }
    }, [valueMinor, decimals, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;

      // Filter characters: digits, one decimal point, optional leading minus
      if (!allowNegative) {
        val = val.replace(/-/g, '');
      } else {
        const isNegative = val.startsWith('-');
        val = (isNegative ? '-' : '') + val.replace(/-/g, '');
      }

      // Restrict to single dot
      const parts = val.split('.');
      if (parts.length > 2) {
        val = parts[0] + '.' + parts.slice(1).join('');
      }

      // Clean non-numeric except dot and minus
      val = val.replace(/[^0-9.-]/g, '');

      setRawInput(val);
      const parsedMinor = parseDecimalToMinor(val, decimals);
      onChangeMinor(parsedMinor);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Canonicalize decimal display on blur
      setRawInput(formatMinorToDecimal(valueMinor, decimals));
      props.onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    return (
      <div className="relative flex items-center w-full">
        {currencyPrefix && (
          <span
            className={cn(
              'absolute left-3.5 select-none text-sm font-semibold pointer-events-none',
              variant === 'surface' ? 'text-[#90A999]' : 'text-[#90A999]'
            )}
          >
            {currencyPrefix}
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={rawInput}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            'w-full rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 ease-out',
            currencyPrefix ? 'pl-8' : 'pl-4',
            'focus:outline-none focus:ring-2 focus:ring-[#7AAA4A] focus:border-transparent',
            'disabled:opacity-50 disabled:pointer-events-none',
            variant === 'surface'
              ? 'bg-[#DEEEDA] text-[#38424C] border border-[#C7E0BA] placeholder-[#90A999]'
              : 'bg-[#040A0A] text-[#DEEEDA] border border-[#38424C] placeholder-[#90A999]',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
AmountInput.displayName = 'AmountInput';
