'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck, CircleDot } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Net Worth Cockpit',
  '/cash-flow': 'Cash Flow Trajectory',
  '/transactions': 'Multi-Split Transaction Entry',
  '/ious': 'Peer Debt & IOU Tracking',
  '/login': 'Authentication',
};

export const TopBar: React.FC<{ userEmail?: string }> = ({ userEmail = 'user@finvault.local' }) => {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'Cockpit';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#38424C]/40 bg-[#040A0A]/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2.5">
        <div className="md:hidden flex items-center justify-center h-8 w-8 rounded-xl bg-[#7AAA4A]/20 text-[#7AAA4A]">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <h1 className="text-sm font-semibold tracking-wide text-[#DEEEDA] sm:text-base">{title}</h1>
      </div>
      <div className="flex items-center gap-3 text-xs text-[#90A999]">
        <div className="flex items-center gap-1.5">
          <CircleDot className="h-2.5 w-2.5 text-[#7AAA4A] animate-pulse" />
          <span className="hidden sm:inline">Encrypted SQLite</span>
        </div>
        <span className="hidden md:inline text-xs text-[#38424C]">|</span>
        <span className="hidden md:inline truncate max-w-[140px]">{userEmail}</span>
      </div>
    </header>
  );
};
