import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../lib/theme/tokens';

interface StatPillProps {
  label: string;
  value: string;
  variant?: 'normal' | 'positive' | 'alert';
}

export const StatPill: React.FC<StatPillProps> = ({
  label,
  value,
  variant = 'normal',
}) => {
  return (
    <View
      style={[
        styles.container,
        variant === 'positive' && styles.positive,
        variant === 'alert' && styles.alert,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          variant === 'positive' && styles.positiveText,
          variant === 'alert' && styles.alertText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(4, 10, 10, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: TOKENS.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(56, 66, 76, 0.2)',
  },
  positive: {
    borderColor: TOKENS.colors.oliveLeaf,
  },
  alert: {
    borderColor: TOKENS.colors.alert,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
  },
  positiveText: {
    color: TOKENS.colors.oliveLeaf,
  },
  alertText: {
    color: TOKENS.colors.alert,
  },
});
