import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { authenticateWithBiometrics } from '../../lib/auth/biometrics';
import { useAuth } from '../../providers/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TOKENS } from '../../lib/theme/tokens';

interface BiometricLockScreenProps {
  onUnlockSuccess: () => void;
}

export const BiometricLockScreen: React.FC<BiometricLockScreenProps> = ({
  onUnlockSuccess,
}) => {
  const { userEmail, signOut } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  const handleUnlock = async () => {
    setIsAuthenticating(true);
    setErrorMessage(null);
    try {
      const result = await authenticateWithBiometrics();
      if (result.success) {
        onUnlockSuccess();
      } else {
        setErrorMessage(result.error ?? 'Authentication failed');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <View testID="biometric-lock-screen" style={styles.container}>
      <Card variant="surface" style={styles.lockCard}>
        <Text style={styles.shieldIcon}>🛡️</Text>
        <Text testID="biometric-lock-heading" style={styles.title}>FINVAULT</Text>
        <Text style={styles.subtitle}>
          Botanical Minimalist Personal Finance & Wealth Ledger
        </Text>

        {userEmail && (
          <View style={styles.emailPill}>
            <Text testID="biometric-user-email" style={styles.emailText} numberOfLines={1}>
              {userEmail}
            </Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Button
          testID="biometric-unlock-btn"
          title={isAuthenticating ? 'Verifying...' : 'Unlock FinVault'}
          variant="primary"
          disabled={isAuthenticating}
          onPress={handleUnlock}
          style={styles.unlockBtn}
        />

        <TouchableOpacity
          testID="biometric-signout-btn"
          onPress={() => void signOut()}
          style={styles.signOutLink}
          disabled={isAuthenticating}
        >
          <Text style={styles.signOutText}>Switch Account / Sign Out</Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  shieldIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: TOKENS.colors.obsidianCarbon,
    letterSpacing: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.slateBase,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emailPill: {
    backgroundColor: TOKENS.colors.mossCeladon,
    borderRadius: TOKENS.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
    maxWidth: '100%',
  },
  emailText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.obsidianCarbon,
  },
  errorBox: {
    backgroundColor: 'rgba(224, 106, 85, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: TOKENS.radii.control,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TOKENS.colors.alert,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.alert,
    textAlign: 'center',
  },
  unlockBtn: {
    width: '100%',
  },
  signOutLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
    textDecorationLine: 'underline',
  },
});
