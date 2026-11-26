import { canBypassBiometricAuth } from './biometric-bypass.ts';

export type AuthGateScreen = 'LOADING' | 'LOGIN' | 'BIOMETRIC_LOCK' | 'UNLOCKED';

export interface AuthGateInput {
  isInitializing: boolean;
  hasSession: boolean;
  isBiometricUnlocked: boolean;
  isDev?: boolean;
  bypassEnv?: string;
}

/**
 * Resolves the active navigation screen at launch without allowing unauthenticated
 * access in preview/production builds (`__DEV__ === false`).
 */
export function resolveAuthGateScreen(input: AuthGateInput): AuthGateScreen {
  if (input.isInitializing) {
    return 'LOADING';
  }

  // Strictly dev/emulator E2E only; unconditionally false whenever isDev !== true
  if (canBypassBiometricAuth(input.isDev, input.bypassEnv)) {
    return 'UNLOCKED';
  }

  if (!input.hasSession) {
    return 'LOGIN';
  }

  if (!input.isBiometricUnlocked) {
    return 'BIOMETRIC_LOCK';
  }

  return 'UNLOCKED';
}

export { canBypassBiometricAuth as canBypassAuthAndBiometrics };
