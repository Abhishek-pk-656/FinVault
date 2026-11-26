/**
 * Strictly Dev-Only Biometric Bypass Guard
 *
 * Allows skipping OS biometric hardware prompts strictly in local dev / emulator E2E sessions.
 * Both `__DEV__ === true` AND `EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC === 'true'` are mandatory.
 * In any release build (`__DEV__ === false`), this unconditionally returns `false`.
 */
export function canBypassBiometricAuth(
  isDev: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  bypassEnv: string | undefined = process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC
): boolean {
  return isDev === true && bypassEnv === 'true';
}
