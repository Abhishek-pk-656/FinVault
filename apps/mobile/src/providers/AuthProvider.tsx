import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase/client';
import { authenticateWithBiometrics } from '../lib/auth/biometrics';
import {
  handleAuthRedirectUrl,
  signInWithEmailMobile,
  signInWithGoogleMobile,
  signOutMobile,
  type MobileAuthResult,
} from '../lib/auth/oauth';

interface AuthContextValue {
  session: Session | null;
  userId: string;
  userEmail: string | null;
  isAuthLoading: boolean;
  isBiometricUnlocked: boolean;
  unlockBiometrics: () => void;
  signInWithGoogle: () => Promise<MobileAuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<MobileAuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isBiometricUnlocked, setIsBiometricUnlocked] = useState<boolean>(false);
  const biometricCheckedOnBootRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('auth/callback')) {
          await handleAuthRedirectUrl(initialUrl);
        }

        const { data } = await supabase.auth.getSession();
        const existingSession = data?.session ?? null;

        if (!mounted) return;
        setSession(existingSession);

        if (existingSession && !biometricCheckedOnBootRef.current) {
          biometricCheckedOnBootRef.current = true;
          const bioRes = await authenticateWithBiometrics();
          if (mounted && bioRes.success) {
            setIsBiometricUnlocked(true);
          }
        }
      } catch (err) {
        console.warn('[FinVault Auth] Session bootstrap error:', err);
      } finally {
        if (mounted) {
          setIsAuthLoading(false);
        }
      }
    }

    bootstrapAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);

      if (event === 'SIGNED_OUT' || !nextSession) {
        setIsBiometricUnlocked(false);
      } else if (event === 'SIGNED_IN') {
        setIsBiometricUnlocked(true);
      }
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('auth/callback')) {
        void handleAuthRedirectUrl(url);
      }
    });

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      linkSub.remove();
      appStateSub.remove();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    userId: session?.user?.id ?? 'local-user',
    userEmail: session?.user?.email ?? null,
    isAuthLoading,
    isBiometricUnlocked,
    unlockBiometrics: () => setIsBiometricUnlocked(true),
    signInWithGoogle: async () => {
      const res = await signInWithGoogleMobile();
      if (res.success) {
        setIsBiometricUnlocked(true);
      }
      return res;
    },
    signInWithEmail: async (email: string, password: string) => {
      const res = await signInWithEmailMobile(email, password);
      if (res.success) {
        setIsBiometricUnlocked(true);
      }
      return res;
    },
    signOut: async () => {
      await signOutMobile();
      setSession(null);
      setIsBiometricUnlocked(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
