import type { Metadata } from 'next';
import './globals.css';
import { NavigationShell } from '../components/navigation';

export const metadata: Metadata = {
  title: 'FinVault — Private Wealth & Ledger Cockpit',
  description: 'Privacy-focused local-first personal finance, money lending, and wealth management platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#040A0A] text-[#DEEEDA] antialiased">
        <NavigationShell>
          {children}
        </NavigationShell>
      </body>
    </html>
  );
}
