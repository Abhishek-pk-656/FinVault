import { Linking } from 'react-native';
import { supabase } from '../supabase/client';

export async function signInWithGoogleMobile(): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUrl = 'finvault://auth/callback';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error || !data.url) {
      return { success: false, error: error?.message || 'Failed to generate OAuth URL' };
    }

    const supported = await Linking.canOpenURL(data.url);
    if (supported) {
      await Linking.openURL(data.url);
      return { success: true };
    } else {
      return { success: false, error: 'Cannot open Google sign-in URL' };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown authentication error';
    return { success: false, error: message };
  }
}

export async function handleAuthRedirectUrl(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    return { success: false, error: 'No code found in redirect URL' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse redirect URL';
    return { success: false, error: message };
  }
}
