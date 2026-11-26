import fs from 'node:fs';
import path from 'node:path';
import { createBrowserClient, type CookieOptions } from '@supabase/ssr';
import { test as setup, expect } from './fixtures';
import { AUTH_FILE } from '../playwright.config';

interface CollectedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

setup('authenticate E2E session or verify login gate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const email = process.env.E2E_TEST_EMAIL?.trim();
  const password = process.env.E2E_TEST_PASSWORD?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const hasCredentials = Boolean(
    email &&
      password &&
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project')
  );

  if (hasCredentials && email && password && supabaseUrl && supabaseAnonKey) {
    const cookieStore = new Map<string, CollectedCookie>();

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      isSingleton: false,
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, { name, value, options });
        },
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    expect(error, `Supabase E2E email/password sign-in failed: ${error?.message}`).toBeNull();
    expect(data.session, 'Supabase E2E sign-in did not return a session').toBeTruthy();

    await page.goto('/login');
    await page.context().addCookies(
      Array.from(cookieStore.values()).map((c) => ({
        name: c.name,
        value: c.value,
        domain: 'localhost',
        path: c.options.path || '/',
        httpOnly: Boolean(c.options.httpOnly),
        sameSite: 'Lax' as const,
      }))
    );

    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Fallback when E2E credentials are not configured: verify /login renders cleanly
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'FinVault' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
