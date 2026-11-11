import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAccounts } from '../hooks/useAccounts';
import { useTransactions } from '../hooks/useTransactions';
import { Card } from '../components/ui/Card';
import { StatPill } from '../components/ui/StatPill';
import { TOKENS } from '../lib/theme/tokens';
import { formatCurrency } from '../lib/money/format';

export const CashFlowScreen: React.FC = () => {
  const { accounts, refreshAccounts } = useAccounts();
  const { loading, refreshTransactions } = useTransactions();

  const handleRefresh = async () => {
    await Promise.all([refreshAccounts(), refreshTransactions()]);
  };

  const incomeAccounts = accounts.filter(a => a.type === 'INCOME' && !a.is_archived);
  const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE' && !a.is_archived);

  const totalInflows = incomeAccounts.reduce((sum, a) => sum + a.balance_minor, 0n);
  const totalOutflows = expenseAccounts.reduce((sum, a) => sum + a.balance_minor, 0n);
  const netTrajectory = totalInflows - totalOutflows;

  // Savings rate calculation in basis points: ((net * 10000n) / totalInflows) / 100n
  const savingsRateBps = totalInflows > 0n && netTrajectory > 0n
    ? Number((netTrajectory * 10000n) / totalInflows)
    : 0;
  const savingsRatePercent = (savingsRateBps / 100).toFixed(1);

  // Daily burn rate: totalOutflows / dayOfMonth
  const now = new Date();
  const dayOfMonth = BigInt(Math.max(1, now.getDate()));
  const dailyBurnMinor = totalOutflows > 0n ? totalOutflows / dayOfMonth : 0n;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={handleRefresh}
          tintColor={TOKENS.colors.oliveLeaf}
        />
      }
    >
      {/* Visual Group 1: Monthly Trajectory & Burn Rate Hero Card */}
      <Card variant="surface">
        <Text style={styles.heroEyebrow}>MONTHLY TRAJECTORY</Text>
        <Text
          style={[
            styles.heroValue,
            netTrajectory >= 0n ? styles.positiveText : styles.alertText,
          ]}
        >
          {netTrajectory >= 0n ? '+' : ''}{formatCurrency(netTrajectory, '₹')}
        </Text>

        <View style={styles.pillsRow}>
          <StatPill
            label="Savings Rate"
            value={`${savingsRatePercent}%`}
            variant={savingsRateBps > 2000 ? 'positive' : 'normal'}
          />
          <StatPill
            label="Daily Burn"
            value={formatCurrency(dailyBurnMinor, '₹')}
            variant={dailyBurnMinor > 0n ? 'alert' : 'normal'}
          />
        </View>
      </Card>

      {/* Visual Group 2: Inflow Streams Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>INFLOW STREAMS</Text>
          <Text style={styles.sectionTotalPositive}>{formatCurrency(totalInflows, '₹')}</Text>
        </View>

        {incomeAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No recorded income streams this month</Text>
        ) : (
          incomeAccounts.map(acc => (
            <View key={acc.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemName} numberOfLines={1}>{acc.name}</Text>
                <Text style={styles.itemCategory}>INCOME • {acc.currency}</Text>
              </View>
              <Text style={styles.itemAmountPositive}>
                {formatCurrency(acc.balance_minor, '₹')}
              </Text>
            </View>
          ))
        )}
      </Card>

      {/* Visual Group 3: Outflow Streams Card */}
      <Card variant="surface">
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>OUTFLOW STREAMS</Text>
          <Text style={styles.sectionTotalAlert}>{formatCurrency(totalOutflows, '₹')}</Text>
        </View>

        {expenseAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No recorded expense outflows this month</Text>
        ) : (
          expenseAccounts.map(acc => (
            <View key={acc.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemName} numberOfLines={1}>{acc.name}</Text>
                <Text style={styles.itemCategory}>EXPENSE • {acc.currency}</Text>
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
  sectionTotalPositive: {
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
