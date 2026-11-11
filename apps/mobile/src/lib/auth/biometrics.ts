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

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Biometric authentication failed';
    return { success: false, error: message };
  }
}
