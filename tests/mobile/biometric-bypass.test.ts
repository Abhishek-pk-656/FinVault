/**
 * Adversarial Security Suite: Mobile Biometric Bypass Guard
 *
 * Ensures that even if EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC='true' is leaked or injected,
 * biometric bypass is impossible whenever __DEV__ is false (production/preview APKs).
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { canBypassBiometricAuth } from '../../apps/mobile/src/lib/auth/biometric-bypass.ts';

describe('Mobile Biometric Bypass Security Guard', () => {
  test('ADV-BIO-01: bypass is strictly impossible when __DEV__ is false even if env var is true', () => {
    const originalEnv = process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC;
    const g = globalThis as unknown as { __DEV__?: boolean };
    const originalDev = g.__DEV__;

    try {
      process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC = 'true';
      g.__DEV__ = false;

      assert.equal(
        canBypassBiometricAuth(false, 'true'),
        false,
        'Explicit isDev=false must never allow biometric bypass'
      );
      assert.equal(
        canBypassBiometricAuth(undefined, undefined),
        false,
        'Default arguments with global __DEV__=false must never allow biometric bypass'
      );
    } finally {
      if (originalEnv === undefined) {
        delete process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC;
      } else {
        process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC = originalEnv;
      }
      if (originalDev === undefined) {
        delete g.__DEV__;
      } else {
        g.__DEV__ = originalDev;
      }
    }
  });

  test('ADV-BIO-02: bypass requires BOTH __DEV__=true AND exact string "true"', () => {
    assert.equal(canBypassBiometricAuth(true, undefined), false);
    assert.equal(canBypassBiometricAuth(true, 'false'), false);
    assert.equal(canBypassBiometricAuth(true, '1'), false);
    assert.equal(canBypassBiometricAuth(true, 'TRUE'), false);
    assert.equal(canBypassBiometricAuth(true, 'true'), true);
  });

  test('ADV-BIO-03: biometrics.ts enforces __DEV__ guard and eas.json preview/production never set bypass flag', () => {
    const biometricsPath = path.resolve(process.cwd(), 'apps/mobile/src/lib/auth/biometrics.ts');
    const biometricsAltPath = path.resolve(process.cwd(), '../../apps/mobile/src/lib/auth/biometrics.ts');
    const resolvedBioPath = fs.existsSync(biometricsPath) ? biometricsPath : biometricsAltPath;
    const bioSource = fs.readFileSync(resolvedBioPath, 'utf8');

    assert.match(bioSource, /__DEV__/);
    assert.match(bioSource, /EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC/);

    const easPath = path.resolve(process.cwd(), 'apps/mobile/eas.json');
    const easAltPath = path.resolve(process.cwd(), '../../apps/mobile/eas.json');
    const resolvedEasPath = fs.existsSync(easPath) ? easPath : easAltPath;
    const easConfig = JSON.parse(fs.readFileSync(resolvedEasPath, 'utf8')) as {
      build?: {
        preview?: { env?: Record<string, string> };
        production?: { env?: Record<string, string> };
      };
    };

    assert.equal(easConfig.build?.preview?.env?.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC, undefined);
    assert.equal(easConfig.build?.production?.env?.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC, undefined);
  });
});
