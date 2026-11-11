'use client';

import React, { useState } from 'react';
import { Card, Button } from '@finvault/ui';
import { ShieldCheck, Lock, Chrome, ArrowRight } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Google authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = () => {
    // In local demo or offline mode, navigate directly to cockpit
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#040A0A]">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7AAA4A]/20 border border-[#7AAA4A]/40 text-[#7AAA4A] shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#DEEEDA]">FinVault</h1>
          <p className="text-xs text-[#90A999] tracking-wider uppercase font-medium">
            Privacy-Preserving Wealth & Ledger Cockpit
          </p>
        </div>

        {/* Minimalist Authentication Card */}
        <Card variant="surface" className="p-8 shadow-2xl space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[#38424C]">Authenticate Session</h2>
            <p className="text-xs text-[#90A999]">
              Zero-knowledge client encryption with Supabase Row Level Security.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#E06A55]/15 border border-[#E06A55]/30 text-[#E06A55] text-xs font-medium">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Primary Google OAuth Sign-in */}
            <Button
              variant="primary"
              size="lg"
              onClick={handleGoogleSignIn}
              isLoading={isLoading}
              className="w-full flex items-center justify-center gap-2.5 py-3 shadow-md"
            >
              <Chrome className="h-4 w-4" />
              <span>Continue with Google (Gmail)</span>
            </Button>

            {/* Offline / Local Demo Bypass */}
            <Button
              variant="outline"
              size="md"
              onClick={handleDemoSignIn}
              className="w-full flex items-center justify-center gap-2 border-[#C7E0BA] text-[#38424C] hover:bg-[#040A0A]/5"
            >
              <Lock className="h-4 w-4 text-[#90A999]" />
              <span>Launch Local Cockpit Demo</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1 text-[#90A999]" />
            </Button>
          </div>

          {/* Privacy Footnote */}
          <div className="pt-4 border-t border-[#C7E0BA] text-center">
            <p className="text-[11px] text-[#90A999] leading-relaxed">
              Protected by hardware SQLCipher key derivation and deferred server-side double-entry triggers.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
