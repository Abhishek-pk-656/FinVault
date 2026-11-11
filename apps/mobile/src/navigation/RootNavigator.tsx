import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { authenticateWithBiometrics } from '../lib/auth/biometrics';
import { BiometricLockScreen } from '../screens/auth/BiometricLockScreen';
import { TabNavigator } from './TabNavigator';
import { TOKENS } from '../lib/theme/tokens';

export const RootNavigator: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await authenticateWithBiometrics();
      if (mounted && res.success) {
        setIsUnlocked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: TOKENS.motion.durationMs,
      useNativeDriver: true,
    }).start();
  }, [isUnlocked]);

  const handleUnlockSuccess = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 75,
      useNativeDriver: true,
    }).start(() => {
      setIsUnlocked(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 75,
        useNativeDriver: true,
      }).start();
    });
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        {!isUnlocked ? (
          <BiometricLockScreen onUnlockSuccess={handleUnlockSuccess} />
        ) : (
          <TabNavigator />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
  },
  inner: {
    flex: 1,
  },
});
