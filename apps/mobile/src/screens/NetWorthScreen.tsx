import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAccounts } from '../hooks/useAccounts';
import { Card } from '../components/ui/Card';
import { StatPill } from '../components/ui/StatPill';
import { TOKENS } from '../lib/theme/tokens';
import { formatCurrency } from '../lib/money/format';

export const NetWorthScreen: React.FC = () => {
  const { accounts, netWorthMinor, safeToSpendMinor, loading, refreshAccounts } = useAccounts();

  const assetAccounts = accounts.filter(a => a.type === 'ASSET' && !a.is_archived);
  const liabilityAccounts = accounts.filter(a => a.type === 'LIABILITY' && !a.is_archived);

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance_minor, 0n);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance_minor, 0n);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refreshAccounts}
          tintColor={TOKENS.colors.oliveLeaf}
        />
      }
    >
      {/* Visual Group 1: Net Worth Hero Card */}
      <Card variant="surface">
        <Text style={styles.heroEyebrow}>CONSOLIDATED NET WORTH</Text>
        <Text style={styles.heroValue}>{formatCurrency(netWorthMinor, '₹')}</Text>

        <View style={styles.pillsRow}>
          <StatPill
            label="Safe-To-Spend"
            value={formatCurrency(safeToSpendMinor, '₹')}
            variant="positive"
          />
          <StatPill
            label="Total Debt"
            value={formatCurrency(totalLiabilities, '₹')}
            variant={totalLiabilities > 0n ? 'alert' : 'normal'}
          />
        </View>

        {/* Asset / Liability Ratio Visual Bar */}
        <View style={styles.ratioBarContainer}>
          <View
            style={[
              styles.ratioBarAsset,
              { flex: totalAssets > 0n ? Number(totalAssets) : 1 },
            ]}
          />
          <View
            style={[
              styles.ratioBarLiability,
              { flex: totalLiabilities > 0n ? Number(totalLiabilities) : 0 },
            ]}
          />
        </View>
      </Card>

      {/* Visual Group 2: Assets Breakdown Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>ASSETS</Text>
          <Text style={styles.sectionTotal}>{formatCurrency(totalAssets, '₹')}</Text>
        </View>

        {assetAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No active asset accounts</Text>
        ) : (
          assetAccounts.map(acc => (
            <View key={acc.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemName} numberOfLines={1}>{acc.name}</Text>
                <Text style={styles.itemCategory}>{acc.type} • {acc.currency}</Text>
              </View>
              <Text style={styles.itemAmountPositive}>
                {formatCurrency(acc.balance_minor, '₹')}
              </Text>
            </View>
          ))
        )}
      </Card>

      {/* Visual Group 3: Liabilities Breakdown Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>LIABILITIES</Text>
          <Text style={styles.sectionTotalAlert}>{formatCurrency(totalLiabilities, '₹')}</Text>
        </View>

        {liabilityAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No active debt or liability accounts</Text>
        ) : (
          liabilityAccounts.map(acc => (
            <View key={acc.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemName} numberOfLines={1}>{acc.name}</Text>
                <Text style={styles.itemCategory}>{acc.type} • {acc.currency}</Text>
              </View>
              <Text style={styles.itemAmountAlert}>
                {formatCurrency(acc.balance_minor, '₹')}
              </Text>
            </View>
          ))
        )}
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
    color: TOKENS.colors.obsidianCarbon,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  ratioBarContainer: {
    height: 8,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: TOKENS.colors.mossCeladon,
  },
  ratioBarAsset: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  ratioBarLiability: {
    backgroundColor: TOKENS.colors.alert,
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
  sectionTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.oliveLeaf,
  },
  sectionTotalAlert: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.alert,
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
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.obsidianCarbon,
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.slateBase,
  },
  itemAmountPositive: {
    fontSize: 15,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
  },
  itemAmountAlert: {
    fontSize: 15,
    fontWeight: '800',
    color: TOKENS.colors.alert,
  },
  emptyText: {
    fontSize: 13,
    color: TOKENS.colors.slateBase,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
});
