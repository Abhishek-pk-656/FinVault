# Handoff Report: Milestone 3 Iteration 2 Investigation & Fix Blueprints

**Agent:** Explorer 1 (`explorer_m3_iter2_1`)  
**Role:** Explorer, Investigator, Synthesizer  
**Target Milestone:** FinVault Milestone 3 Iteration 2 (Shared Packages, Auth, Sync Engine & Edge Functions)  
**Parent Agent:** `867b8adb-e639-414f-92fa-0326940898a2`  
**Date:** 2026-11-09  

---

## 1. Observation

Direct code inspections and tool executions revealed the following verbatim findings:

### 1.1 Web Middleware Undefined Identifier (`TS18004` & `ReferenceError`)
In `apps/web/src/middleware.ts` lines 28–38:
```typescript
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
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
```
- **Verbatim Error**:
  Executing `npx tsc --noEmit --project apps/web/tsconfig.json` directly produces:
  ```
  apps/web/src/middleware.ts(30,39): error TS18004: No value exists in scope for the shorthand property 'value'. Either declare one or provide an initializer.
  apps/web/src/middleware.ts(36,40): error TS18004: No value exists in scope for the shorthand property 'value'. Either declare one or provide an initializer.
  ```
- **Scope Analysis**: In `remove(name: string, options: CookieOptions)`, only `name` and `options` are parameters. No variable named `value` exists in the local or enclosing scope. When executed at runtime, evaluating `{ name, value, ...options }` throws `ReferenceError: value is not defined`.
- **Existing Precedent in Codebase**:
  - `apps/web/src/lib/supabase/server.ts` line 25:
    `cookieStore.set({ name, value: '', ...options });`
  - `apps/web/src/app/auth/callback/route.ts` line 25:
    `cookieStore.set({ name, value: '', ...options });`
  Both sibling files explicitly pass `value: ''` (empty string) to clear the cookie.

---

### 1.2 Mobile TypeScript Import Path Extensions (`TS5097`)
In `apps/mobile/src/lib/supabase/client.ts` line 3 and `apps/mobile/src/lib/auth/oauth.ts` line 2:
```typescript
// apps/mobile/src/lib/supabase/client.ts:3
import { ExpoSecureStoreAdapter } from './secure-store-adapter.ts';

// apps/mobile/src/lib/auth/oauth.ts:2
import { supabase } from '../supabase/client.ts';
```
- **Verbatim Error**:
  Executing `npx tsc --noEmit --project apps/mobile/tsconfig.json` yields:
  ```
  apps/mobile/src/lib/auth/oauth.ts(2,26): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.
  apps/mobile/src/lib/supabase/client.ts(3,40): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.
  ```
- **Configuration Check**: Neither `apps/mobile/tsconfig.json` nor the root `tsconfig.base.json` sets `"allowImportingTsExtensions": true`. Furthermore, React Native Metro bundler expects standard extensionless module specifiers (`./secure-store-adapter` and `../supabase/client`).

---

### 1.3 Mobile SecureStore iOS Keychain 2048-Byte Limit & Silent Session Drop
In `apps/mobile/src/lib/supabase/secure-store-adapter.ts` lines 12–20:
```typescript
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (err) {
      console.error('[SecureStore] Failed to set key:', key, err);
    }
  },
```
- **iOS Keychain Constraint**: Apple's Keychain Services API backing `expo-secure-store` enforces a hard payload limit of 2,048 bytes (2 KB) per generic password item.
- **Supabase Session Reality**: A serialized Supabase Auth session resulting from Google OAuth contains JWT tokens (`access_token`, `refresh_token`), user metadata (`name`, `avatar_url`, `email`, `sub`), identities array, and provider tokens, commonly measuring 2,500 to 4,500 bytes.
- **Current Failure Mode**:
  1. `SecureStore.setItemAsync(key, value)` throws an exception because `value.length > 2048`.
  2. The `catch` block logs to `console.error` and returns without throwing or persisting the token.
  3. Supabase Auth treats the resolved promise as a successful persistence.
  4. On application restart, `getItem(key)` returns `null`, causing the user to be unexpectedly logged out on every cold launch.
  5. If the session payload expands or shrinks between logins, no mechanism cleans up stale fragmented keys.

---

## 2. Logic Chain

1. **Syntactic & Compilation Soundness in Next.js Middleware**:
   - The `@supabase/ssr` middleware hook relies on setting cookies on both the incoming `request.cookies` (to make them visible to downstream Server Components in the same request) and outgoing `response.cookies` (to deliver them to the browser).
   - In `remove()`, an empty string `value: ''` invalidates the cookie in conjunction with expiration metadata. Supplying `{ name, value: '', ...options }` satisfies TypeScript's type contract, eliminates `TS18004`, and resolves the runtime `ReferenceError`.
2. **Bundler & Compiler Compliance in Mobile Subsystem**:
   - React Native and Metro resolver map extensionless paths to `.ts`, `.tsx`, or `.js` automatically.
   - Removing the explicit `.ts` extensions conforms to standard Node/Expo module resolution and resolves both `TS5097` errors without altering runtime behavior.
3. **Resilient Large-Payload Storage for iOS Keychain**:
   - To store OAuth session payloads up to tens of kilobytes safely without external unencrypted storage dependencies, a chunking scheme slicing payloads into 1,024-character pieces guarantees that no individual item approaches the 2,048-byte iOS Keychain limit.
   - Managing a metadata key (`${key}_chunks`) allows atomic assembly upon `getItem` and total cleanup upon `removeItem` or payload shrinkage.
   - Adding a size guard (100 KB max) and re-throwing in `setItem` on fatal errors ensures that abnormal conditions are surfaced immediately rather than silently discarded.

---

## 3. Caveats

1. **Local Test Environment Dependencies**:
   `npx tsc --noEmit --project apps/mobile/tsconfig.json` produces TS2307 for `react-native` and `expo-*` because native platform headers and full devDependencies are not installed in the root workspace `node_modules`. However, `TS5097` was isolated and verified to disappear when extensionless imports are used.
2. **Simulated Keychain Test Suite**:
   Because testing native iOS Keychain limits requires a physical device or macOS Xcode simulator, the chunking and reassembly logic was independently verified using an automated Node.js test harness (`.agents/teamwork/explorer_m3_iter2_1/test-secure-store.cjs`) simulating the 2,048-byte Keychain constraint.

---

## 4. Conclusion & Actionable Fix Blueprints

The following four blueprints provide exact, line-by-line replacements for the worker agent to apply:

### Blueprint 1: `apps/web/src/middleware.ts`
**Target File**: `apps/web/src/middleware.ts`  
**Lines**: 28–38  
**Diff / Replacement**:
```typescript
<<<<
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
====
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
>>>>
```

---

### Blueprint 2: `apps/mobile/src/lib/supabase/client.ts`
**Target File**: `apps/mobile/src/lib/supabase/client.ts`  
**Line**: 3  
**Diff / Replacement**:
```typescript
<<<<
import { ExpoSecureStoreAdapter } from './secure-store-adapter.ts';
====
import { ExpoSecureStoreAdapter } from './secure-store-adapter';
>>>>
```

---

### Blueprint 3: `apps/mobile/src/lib/auth/oauth.ts`
**Target File**: `apps/mobile/src/lib/auth/oauth.ts`  
**Line**: 2  
**Diff / Replacement**:
```typescript
<<<<
import { supabase } from '../supabase/client.ts';
====
import { supabase } from '../supabase/client';
>>>>
```

---

### Blueprint 4: `apps/mobile/src/lib/supabase/secure-store-adapter.ts`
**Target File**: `apps/mobile/src/lib/supabase/secure-store-adapter.ts`  
**Full Replacement**:
```typescript
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1024; // 1KB chunks guaranteed well within iOS Keychain 2048-byte limit
const MAX_ALLOWED_SIZE = 100 * 1024; // 100KB guard against abnormal runaway payloads

export const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const chunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          let assembled = '';
          for (let i = 0; i < count; i++) {
            const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
            if (chunk === null) {
              console.warn(`[SecureStore] Incomplete chunks for key: ${key}, missing chunk ${i}`);
              return null;
            }
            assembled += chunk;
          }
          return assembled;
        }
      }
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to retrieve key:', key, err);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (value.length > MAX_ALLOWED_SIZE) {
        throw new Error(`[SecureStore] Value exceeds maximum allowed session size of ${MAX_ALLOWED_SIZE} bytes`);
      }

      const prevChunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      const prevCount = prevChunksStr ? parseInt(prevChunksStr, 10) : 0;
      const chunks = Math.ceil(value.length / CHUNK_SIZE);

      if (chunks <= 1) {
        // Single chunk / small value: store unchunked directly
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up any old chunks if previously chunked
        for (let i = 0; i < prevCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        if (prevCount > 0) {
          await SecureStore.deleteItemAsync(`${key}_chunks`);
        }
      } else {
        // Multi-chunk value: write all chunks
        for (let i = 0; i < chunks; i++) {
          const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
          });
        }
        await SecureStore.setItemAsync(`${key}_chunks`, chunks.toString(), {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });

        // Clean up excess previous chunks if prevCount > chunks
        for (let i = chunks; i < prevCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        // Remove direct key to avoid ambiguous state
        await SecureStore.deleteItemAsync(key);
      }
    } catch (err) {
      console.error('[SecureStore] Failed to set key:', key, err);
      throw err;
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      const chunksStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksStr) {
        const count = parseInt(chunksStr, 10);
        if (!isNaN(count) && count > 0) {
          for (let i = 0; i < count; i++) {
            await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
          }
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[SecureStore] Failed to remove key:', key, err);
    }
  },
};
```

---

## 5. Verification Method

Once implemented, the reviewer and challenger agents can independently verify using:

1. **Verify No `value` Shorthand in Middleware**:
   ```powershell
   node -e "const content = require('fs').readFileSync('apps/web/src/middleware.ts', 'utf8'); if (content.includes('{ name, value, ...options }')) { console.error('FAIL: shorthand value persists'); process.exit(1); } else { console.log('PASS: middleware cookie remove uses initialized value'); }"
   ```

2. **Verify No Explicit `.ts` Imports in Mobile App**:
   ```powershell
   node .agents/teamwork/explorer_m3_iter2_1/search-imports.cjs
   ```
   *Expected output*: No matches for `apps/mobile/src/lib/auth/oauth.ts` or `apps/mobile/src/lib/supabase/client.ts`.

3. **Verify Chunked SecureStore Logic Across 5 Scenarios**:
   ```powershell
   node .agents/teamwork/explorer_m3_iter2_1/test-secure-store.cjs
   ```
   *Expected output*: 5/5 tests pass (small payload, >2KB payload, shrinking payload, deletion cleanup, size guard rejection).

4. **Verify Solution Test Suites**:
   ```powershell
   node .agents/teamwork/explorer_m1_3/verify-m1.js
   node --test packages/sync-engine/tests/sync-engine.test.ts
   node --experimental-strip-types tests/stress/m2-adversarial-stress.ts
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   *Expected output*: All 86 M1 checks, 22 sync engine tests, 34 stress tests, and 63 E2E invariant tests pass with 0 failures.

### Invalidation Conditions
- Any occurrence of `{ name, value, ...options }` in `apps/web/src/middleware.ts`.
- Any occurrence of `.ts'` or `.ts"` import paths in `apps/mobile/src/`.
- Failure of `setItem` or silent loss of session data when storing values exceeding 2,048 bytes in `ExpoSecureStoreAdapter`.
