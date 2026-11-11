import React, { useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop: Obsidian Carbon with blur, <= 180ms ease-out */}
      <div
        className="fixed inset-0 bg-[#040A0A]/80 backdrop-blur-sm transition-opacity duration-150 ease-out"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Dialog container: 24px radius (rounded-3xl) */}
      <div className="relative z-50 w-full max-w-lg transition-all duration-150 ease-out">
        {children}
      </div>
    </div>
  );
};

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }
>(({ className, onClose, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-3xl bg-[#040A0A] border border-[#38424C] p-6 shadow-2xl text-[#DEEEDA]',
      className
    )}
    role="dialog"
    aria-modal="true"
    {...props}
  >
    {onClose && (
      <button
        onClick={onClose}
        className="absolute top-5 right-5 p-1 rounded-xl text-[#90A999] hover:text-[#DEEEDA] hover:bg-[#DEEEDA]/10 transition-colors duration-150 ease-out"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    )}
    {children}
  </div>
));
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 pb-4 border-b border-[#38424C]', className)} {...props} />
);

export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-bold text-[#DEEEDA]', className)} {...props} />
);

export const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-xs text-[#90A999]', className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-end gap-3 pt-6 border-t border-[#38424C]', className)} {...props} />
);
