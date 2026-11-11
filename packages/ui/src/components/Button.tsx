import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * Venzer Button Primitive
 * Strictly enforces 12px control radius (rounded-xl), <= 180ms ease-out, zero bouncy springs.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 ease-out active:scale-[0.98] select-none',
          'focus:outline-none focus:ring-2 focus:ring-[#7AAA4A] focus:ring-offset-1 focus:ring-offset-[#040A0A]',
          'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
          // Radii: 12px interactive control
          'rounded-xl',
          // Sizes
          size === 'sm' && 'px-3 py-1.5 text-xs',
          size === 'md' && 'px-5 py-2.5 text-sm',
          size === 'lg' && 'px-6 py-3 text-base',
          // Variants
          variant === 'primary' && 'bg-[#7AAA4A] text-white hover:bg-[#68943f]',
          variant === 'secondary' && 'bg-[#C7E0BA] text-[#38424C] hover:bg-[#b8d4ab]',
          variant === 'outline' && 'bg-transparent text-[#DEEEDA] border border-[#38424C] hover:bg-[#DEEEDA]/10',
          variant === 'ghost' && 'bg-transparent text-[#90A999] hover:text-[#DEEEDA] hover:bg-[#DEEEDA]/10',
          variant === 'danger' && 'bg-[#E06A55] text-white hover:bg-[#c85845]',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Loading...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';
