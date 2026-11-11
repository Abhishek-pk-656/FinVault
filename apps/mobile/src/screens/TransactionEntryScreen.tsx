import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAccounts } from '../hooks/useAccounts';
import { useTransactions } from '../hooks/useTransactions';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BalanceBadge } from '../components/ui/BalanceBadge';
import { AmountInput } from '../components/ui/AmountInput';
import { TOKENS } from '../lib/theme/tokens';
import type { JournalDirection } from '@finvault/db-types';

interface LegDraft {
  id: string;
  accountId: string;
  amountMinor: bigint;
  direction: JournalDirection;
}

export const TransactionEntryScreen: React.FC = () => {
  const { accounts, refreshAccounts } = useAccounts();
  const { postOfflineTransaction } = useTransactions();

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>('');
  const [legs, setLegs] = useState<LegDraft[]>(() => [
    { id: 'leg-1', accountId: '', amountMinor: 0n, direction: 'DEBIT' },
    { id: 'leg-2', accountId: '', amountMinor: 0n, direction: 'CREDIT' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sub-50ms in-memory balance calculation
  const { debitsTotal, creditsTotal, differenceMinor, isBalanced } = useMemo(() => {
    let debits = 0n;
    let credits = 0n;
    for (const leg of legs) {
      if (leg.direction === 'DEBIT') {
        debits += leg.amountMinor;
      } else {
        credits += leg.amountMinor;
      }
    }
    const diff = debits - credits;
    return {
      debitsTotal: debits,
      creditsTotal: credits,
      differenceMinor: diff,
      isBalanced: diff === 0n && debits > 0n,
    };
  }, [legs]);

  const updateLeg = (index: number, patch: Partial<LegDraft>) => {
    setLegs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });
  };

  const addLeg = () => {
    setLegs(prev => [
      ...prev,
      {
        id: `leg-${Date.now()}-${prev.length + 1}`,
        accountId: '',
        amountMinor: 0n,
        direction: 'DEBIT',
      },
    ]);
  };

  const removeLeg = (index: number) => {
    if (legs.length <= 2) return;
    setLegs(prev => prev.filter((_, i) => i !== index));
  };

  const autoBalance = () => {
    if (differenceMinor === 0n) return;
    const requiredAmount = differenceMinor > 0n ? differenceMinor : -differenceMinor;
    const requiredDirection: JournalDirection = differenceMinor > 0n ? 'CREDIT' : 'DEBIT';

    setLegs(prev => [
      ...prev,
      {
        id: `leg-autobal-${Date.now()}`,
        accountId: '',
        amountMinor: requiredAmount,
        direction: requiredDirection,
      },
    ]);
  };

  const handleSubmit = async () => {
    if (!isBalanced) {
      Alert.alert('Ledger Imbalance', 'Transaction debits and credits must be equal before posting.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please provide a transaction description.');
      return;
    }
    const missingAccount = legs.some(l => !l.accountId);
    if (missingAccount) {
      Alert.alert('Missing Account', 'Every split leg must have an assigned account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await postOfflineTransaction({
        idempotency_key: idempotencyKey,
        transaction_date: date,
        description: description.trim(),
        entries: legs.map(l => ({
          account_id: l.accountId,
          amount_minor: l.amountMinor,
          direction: l.direction,
        })),
      });

      await refreshAccounts();

      // Reset form
      setDescription('');
      setLegs([
        { id: `leg-${Date.now()}-1`, accountId: '', amountMinor: 0n, direction: 'DEBIT' },
        { id: `leg-${Date.now()}-2`, accountId: '', amountMinor: 0n, direction: 'CREDIT' },
      ]);
      Alert.alert('Success', 'Transaction committed offline in <50ms and enqueued for sync!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Post Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Visual Group 1: Transaction Header & Live Balance Badge Card */}
      <Card variant="surface">
        <Text style={styles.headerTitle}>TRANSACTION ENTRY</Text>

        <View style={styles.fieldRow}>
          <View style={styles.dateCol}>
            <Text style={styles.fieldLabel}>DATE</Text>
            <TextInput
              style={styles.textInput}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={TOKENS.colors.sageSlate}
            />
          </View>
          <View style={styles.descCol}>
            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Groceries, Consulting..."
              placeholderTextColor={TOKENS.colors.sageSlate}
            />
          </View>
        </View>

        <View style={styles.badgeRow}>
          <BalanceBadge
            differenceMinor={differenceMinor}
            hasEntries={debitsTotal > 0n || creditsTotal > 0n}
          />
          {differenceMinor !== 0n && (
            <TouchableOpacity onPress={autoBalance} style={styles.autoBalanceBtn}>
              <Text style={styles.autoBalanceText}>⚡ Auto-Balance</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* Visual Group 2: Dynamic Multi-Split Legs Card */}
      <Card variant="surface">
        <View style={styles.legsHeader}>
          <Text style={styles.legsTitle}>SPLIT LEGS ({legs.length})</Text>
          <Text style={styles.legsSubtitle}>DEBITS = CREDITS REQUIRED</Text>
        </View>

        {legs.map((leg, idx) => (
          <View key={leg.id} style={styles.legCard}>
            <View style={styles.legTopRow}>
              <Text style={styles.legNumber}>LEG #{idx + 1}</Text>
              <View style={styles.directionToggle}>
                <TouchableOpacity
                  style={[
                    styles.directionBtn,
                    leg.direction === 'DEBIT' && styles.directionDebitActive,
                  ]}
                  onPress={() => updateLeg(idx, { direction: 'DEBIT' })}
                >
                  <Text
                    style={[
                      styles.directionText,
                      leg.direction === 'DEBIT' && styles.directionActiveText,
                    ]}
                  >
                    DEBIT
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.directionBtn,
                    leg.direction === 'CREDIT' && styles.directionCreditActive,
                  ]}
                  onPress={() => updateLeg(idx, { direction: 'CREDIT' })}
                >
                  <Text
                    style={[
                      styles.directionText,
                      leg.direction === 'CREDIT' && styles.directionActiveText,
                    ]}
                  >
                    CREDIT
                  </Text>
                </TouchableOpacity>
              </View>

              {legs.length > 2 && (
                <TouchableOpacity
                  onPress={() => removeLeg(idx)}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Account Quick Select Chips */}
            <View style={styles.accountChipsRow}>
              {accounts.slice(0, 4).map(acc => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.accountChip,
                    leg.accountId === acc.id && styles.accountChipActive,
                  ]}
                  onPress={() => updateLeg(idx, { accountId: acc.id })}
                >
                  <Text
                    style={[
                      styles.accountChipText,
                      leg.accountId === acc.id && styles.accountChipActiveText,
                    ]}
                    numberOfLines={1}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Strict BigInt Minor Unit Amount Input */}
            <AmountInput
              valueMinor={leg.amountMinor}
              onChangeMinor={val => updateLeg(idx, { amountMinor: val })}
              placeholder="0.00"
            />
          </View>
        ))}
      </Card>

      {/* Visual Group 3: Action Bar Card */}
      <Card variant="surface">
        <View style={styles.actionRow}>
          <Button
            title="+ Add Leg"
            variant="secondary"
            onPress={addLeg}
            style={styles.addLegBtn}
          />
          <Button
            title={isSubmitting ? 'Posting...' : 'Post Transaction'}
            variant="primary"
            disabled={!isBalanced || isSubmitting || !description.trim()}
            onPress={handleSubmit}
            style={styles.postBtn}
          />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
  },
  content: {
    padding: 16,
    paddingTop: 24,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 1,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  dateCol: {
    flex: 1,
  },
  descCol: {
    flex: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#040A0A',
    borderRadius: TOKENS.radii.control,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TOKENS.colors.softMint,
    fontSize: 14,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  autoBalanceBtn: {
    backgroundColor: TOKENS.colors.mossCeladon,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: TOKENS.radii.pill,
  },
  autoBalanceText: {
    fontSize: 11,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
  },
  legsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 66, 76, 0.15)',
  },
  legsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
  },
  legsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
  },
  legCard: {
    backgroundColor: 'rgba(4, 10, 10, 0.05)',
    borderRadius: TOKENS.radii.control,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 66, 76, 0.1)',
  },
  legTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  legNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
  },
  directionToggle: {
    flexDirection: 'row',
    backgroundColor: '#040A0A',
    borderRadius: TOKENS.radii.pill,
    padding: 2,
  },
  directionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radii.pill,
  },
  directionDebitActive: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  directionCreditActive: {
    backgroundColor: TOKENS.colors.slateBase,
  },
  directionText: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.sageSlate,
  },
  directionActiveText: {
    color: TOKENS.colors.obsidianCarbon,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.alert,
  },
  accountChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  accountChip: {
    backgroundColor: 'rgba(4, 10, 10, 0.1)',
    borderRadius: TOKENS.radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  accountChipActive: {
    backgroundColor: TOKENS.colors.oliveLeaf,
    borderColor: TOKENS.colors.oliveLeaf,
  },
  accountChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
  },
  accountChipActiveText: {
    color: TOKENS.colors.obsidianCarbon,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addLegBtn: {
    flex: 1,
  },
  postBtn: {
    flex: 2,
  },
});
