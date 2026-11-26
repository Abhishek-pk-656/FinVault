import * as LocalAuthentication from 'expo-local-authentication';
import { canBypassBiometricAuth } from './biometric-bypass';

export async function authenticateWithBiometrics(): Promise<{ success: boolean; error?: string }> {
  // Strictly dev/emulator-only bypass; dead-code eliminated in release builds where __DEV__ is false
  if (__DEV__ && canBypassBiometricAuth(__DEV__, process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC)) {
    return { success: true };
  }

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

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Biometric authentication failed';
    return { success: false, error: message };
  }
}
