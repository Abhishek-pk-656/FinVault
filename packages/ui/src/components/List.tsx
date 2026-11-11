import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Venzer List Container
 * Clean, uncluttered list wrapper.
 */
export const List = React.forwardRef<HTMLDivElement, ListProps>(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('divide-y divide-[#38424C]/30 w-full', className)} {...props}>
      {children}
    </div>
  );
});
List.displayName = 'List';

export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  primary: React.ReactNode;     // Attribute 1: Main title / counterparty
  secondary?: React.ReactNode;  // Attribute 2: Category / date / badge
  metric: React.ReactNode;      // Attribute 3: Minor BigInt amount
  action?: React.ReactNode;     // Optional compact control
}

/**
 * Venzer ListItem
 * Strictly enforces maximum 3 data attributes per row:
 * 1. Primary Title
 * 2. Secondary Subtitle / Chip
 * 3. Metric Amount
 */
export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  ({ className, primary, secondary, metric, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between py-3 px-2 rounded-xl transition-colors duration-150 ease-out hover:bg-[#DEEEDA]/5',
          className
        )}
        {...props}
      >
        <div className="flex flex-col min-w-0 pr-4">
          <div className="text-sm font-medium text-[#DEEEDA] truncate">{primary}</div>
          {secondary && <div className="text-xs text-[#90A999] mt-0.5 truncate">{secondary}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-sm font-semibold tabular-nums text-right">{metric}</div>
          {action && <div className="ml-1">{action}</div>}
        </div>
      </div>
    );
  }
);
ListItem.displayName = 'ListItem';
