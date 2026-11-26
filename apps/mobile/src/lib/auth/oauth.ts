import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase/client';

if (typeof WebBrowser.maybeCompleteAuthSession === 'function') {
  WebBrowser.maybeCompleteAuthSession();
}

export const MOBILE_AUTH_REDIRECT_URI = 'finvault://auth/callback';

export interface MobileAuthResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

export async function signInWithGoogleMobile(): Promise<MobileAuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: MOBILE_AUTH_REDIRECT_URI,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error || !data?.url) {
      return { success: false, error: error?.message || 'Failed to generate Google OAuth URL' };
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      MOBILE_AUTH_REDIRECT_URI
    );

    if (browserResult.type === 'success' && browserResult.url) {
      return await handleAuthRedirectUrl(browserResult.url);
    }

    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
      return { success: false, cancelled: true, error: 'Google sign-in was cancelled' };
    }

    return { success: false, error: 'Google authentication did not complete' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown Google authentication error';
    return { success: false, error: message };
  }
}

export async function signInWithEmailMobile(
  email: string,
  password: string
): Promise<MobileAuthResult> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return { success: false, error: 'Email and password are required' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error || !data.session) {
      return { success: false, error: error?.message || 'Invalid credentials' };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email authentication failed';
    return { success: false, error: message };
  }
}

export async function handleAuthRedirectUrl(url: string): Promise<MobileAuthResult> {
  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash ? parsed.hash.replace(/^#/, '') : '');

    const oauthError =
      parsed.searchParams.get('error_description') ||
      parsed.searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (oauthError) {
      return { success: false, error: decodeURIComponent(oauthError) };
    }

    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    return { success: false, error: 'No authorization code or session tokens found in callback URL' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse OAuth callback URL';
    return { success: false, error: message };
  }
}

export async function signOutMobile(): Promise<void> {
  await supabase.auth.signOut();
}
