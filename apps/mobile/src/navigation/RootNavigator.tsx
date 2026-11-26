import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useFinVaultDatabase } from '../providers/DatabaseProvider';
import { useAuth } from '../providers/AuthProvider';
import { resolveAuthGateScreen } from '../lib/auth/auth-gate';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { BiometricLockScreen } from '../screens/auth/BiometricLockScreen';
import { TabNavigator } from './TabNavigator';
import { TOKENS } from '../lib/theme/tokens';

export const RootNavigator: React.FC = () => {
  const { isReady, isProvisioned, error } = useFinVaultDatabase();
  const { session, isAuthLoading, isBiometricUnlocked, unlockBiometrics } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Propagate SQLite database initialization error to ErrorBoundary
  if (error) {
    throw error;
  }

  const activeScreen = resolveAuthGateScreen({
    isInitializing: !isReady || isAuthLoading || (Boolean(session) && !isProvisioned),
    hasSession: Boolean(session),
    isBiometricUnlocked,
    isDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
    bypassEnv: process.env.EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC,
  });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: TOKENS.motion.durationMs,
      useNativeDriver: true,
    }).start();
  }, [activeScreen, fadeAnim]);

  const handleUnlockSuccess = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 75,
      useNativeDriver: true,
    }).start(() => {
      unlockBiometrics();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 75,
        useNativeDriver: true,
      }).start();
    });
  };

  if (activeScreen === 'LOADING') {
    return (
      <View testID="mobile-loading-screen" style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color={TOKENS.colors.softMint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        {activeScreen === 'LOGIN' && <LoginScreen />}
        {activeScreen === 'BIOMETRIC_LOCK' && (
          <BiometricLockScreen onUnlockSuccess={handleUnlockSuccess} />
        )}
        {activeScreen === 'UNLOCKED' && <TabNavigator />}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
  },
  loadingCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    flex: 1,
  },
});
