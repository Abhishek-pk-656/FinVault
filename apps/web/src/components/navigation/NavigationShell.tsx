'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileTabBar } from './MobileTabBar';
import { TopBar } from './TopBar';

interface NavigationShellProps {
  children: React.ReactNode;
  userEmail?: string;
}

export const NavigationShell: React.FC<NavigationShellProps> = ({
  children,
  userEmail = 'user@finvault.local',
}) => {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <div className="min-h-screen bg-[#040A0A] text-[#DEEEDA]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#040A0A] text-[#DEEEDA]">
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col border-r border-[#38424C]/40 bg-[#040A0A] z-30">
        <DesktopSidebar userEmail={userEmail} />
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        <TopBar userEmail={userEmail} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (hidden on desktop) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#040A0A]/95 backdrop-blur-md border-t border-[#38424C]/40">
        <MobileTabBar />
      </nav>
    </div>
  );
};
