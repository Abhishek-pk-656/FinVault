import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../lib/theme/tokens';
import { formatMinorToDecimal } from '../../lib/money/format';

interface BalanceBadgeProps {
  differenceMinor: bigint;
  hasEntries?: boolean;
}

export const BalanceBadge: React.FC<BalanceBadgeProps> = ({
  differenceMinor,
  hasEntries = true,
}) => {
  const isBalanced = differenceMinor === 0n && hasEntries;

  return (
    <View style={[styles.badge, isBalanced ? styles.balanced : styles.imbalanced]}>
      <Text style={[styles.badgeText, isBalanced ? styles.balancedText : styles.imbalancedText]}>
        {isBalanced
          ? '✓ Balanced'
          : `Difference: ₹${formatMinorToDecimal(differenceMinor > 0n ? differenceMinor : -differenceMinor)}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: TOKENS.radii.pill,
    alignSelf: 'flex-start',
  },
  balanced: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  imbalanced: {
    backgroundColor: TOKENS.colors.alert,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  balancedText: {
    color: TOKENS.colors.obsidianCarbon,
  },
  imbalancedText: {
    color: TOKENS.colors.white,
  },
});
