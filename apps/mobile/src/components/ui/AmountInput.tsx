import React, { useState, useEffect } from 'react';
import { TextInput, StyleSheet, View, Text } from 'react-native';
import { TOKENS } from '../../lib/theme/tokens';
import { formatMinorToDecimal, parseDecimalToMinor } from '../../lib/money/format';

interface AmountInputProps {
  valueMinor: bigint;
  onChangeMinor: (value: bigint) => void;
  currencySymbol?: string;
  placeholder?: string;
  editable?: boolean;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  valueMinor,
  onChangeMinor,
  currencySymbol = '₹',
  placeholder = '0.00',
  editable = true,
}) => {
  const [text, setText] = useState(() => (valueMinor === 0n ? '' : formatMinorToDecimal(valueMinor)));

  useEffect(() => {
    const formatted = valueMinor === 0n ? '' : formatMinorToDecimal(valueMinor);
    if (parseDecimalToMinor(text) !== valueMinor) {
      setText(formatted);
    }
  }, [valueMinor]);

  const handleChangeText = (newText: string) => {
    // Only permit digits and at most one decimal point with at most 2 decimal places
    if (/^\d*(\.\d{0,2})?$/.test(newText)) {
      setText(newText);
      const parsed = parseDecimalToMinor(newText);
      onChangeMinor(parsed);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.symbol}>{currencySymbol}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={handleChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={TOKENS.colors.sageSlate}
        editable={editable}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#040A0A',
    borderRadius: TOKENS.radii.control,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  symbol: {
    color: TOKENS.colors.softMint,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: TOKENS.colors.softMint,
    fontSize: 18,
    fontWeight: '700',
    padding: 0,
  },
});
