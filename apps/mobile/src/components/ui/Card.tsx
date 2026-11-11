import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { TOKENS } from '../../lib/theme/tokens';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'surface' | 'dark' | 'outline';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'surface',
  ...rest
}) => {
  return (
    <View
      style={[
        styles.base,
        variant === 'surface' && styles.surface,
        variant === 'dark' && styles.dark,
        variant === 'outline' && styles.outline,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: TOKENS.radii.container,
    padding: 20,
    marginBottom: 16,
  },
  surface: {
    backgroundColor: TOKENS.colors.softMint,
  },
  dark: {
    backgroundColor: '#0B1616',
    borderWidth: 1,
    borderColor: TOKENS.colors.slateBase,
  },
  outline: {
    backgroundColor: TOKENS.colors.transparent,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
  },
});
