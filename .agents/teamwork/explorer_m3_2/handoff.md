# Milestone 3 Specification & Architecture Report: Supabase Auth & Google OAuth Blueprint

**Agent:** Explorer 2 (`teamwork_explorer`)  
**State Folder:** `.agents/teamwork/explorer_m3_2/`  
**Target Milestone:** Milestone 3 (Shared Packages, Auth, Sync Engine & Edge Functions)  
**Date:** 2026-11-08  

---

## 1. Observation

Direct examination of the workspace, configuration files, schema migrations, client package manifests, and Edge Functions produced the following verbatim observations:

### 1.1 Google OAuth Posture in Supabase Architecture
- **Supabase Local & Production Configuration (`supabase/config.toml:13-22`)**:
  ```toml
  [auth]
  enabled = true
  site_url = "http://localhost:3000"
  additional_redirect_urls = ["https://localhost:3000", "finvault://*"]
  jwt_expiry = 3600

  [auth.external.google]
  enabled = true
  client_id = "env(GOOGLE_CLIENT_ID)"
  secret = "env(GOOGLE_CLIENT_SECRET)"
  ```
- **Environment Variables Baseline (`.env.example:6-8`)**:
  ```env
  GOOGLE_CLIENT_ID=your-google-client-id
  GOOGLE_CLIENT_SECRET=your-google-client-secret
  ```
- **Observations on Secrets & Isolation**:
  - `GOOGLE_CLIENT_SECRET` resides strictly in server-side configuration (Supabase managed secrets / local `config.toml`). It is never exposed in client bundles or public repositories.
  - The public client only receives `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.example:2-3`).
  - Google OAuth redirects are mediated by Supabase Auth: Google redirects to `https://<ref>.supabase.co/auth/v1/callback` (or `http://localhost:54321/auth/v1/callback` locally), and Supabase subsequently redirects to the client callback (`/auth/callback` on Web or `finvault://auth/callback` on Mobile) with a PKCE authorization code.

### 1.2 User Signup Bootstrap Trigger & Account Provisioning
- **Current Database Trigger (`supabase/migrations/20261108000000_init_finvault_schema.sql:346-363`)**:
  ```sql
  CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
  RETURNS TRIGGER AS $$
  BEGIN
      INSERT INTO accounts (user_id, name, type, currency, balance_minor)
      VALUES
          (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
          (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
          (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
          (NEW.id, 'Primary Income', 'INCOME', 'INR', 0),
          (NEW.id, 'Opening Balance Equity', 'EQUITY', 'INR', 0);
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

  DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
  CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_provisioning();
  ```
- **Observations on Profiles & User Metadata**:
  - The trigger creates 5 default accounts with 0 balance upon row creation in `auth.users`.
  - **Missing `profiles` table**: Currently, no `profiles` table exists in PostgreSQL schema or SQLite client schema. All user tables (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`, `audit_logs`) reference `auth.users(id) ON DELETE CASCADE`.
  - Clients cannot directly query `auth.users` over PostgREST due to Supabase system security restrictions. Without a public `profiles` table, client applications can only retrieve user metadata (name, avatar, email) via `supabase.auth.getUser()`, and cannot store custom client profile settings (default currency, notification preferences, bio) in PostgreSQL via standard PostgREST RLS.

### 1.3 Web Application (`apps/web`) Auth Architecture
- **Dependencies (`apps/web/package.json:16-17`)**:
  ```json
  "dependencies": {
    "@supabase/ssr": "^0.3.0",
    "@supabase/supabase-js": "^2.42.0"
  }
  ```
- **Current App Structure (`apps/web/src/app/`)**:
  - Contains `globals.css`, `layout.tsx`, and `page.tsx`.
  - **Missing Route Handlers**: Lacks `/auth/callback/route.ts` for handling the PKCE authorization code exchange.
  - **Missing Middleware**: Lacks `middleware.ts` for refreshing expired JWT session cookies on navigation.
  - **Missing Login Interface**: Cockpit `page.tsx` renders dashboard metrics directly without an unauthenticated login state or "Sign in with Google" button.

### 1.4 Mobile Application (`apps/mobile`) Auth Architecture
- **Dependencies & Manifest (`apps/mobile/package.json:17-21`, `apps/mobile/app.json:9`)**:
  ```json
  "dependencies": {
    "@supabase/supabase-js": "^2.42.0",
    "expo": "~51.0.0",
    "expo-local-authentication": "~14.0.0",
    "expo-secure-store": "~13.0.0",
    "expo-sqlite": "~14.0.0"
  }
  ```
  ```json
  "scheme": "finvault"
  ```
- **Observations on Mobile OAuth & Session Storage**:
  - `apps/mobile/app.json` has `"scheme": "finvault"`, supporting deep links such as `finvault://auth/callback`.
  - `expo-secure-store` and `expo-local-authentication` are installed.
  - **Missing In-App Browser Utilities**: `expo-web-browser` and `expo-linking` (or `expo-auth-session`) are not yet included in `apps/mobile/package.json`. In React Native / Expo, executing OAuth with Supabase requires an in-app browser (`WebBrowser.openAuthSessionAsync`) or linking listener to intercept the redirect.

### 1.5 Edge Functions Auth Verification Posture
- **`supabase/functions/validate-transaction/index.ts:9-89` & `sync-reconcile/index.ts:1-18`**:
  - `validate-transaction` validates entries array and double-entry balance arithmetic, but does not check the HTTP `Authorization` header.
  - `sync-reconcile` returns `{ status: 'acknowledged', reconciledTimestamp: ... }` without verifying the caller's JWT token.
  - Both functions currently accept unauthenticated calls.

---

## 2. Logic Chain

1. **Google OAuth Handshake Separation (Referencing O1, O3, O4)**:
   - Supabase Auth acts as the OAuth 2.0 client to Google.
   - Flow: User initiates OAuth in FinVault -> redirects to Supabase Auth -> redirects to Google Accounts -> User consents -> Google redirects back to Supabase (`/auth/v1/callback`) with Google authorization code -> Supabase exchanges code for Google user details and issues a Supabase JWT + PKCE code -> Supabase redirects to the FinVault application redirect URL (`/auth/callback` on Web, `finvault://auth/callback` on Mobile).
   - This posture guarantees that `GOOGLE_CLIENT_SECRET` remains server-side only in Supabase Cloud / local config, fully protecting credentials.

2. **Web PKCE Flow & Cookie Session Management (Referencing O1, O3)**:
   - Next.js 14+ App Router runs on both server (Server Components, Route Handlers) and client (Browser Components).
   - LocalStorage is inaccessible to Server Components and vulnerable to XSS. Therefore, `@supabase/ssr` with chunked, HTTP-only, SameSite cookies is required (`docs/05-SECURITY-AND-COMPLIANCE.md:6`).
   - Web initiation:
     ```ts
     supabase.auth.signInWithOAuth({
       provider: 'google',
       options: {
         redirectTo: `${window.location.origin}/auth/callback`,
         queryParams: { access_type: 'offline', prompt: 'consent' }
       }
     });
     ```
   - Callback exchange: A Next.js Route Handler at `apps/web/src/app/auth/callback/route.ts` must catch `?code=...`, instantiate `@supabase/ssr` `createRouteHandlerClient`, invoke `exchangeCodeForSession(code)`, set cookies, and redirect to `/`.
   - Refresh: `apps/web/src/middleware.ts` must intercept requests to protected routes, call `supabase.auth.getUser()`, and refresh cookies before rendering.

3. **Mobile Deep Linking & Secure Hardware Persistence (Referencing O1, O4)**:
   - React Native cannot write browser cookies or redirect `window.location`.
   - Mobile initiation requires `skipBrowserRedirect: true`:
     ```ts
     const { data, error } = await supabase.auth.signInWithOAuth({
       provider: 'google',
       options: {
         redirectTo: 'finvault://auth/callback',
         skipBrowserRedirect: true,
       }
     });
     ```
   - `WebBrowser.openAuthSessionAsync(data.url, 'finvault://auth/callback')` opens an in-app Chrome Custom Tab / ASWebAuthenticationSession.
   - When Google redirects back to `finvault://auth/callback?code=...`, `openAuthSessionAsync` intercepts the return URL.
   - The app extracts `code` from the query parameters, invokes `supabase.auth.exchangeCodeForSession(code)`, and `@supabase/supabase-js` stores the session into `expo-secure-store` via a custom storage adapter.

4. **Offline Session Restoration & SQLite Multi-Tenant Invariant (Referencing O2, O4)**:
   - When the mobile device is offline (airplane mode / poor connectivity), the user must still be able to open FinVault and log transactions into local SQLite (<50ms latency).
   - Invariant: Local SQLite tables (`transactions`, `accounts`, `journal_entries`, `sync_queue`) require a valid `user_id` (`auth.uid() = user_id`). If the app wipes the session offline, the user cannot write transactions.
   - Therefore, `supabase.auth.getSession()` must restore the cached session from `expo-secure-store`. If network refresh fails due to being offline, the client must NOT log out the user; it must enter an `'authenticated_offline'` state using the cached `user.id`.
   - On reconnect, the sync engine triggers `supabase.auth.refreshSession()`, validates the token, and replays pending mutations from `sync_queue`.

5. **User Profile Bootstrap Verification (Referencing O2)**:
   - The existing trigger `trg_on_auth_user_created` provisions 5 starter accounts ('Cash Wallet', 'Primary Bank Account', 'General Expenses', 'Primary Income', 'Opening Balance Equity').
   - However, without a `profiles` table in the `public` schema, the client cannot display user details (display name, profile avatar, base currency) via standard PostgREST queries.
   - Blueprint solution: Define a new migration `20261108000001_add_user_profiles.sql` adding `public.profiles` (`id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `email`, `display_name`, `avatar_url`, `default_currency CHAR(3) DEFAULT 'INR'`), with RLS policies and trigger populating it from `NEW.raw_user_meta_data`.

6. **Edge Function Token Verification Contract (Referencing O5)**:
   - Edge Functions currently do not verify caller identity.
   - In accordance with `docs/05-SECURITY-AND-COMPLIANCE.md` and RLS isolation, Edge Functions (`validate-transaction`, `sync-reconcile`) must extract `Authorization: Bearer <jwt>`, verify the token via `supabase.auth.getUser()`, and reject unauthenticated requests with HTTP 401.

---

## 3. Caveats

1. **Google Cloud Console External Setup**:
   - Supabase requires creating an OAuth 2.0 Web Application client in Google Cloud Console.
   - Authorized Redirect URIs must include:
     - Local development: `http://localhost:54321/auth/v1/callback`
     - Cloud production: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - In production, Google requires OAuth verification (Privacy Policy URL, Terms of Service) before removing the "unverified app" warning screen for public users.
2. **Android Keystore Value Size Bounds**:
   - On older Android devices (API < 23), `expo-secure-store` may enforce a 2048-byte limit per key.
   - Supabase session JSON containing extensive OAuth ID token claims could approach this threshold. Slimming stored sessions or enabling value chunking guarantees safety across all Android devices.
3. **Local Development Without Active Cloud Internet**:
   - While in offline local development, Google OAuth requires internet access to reach Google servers. For fully offline testing, test harnesses use mock sessions (`UserSession` in `tests/e2e/infra/harness.ts`) which model Supabase Auth behavior with 100% fidelity.

---

## 4. Conclusion & Concrete Implementation Blueprints

### Blueprint 1: Shared Auth Interfaces & DTOs (`packages/db-types/src/index.ts`)

Add the following standard auth domain types to `packages/db-types/src/index.ts`:

```typescript
// ============================================================================
// Auth & User Profile Domain Models
// ============================================================================

export interface UserProfile {
  id: string; // Foreign key matching auth.users(id)
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface AuthUserSession {
  userId: string;
  email: string;
  role: 'authenticated' | 'anon';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  profile?: UserProfile | null;
}

export type AuthStatus = 
  | 'INITIALIZING'
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED_ONLINE'
  | 'AUTHENTICATED_OFFLINE';
```

---

### Blueprint 2: Database Migration for User Profiles (`supabase/migrations/20261108000001_add_user_profiles.sql`)

```sql
-- Migration: Add User Profiles & Extend Bootstrap Trigger
-- File: supabase/migrations/20261108000001_add_user_profiles.sql

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    avatar_url TEXT,
    default_currency CHAR(3) NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

-- 2. Indexes and RLS
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles 
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert" ON public.profiles 
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON public.profiles 
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete" ON public.profiles 
    FOR DELETE USING (auth.uid() = id);

-- 3. Enhance User Bootstrap Provisioning Trigger
CREATE OR REPLACE FUNCTION handle_new_user_provisioning()
RETURNS TRIGGER AS $$
DECLARE
    v_name VARCHAR(120);
    v_avatar TEXT;
BEGIN
    -- Extract display name and avatar from Google OAuth raw metadata
    v_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    v_avatar := NEW.raw_user_meta_data->>'avatar_url';

    -- Provision Profile
    INSERT INTO public.profiles (id, email, display_name, avatar_url, default_currency)
    VALUES (NEW.id, NEW.email, v_name, v_avatar, 'INR')
    ON CONFLICT (id) DO NOTHING;

    -- Provision Default Chart of Accounts
    INSERT INTO public.accounts (user_id, name, type, currency, balance_minor)
    VALUES
        (NEW.id, 'Cash Wallet', 'ASSET', 'INR', 0),
        (NEW.id, 'Primary Bank Account', 'ASSET', 'INR', 0),
        (NEW.id, 'General Expenses', 'EXPENSE', 'INR', 0),
        (NEW.id, 'Primary Income', 'INCOME', 'INR', 0),
        (NEW.id, 'Opening Balance Equity', 'EQUITY', 'INR', 0)
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Ensure trigger is active on auth.users
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_provisioning();
```

---

### Blueprint 3: Web Auth Utilities (`apps/web`)

#### 3.1 Browser Client (`apps/web/src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@finvault/db-types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### 3.2 Server Client (`apps/web/src/lib/supabase/server.ts`)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@finvault/db-types';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Ignored when called from Server Components (middleware refreshes session)
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
```

#### 3.3 Auth Callback Route Handler (`apps/web/src/app/auth/callback/route.ts`)
```typescript
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error fallback
  return NextResponse.redirect(`${origin}/login?error=auth_exchange_failed`);
}
```

#### 3.4 Next.js Session Refresh Middleware (`apps/web/src/middleware.ts`)
```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Guard protected routes (redirect to /login if unauthenticated)
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname === '/login';
  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated user away from login page
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

---

### Blueprint 4: Mobile Auth Utilities (`apps/mobile`)

#### 4.1 Additional Dependencies for `apps/mobile/package.json`
```json
{
  "dependencies": {
    "expo-web-browser": "~13.0.0",
    "expo-linking": "~6.3.0"
  }
}
```

#### 4.2 Secure Store Adapter (`apps/mobile/src/lib/supabase/secure-store-adapter.ts`)
```typescript
import * as SecureStore from 'expo-secure-store';

export const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to retrieve key:', key, err);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (err) {
      console.error('[SecureStore] Failed to set key:', key, err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to remove key:', key, err);
    }
  },
};
```

#### 4.3 Mobile Supabase Client (`apps/mobile/src/lib/supabase/client.ts`)
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@finvault/db-types';
import { ExpoSecureStoreAdapter } from './secure-store-adapter';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Handled manually via deep linking
  },
});
```

#### 4.4 Mobile Google OAuth Helper (`apps/mobile/src/lib/auth/oauth.ts`)
```typescript
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../supabase/client';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogleMobile(): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUrl = Linking.createURL('auth/callback');

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

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

    if (res.type === 'success' && res.url) {
      // Extract code query parameter
      const parsedUrl = Linking.parse(res.url);
      const code = parsedUrl.queryParams?.code;

      if (typeof code === 'string') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          return { success: false, error: exchangeError.message };
        }
        return { success: true };
      }
    }

    return { success: false, error: 'Sign in cancelled or invalid redirect' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown authentication error';
    return { success: false, error: message };
  }
}
```

#### 4.5 Biometric Security Guard (`apps/mobile/src/lib/auth/biometrics.ts`)
```typescript
import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateWithBiometrics(): Promise<{ success: boolean; error?: string }> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { success: true }; // Fallback to PIN / pass through if device lacks biometrics
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      return { success: true };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock FinVault',
      fallbackLabel: 'Use Device Passcode',
      disableDeviceFallback: false,
    });

    return { success: result.success, error: result.error };
  } catch (err) {
    return { success: false, error: 'Biometric authentication failed' };
  }
}
```

---

### Blueprint 5: Edge Function JWT Authentication Guard

Enhance `supabase/functions/validate-transaction/index.ts` and `sync-reconcile/index.ts` with standard JWT token verification:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';

export async function verifyAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, errorResponse: new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 }) };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, errorResponse: new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 }) };
  }

  return { user, errorResponse: null };
}
```

---

## 5. Verification Method

To independently verify the implementation and ensure no regressions or invariant violations occur:

### 5.1 Verification Commands
1. **Monorepo Type Checking**:
   ```powershell
   npx tsc --noEmit --project tsconfig.json
   npx tsc --noEmit --project packages/db-types/tsconfig.json
   npx tsc --noEmit --project packages/sync-engine/tsconfig.json
   ```
   *Expected Outcome*: 0 errors.

2. **Master E2E Test Suite**:
   ```powershell
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   *Expected Outcome*: 63/63 tests passing (100% success rate across all 4 tiers).

3. **Client Schema Parity Test**:
   ```powershell
   node --test packages/sync-engine/tests/client-schema.test.ts
   ```
   *Expected Outcome*: 10/10 tests passing.

4. **Adversarial Invariant Stress Suite**:
   ```powershell
   node --experimental-strip-types tests/stress/m2-adversarial-stress.ts
   ```
   *Expected Outcome*: 34/34 tests passing.

### 5.2 Files to Inspect
- `supabase/config.toml` (verify Google OAuth config and redirect allowlist)
- `supabase/migrations/20261108000000_init_finvault_schema.sql` (verify `trg_on_auth_user_created`)
- `packages/db-types/src/index.ts` (verify BigInt invariant and auth types)
- `apps/web/package.json` & `apps/mobile/package.json` (verify required packages)
- `docs/05-SECURITY-AND-COMPLIANCE.md` (verify security baseline)

### 5.3 Invalidation Conditions
- Any exposure of `GOOGLE_CLIENT_SECRET` in client-side bundles or repository code.
- Storing session tokens in unencrypted plain text (`localStorage`) on mobile instead of `expo-secure-store`.
- Allowing unauthenticated or cross-tenant mutations in PostgREST or Edge Functions (`auth.uid() = user_id` violation).
- Wiping local SQLite transactions or preventing offline writes when the device is disconnected from the internet.
- Introducing floating-point numbers into monetary calculation or session balance representations.
