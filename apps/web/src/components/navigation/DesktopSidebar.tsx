'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
  Users,
  LogOut,
  CircleDot,
} from 'lucide-react';

interface DesktopSidebarProps {
  userEmail?: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Net Worth', icon: Wallet },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/ious', label: 'Peer IOUs', icon: Users },
];

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ userEmail = 'user@finvault.local' }) => {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full justify-between p-4 bg-[#040A0A]">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="h-9 w-9 rounded-2xl bg-[#7AAA4A]/20 border border-[#7AAA4A]/40 flex items-center justify-center text-[#7AAA4A]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-lg text-[#DEEEDA]">FinVault</span>
            <p className="text-[11px] text-[#90A999] tracking-wider uppercase font-medium">Private Ledger</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ease-out ${
                  isActive
                    ? 'bg-[#7AAA4A]/15 text-[#7AAA4A] border-l-2 border-[#7AAA4A]'
                    : 'text-[#90A999] hover:text-[#DEEEDA] hover:bg-[#38424C]/20'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Session Footer */}
      <div className="border-t border-[#38424C]/40 pt-4 px-2 space-y-3">
        <div className="flex items-center justify-between text-xs text-[#90A999]">
          <div className="flex items-center gap-1.5">
            <CircleDot className="h-3 w-3 text-[#7AAA4A] animate-pulse" />
            <span>Synced</span>
          </div>
          <span className="truncate max-w-[120px]" title={userEmail}>
            {userEmail}
          </span>
        </div>
        <Link
          href="/login"
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#90A999] hover:text-[#E06A55] rounded-xl hover:bg-rose-500/10 transition-colors duration-150 ease-out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </Link>
      </div>
    </div>
  );
};
