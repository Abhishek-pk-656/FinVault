import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { useIOUs } from '../hooks/useIOUs';
import { useAccounts } from '../hooks/useAccounts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatPill } from '../components/ui/StatPill';
import { AmountInput } from '../components/ui/AmountInput';
import { TOKENS } from '../lib/theme/tokens';
import { formatCurrency } from '../lib/money/format';
import type { IOURecord } from '@finvault/db-types';

export const IOUTrackerScreen: React.FC = () => {
  const { ious, lentMinor, borrowedMinor, loading, settleDebt, refreshIOUs } = useIOUs();
  const { accounts, refreshAccounts } = useAccounts();

  const [activeModalIOU, setActiveModalIOU] = useState<IOURecord | null>(null);
  const [settleAmount, setSettleAmount] = useState<bigint>(0n);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc-cash');
  const [isSettling, setIsSettling] = useState<boolean>(false);

  const netPeerPosition = lentMinor - borrowedMinor;
  const activeDebts = ious.filter(i => i.status !== 'SETTLED' && i.status !== 'WRITTEN_OFF');
  const settledDebts = ious.filter(i => i.status === 'SETTLED');

  const assetAccounts = accounts.filter(a => a.type === 'ASSET' && !a.is_archived);

  const openSettlement = (iou: IOURecord) => {
    setActiveModalIOU(iou);
    setSettleAmount(iou.remaining_balance_minor);
    if (assetAccounts.length > 0) {
      setSelectedAccountId(assetAccounts[0]!.id);
    }
  };

  const handleConfirmSettlement = async () => {
    if (!activeModalIOU) return;
    if (settleAmount <= 0n) {
      Alert.alert('Invalid Amount', 'Settlement amount must be greater than zero.');
      return;
    }
    if (settleAmount > activeModalIOU.remaining_balance_minor) {
      Alert.alert('Overpayment', 'Settlement amount cannot exceed remaining debt balance.');
      return;
    }

    setIsSettling(true);
    try {
      await settleDebt(activeModalIOU.id, settleAmount, selectedAccountId);
      await refreshAccounts();
      setActiveModalIOU(null);
      Alert.alert('Settlement Complete', 'Contra clearing transaction executed atomically.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Settlement Failed', msg);
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refreshIOUs}
          tintColor={TOKENS.colors.oliveLeaf}
        />
      }
    >
      {/* Visual Group 1: Net Peer Position Hero Card */}
      <Card variant="surface">
        <Text style={styles.heroEyebrow}>NET PEER POSITION</Text>
        <Text
          style={[
            styles.heroValue,
            netPeerPosition >= 0n ? styles.positiveText : styles.alertText,
          ]}
        >
          {netPeerPosition >= 0n ? '+' : ''}{formatCurrency(netPeerPosition, '₹')}
        </Text>

        <View style={styles.pillsRow}>
          <StatPill
            label="You Are Owed (Lent)"
            value={formatCurrency(lentMinor, '₹')}
            variant="positive"
          />
          <StatPill
            label="You Owe (Borrowed)"
            value={formatCurrency(borrowedMinor, '₹')}
            variant={borrowedMinor > 0n ? 'alert' : 'normal'}
          />
        </View>
      </Card>

      {/* Visual Group 2: Active Bilateral Debts Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>ACTIVE DEBTS ({activeDebts.length})</Text>
          <Text style={styles.sectionSubtitle}>BILATERAL IOUS</Text>
        </View>

        {activeDebts.length === 0 ? (
          <Text style={styles.emptyText}>No pending debts or receivables</Text>
        ) : (
          activeDebts.map(iou => (
            <View key={iou.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.counterpartyName} numberOfLines={1}>
                  {iou.counterparty_name}
                </Text>
                <Text
                  style={[
                    styles.directionBadge,
                    iou.direction === 'LENT' ? styles.directionLent : styles.directionBorrowed,
                  ]}
                >
                  {iou.direction === 'LENT' ? 'YOU LENT' : 'YOU BORROWED'}
                </Text>
              </View>

              <View style={styles.itemRight}>
                <Text
                  style={[
                    styles.debtAmount,
                    iou.direction === 'LENT' ? styles.positiveText : styles.alertText,
                  ]}
                >
                  {formatCurrency(iou.remaining_balance_minor, '₹')}
                </Text>
                <TouchableOpacity
                  style={styles.settleActionBtn}
                  onPress={() => openSettlement(iou)}
                >
                  <Text style={styles.settleActionText}>Settle</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Visual Group 3: Settled Debts Archive Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>SETTLED ARCHIVE ({settledDebts.length})</Text>
          <Text style={styles.sectionSubtitle}>CLEARED</Text>
        </View>

        {settledDebts.length === 0 ? (
          <Text style={styles.emptyText}>No settled debts yet</Text>
        ) : (
          settledDebts.slice(0, 5).map(iou => (
            <View key={iou.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.counterpartyName} numberOfLines={1}>
                  {iou.counterparty_name}
                </Text>
                <Text style={styles.settledBadge}>✓ SETTLED</Text>
              </View>
              <Text style={styles.settledAmount}>
                {formatCurrency(iou.principal_minor, '₹')}
              </Text>
            </View>
          ))
        )}
      </Card>

      {/* Contra Clearing Settlement Modal */}
      <Modal
        visible={activeModalIOU !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActiveModalIOU(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CONTRA CLEARING SETTLEMENT</Text>
            <Text style={styles.modalSubtitle}>
              Atomic Double-Entry Settlement for {activeModalIOU?.counterparty_name}
            </Text>

            <Text style={styles.modalLabel}>SETTLEMENT AMOUNT</Text>
            <AmountInput
              valueMinor={settleAmount}
              onChangeMinor={setSettleAmount}
              placeholder="0.00"
            />

            <TouchableOpacity
              onPress={() => {
                if (activeModalIOU) setSettleAmount(activeModalIOU.remaining_balance_minor);
              }}
              style={styles.fullBalanceBtn}
            >
              <Text style={styles.fullBalanceText}>Pay Full Balance</Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>SETTLE VIA ACCOUNT</Text>
            <View style={styles.modalAccountRow}>
              {assetAccounts.map(acc => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.modalAccountChip,
                    selectedAccountId === acc.id && styles.modalAccountChipActive,
                  ]}
                  onPress={() => setSelectedAccountId(acc.id)}
                >
                  <Text
                    style={[
                      styles.modalAccountText,
                      selectedAccountId === acc.id && styles.modalAccountTextActive,
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setActiveModalIOU(null)}
                style={styles.modalCancelBtn}
              />
              <Button
                title={isSettling ? 'Settling...' : 'Confirm'}
                variant="primary"
                disabled={isSettling || settleAmount <= 0n}
                onPress={handleConfirmSettlement}
                style={styles.modalConfirmBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  positiveText: {
    color: TOKENS.colors.oliveLeaf,
  },
  alertText: {
    color: TOKENS.colors.alert,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 66, 76, 0.15)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 66, 76, 0.08)',
  },
  itemMain: {
    flex: 1,
    marginRight: 12,
  },
  counterpartyName: {
    fontSize: 15,
    fontWeight: '700',
    color: TOKENS.colors.obsidianCarbon,
    marginBottom: 2,
  },
  directionBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  directionLent: {
    color: TOKENS.colors.oliveLeaf,
  },
  directionBorrowed: {
    color: TOKENS.colors.alert,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  debtAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  settleActionBtn: {
    backgroundColor: TOKENS.colors.oliveLeaf,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: TOKENS.radii.pill,
  },
  settleActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
  },
  settledBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.oliveLeaf,
  },
  settledAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
  },
  emptyText: {
    fontSize: 13,
    color: TOKENS.colors.slateBase,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 10, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: TOKENS.colors.softMint,
    borderRadius: TOKENS.radii.container,
    padding: 20,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TOKENS.colors.obsidianCarbon,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.slateBase,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  fullBalanceBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
    marginBottom: 10,
  },
  fullBalanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.oliveLeaf,
  },
  modalAccountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  modalAccountChip: {
    backgroundColor: 'rgba(4, 10, 10, 0.08)',
    borderRadius: TOKENS.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalAccountChipActive: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  modalAccountText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.slateBase,
  },
  modalAccountTextActive: {
    color: TOKENS.colors.obsidianCarbon,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
  },
  modalConfirmBtn: {
    flex: 2,
  },
});
