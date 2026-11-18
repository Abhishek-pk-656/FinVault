import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@finvault/db-types';

export function createClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key';

  return createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          try {
            return cookieStore.get(name)?.value;
          } catch {
            return undefined;
          }
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Ignored when called from Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Ignored when called from Server Components
          }
        },
      },
    }
  );
}

/**
 * Safely resolves whether the current request has an active authenticated session.
 * Returns true if authenticated with Supabase or in demo mode, false otherwise without throwing.
 */
export async function isAuthenticatedSession(): Promise<boolean> {
  try {
    const cookieStore = cookies();
    if (cookieStore.get('finvault-demo')?.value === 'true') {
      return true;
    }
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return Boolean(user && !error);
  } catch {
    return false;
  }
}
