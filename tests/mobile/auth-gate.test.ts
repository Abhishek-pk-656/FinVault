/**
 * Adversarial & Unit Security Suite: Mobile Login Gate, Auth State & JWT Sync
 *
 * Proves:
 * (a) Unauthenticated state renders the Login gate whenever __DEV__ === false (even if bypass env is injected).
 * (b) Biometric/auth bypass cannot trigger when __DEV__ === false.
 * (c) executeDeltaSync attaches the active Supabase session JWT and OutboxQueueManager reports accurate pending counts.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveAuthGateScreen,
  canBypassAuthAndBiometrics,
} from '../../apps/mobile/src/lib/auth/auth-gate.ts';
import {
  initDatabase,
  NodeSQLiteAdapter,
  OutboxQueueManager,
  executeDeltaSync,
} from '../../packages/sync-engine/src/index.ts';

function resolveRepoPath(relPath: string): string {
  const direct = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(direct)) return direct;
  return path.resolve(process.cwd(), '..', '..', relPath);
}

describe('Mobile Auth Gate & Persistent Session Security', () => {
  test('ADV-AUTH-01: unauthenticated state renders LOGIN screen in production (__DEV__ === false) even if bypass is injected', () => {
    assert.equal(
      resolveAuthGateScreen({
        isInitializing: false,
        hasSession: false,
        isBiometricUnlocked: false,
        isDev: false,
        bypassEnv: undefined,
      }),
      'LOGIN'
    );

    assert.equal(
      resolveAuthGateScreen({
        isInitializing: false,
        hasSession: false,
        isBiometricUnlocked: true,
        isDev: false,
        bypassEnv: 'true',
      }),
      'LOGIN',
      'Even with bypassEnv="true" and isBiometricUnlocked=true, unauthenticated production launch MUST render LOGIN'
    );
  });

  test('ADV-AUTH-02: authenticated session enforces BIOMETRIC_LOCK before UNLOCKED when __DEV__ === false', () => {
    assert.equal(
      resolveAuthGateScreen({
        isInitializing: false,
        hasSession: true,
        isBiometricUnlocked: false,
        isDev: false,
        bypassEnv: 'true',
      }),
      'BIOMETRIC_LOCK'
    );

    assert.equal(
      resolveAuthGateScreen({
        isInitializing: false,
        hasSession: true,
        isBiometricUnlocked: true,
        isDev: false,
        bypassEnv: undefined,
      }),
      'UNLOCKED'
    );
  });

  test('ADV-AUTH-03: canBypassAuthAndBiometrics cannot trigger when __DEV__ is false', () => {
    assert.equal(canBypassAuthAndBiometrics(false, 'true'), false);
    assert.equal(canBypassAuthAndBiometrics(false, undefined), false);
    assert.equal(canBypassAuthAndBiometrics(true, undefined), false);
    assert.equal(canBypassAuthAndBiometrics(true, 'false'), false);
    assert.equal(canBypassAuthAndBiometrics(true, 'true'), true);
    assert.equal(
      resolveAuthGateScreen({
        isInitializing: false,
        hasSession: false,
        isBiometricUnlocked: false,
        isDev: true,
        bypassEnv: 'true',
      }),
      'UNLOCKED'
    );
  });

  test('ADV-AUTH-04: LoginScreen, RootNavigator & app.json satisfy FinVault scheme, Botanical tokens & AST rules', () => {
    const appJson = JSON.parse(fs.readFileSync(resolveRepoPath('apps/mobile/app.json'), 'utf8')) as {
      expo?: { scheme?: string };
    };
    assert.equal(appJson.expo?.scheme, 'finvault');

    const loginSrc = fs.readFileSync(
      resolveRepoPath('apps/mobile/src/screens/auth/LoginScreen.tsx'),
      'utf8'
    );
    assert.match(loginSrc, /testID="mobile-google-login-btn"/);
    assert.match(loginSrc, /Visual Group 1/);
    assert.match(loginSrc, /Visual Group 2/);
    assert.match(loginSrc, /Visual Group 3/);

    const rootNavSrc = fs.readFileSync(
      resolveRepoPath('apps/mobile/src/navigation/RootNavigator.tsx'),
      'utf8'
    );
    assert.match(rootNavSrc, /resolveAuthGateScreen/);
    assert.match(rootNavSrc, /<LoginScreen\s*\/>/);

    const oauthSrc = fs.readFileSync(
      resolveRepoPath('apps/mobile/src/lib/auth/oauth.ts'),
      'utf8'
    );
    assert.match(oauthSrc, /finvault:\/\/auth\/callback/);
    assert.match(oauthSrc, /openAuthSessionAsync/);
    assert.match(oauthSrc, /exchangeCodeForSession/);
  });

  test('ADV-AUTH-05: executeDeltaSync attaches Supabase session JWT and OutboxQueueManager tracks pending count', async () => {
    const adapter = new NodeSQLiteAdapter(':memory:');
    await initDatabase(':memory:', adapter);
    const outbox = new OutboxQueueManager(adapter);

    assert.equal(await outbox.getPendingCount(), 0);

    await outbox.enqueue({
      operation: 'INSERT',
      table_name: 'accounts',
      record_id: '00000000-0000-4000-8000-000000000001',
      payload: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        user_id: '00000000-0000-4000-8000-000000000099',
        name: 'Cash Wallet',
        type: 'ASSET',
      }),
    });
    assert.equal(await outbox.getPendingCount(), 1);

    let capturedFunctionsJwt: string | null = null;
    let capturedRealtimeJwt: string | null = null;

    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'jwt-session-token-xyz',
              user: { id: '00000000-0000-4000-8000-000000000099' },
            },
          },
        }),
      },
      functions: {
        setAuth: (jwt: string) => {
          capturedFunctionsJwt = jwt;
        },
      },
      realtime: {
        setAuth: (jwt: string) => {
          capturedRealtimeJwt = jwt;
        },
      },
      from: () => ({
        insert: async () => ({ error: null }),
        select: () => ({ data: [], error: null }),
      }),
    };

    const res = await executeDeltaSync(adapter, mockSupabase, {
      userId: '00000000-0000-4000-8000-000000000099',
    });

    assert.equal(res.success, true);
    assert.equal(res.pushed, 1);
    assert.equal(capturedFunctionsJwt, 'jwt-session-token-xyz');
    assert.equal(capturedRealtimeJwt, 'jwt-session-token-xyz');
    assert.equal(await outbox.getPendingCount(), 0);

    adapter.close();
  });
});
