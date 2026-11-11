import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native';
import { TOKENS } from '../../lib/theme/tokens';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'alert' | 'outline';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  disabled = false,
  style,
  ...rest
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'alert' && styles.alert,
        variant === 'outline' && styles.outline,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <Text
        style={[
          styles.textBase,
          variant === 'primary' && styles.primaryText,
          variant === 'secondary' && styles.secondaryText,
          variant === 'alert' && styles.alertText,
          variant === 'outline' && styles.outlineText,
          disabled && styles.disabledText,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: TOKENS.radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  secondary: {
    backgroundColor: TOKENS.colors.mossCeladon,
  },
  alert: {
    backgroundColor: TOKENS.colors.alert,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
  },
  disabled: {
    opacity: 0.5,
  },
  textBase: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryText: {
    color: TOKENS.colors.obsidianCarbon,
  },
  secondaryText: {
    color: TOKENS.colors.obsidianCarbon,
  },
  alertText: {
    color: TOKENS.colors.white,
  },
  outlineText: {
    color: TOKENS.colors.softMint,
  },
  disabledText: {
    color: TOKENS.colors.sageSlate,
  },
});
