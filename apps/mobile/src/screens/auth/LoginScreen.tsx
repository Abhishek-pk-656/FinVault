import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../providers/AuthProvider';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { TOKENS } from '../../lib/theme/tokens';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [isEmailLoading, setIsEmailLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBusy = isGoogleLoading || isEmailLoading;

  const handleGooglePress = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      if (!res.success && !res.cancelled) {
        setErrorMessage(res.error ?? 'Google sign-in failed');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailPress = async () => {
    setIsEmailLoading(true);
    setErrorMessage(null);
    try {
      const res = await signInWithEmail(email, password);
      if (!res.success) {
        setErrorMessage(res.error ?? 'Email sign-in failed');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Email sign-in failed');
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID="mobile-login-screen"
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visual Group 1: Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🛡️</Text>
          </View>
          <Text testID="login-brand-heading" style={styles.brandTitle}>FINVAULT</Text>
          <Text style={styles.brandSubtitle}>
            Privacy-Preserving Wealth & Double-Entry Ledger
          </Text>
        </View>

        {/* Visual Group 2: Authentication Card */}
        <Card variant="surface" style={styles.authCard}>
          <Text style={styles.cardHeading}>Authenticate Session</Text>
          <Text style={styles.cardSubheading}>
            Sign in to sync your encrypted ledger with Supabase Cloud.
          </Text>

          {errorMessage && (
            <View testID="login-error-box" style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <Button
            testID="mobile-google-login-btn"
            title={isGoogleLoading ? 'Opening Google...' : 'Continue with Google'}
            variant="primary"
            disabled={isBusy}
            onPress={handleGooglePress}
            style={styles.googleBtn}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SIGN IN WITH EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
          <TextInput
            testID="mobile-email-input"
            style={styles.textInput}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@example.com"
            placeholderTextColor={TOKENS.colors.sageSlate}
            editable={!isBusy}
          />

          <Text style={styles.inputLabel}>PASSWORD</Text>
          <TextInput
            testID="mobile-password-input"
            style={styles.textInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter password"
            placeholderTextColor={TOKENS.colors.sageSlate}
            editable={!isBusy}
          />

          <Button
            testID="mobile-email-login-btn"
            title={isEmailLoading ? 'Signing in...' : 'Sign In with Email'}
            variant="secondary"
            disabled={isBusy || !email.trim() || !password}
            onPress={handleEmailPress}
            style={styles.emailBtn}
          />
        </Card>

        {/* Visual Group 3: Security Footnote */}
        <View style={styles.footnoteContainer}>
          <Text style={styles.footnoteText}>
            Protected by Google OAuth PKCE, hardware SecureStore, and PostgreSQL RLS.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 36) : 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(122, 170, 74, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(122, 170, 74, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoEmoji: {
    fontSize: 26,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: TOKENS.colors.softMint,
    letterSpacing: 2,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.sageSlate,
    textAlign: 'center',
  },
  authCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    marginBottom: 16,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    marginBottom: 4,
  },
  cardSubheading: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.sageSlate,
    marginBottom: 18,
    lineHeight: 17,
  },
  errorBox: {
    backgroundColor: 'rgba(224, 106, 85, 0.15)',
    borderRadius: TOKENS.radii.control,
    borderWidth: 1,
    borderColor: TOKENS.colors.alert,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.alert,
    textAlign: 'center',
  },
  googleBtn: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: TOKENS.colors.mossCeladon,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: TOKENS.colors.obsidianCarbon,
    borderRadius: TOKENS.radii.control,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TOKENS.colors.softMint,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  emailBtn: {
    width: '100%',
    marginTop: 4,
  },
  footnoteContainer: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  footnoteText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.sageSlate,
    textAlign: 'center',
    lineHeight: 16,
  },
});
