'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, TrendingUp, ArrowLeftRight, Users } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Net Worth', icon: Wallet },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { href: '/transactions', label: 'Splits', icon: ArrowLeftRight },
  { href: '/ious', label: 'IOUs', icon: Users },
];

export const MobileTabBar: React.FC = () => {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-4 h-16 items-center">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center h-full min-h-[48px] gap-1 transition-colors duration-150 ease-out ${
              isActive ? 'text-[#7AAA4A]' : 'text-[#90A999] hover:text-[#DEEEDA]'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
};
