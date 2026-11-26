import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { TOKENS } from '../lib/theme/tokens';
import { useAuth } from '../providers/AuthProvider';
import { useSyncStatus } from '../providers/SyncProvider';
import { Button } from '../components/ui/Button';
import { NetWorthScreen } from '../screens/NetWorthScreen';
import { CashFlowScreen } from '../screens/CashFlowScreen';
import { TransactionEntryScreen } from '../screens/TransactionEntryScreen';
import { IOUTrackerScreen } from '../screens/IOUTrackerScreen';

export type TabRoute = 'NetWorth' | 'CashFlow' | 'TransactionEntry' | 'IOUTracker';

interface TabConfig {
  key: TabRoute;
  label: string;
  icon: string;
}

const TABS: (TabConfig & { testId: string })[] = [
  { key: 'NetWorth', label: 'Net Worth', icon: '🛡️', testId: 'tab-net-worth' },
  { key: 'CashFlow', label: 'Cash Flow', icon: '📈', testId: 'tab-cash-flow' },
  { key: 'TransactionEntry', label: 'Entry', icon: '➕', testId: 'tab-transaction-entry' },
  { key: 'IOUTracker', label: 'IOUs', icon: '🤝', testId: 'tab-iou-tracker' },
];

export const TabNavigator: React.FC = () => {
  const { userEmail, session, signOut } = useAuth();
  const { isSyncing, pendingCount, lastSyncTime, syncError, triggerSync } = useSyncStatus();
  const [activeTab, setActiveTab] = useState<TabRoute>('NetWorth');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const syncStatusLabel = isSyncing
    ? 'Syncing...'
    : pendingCount > 0
      ? `Pending offline (${pendingCount})`
      : 'Synced';

  const handleTabPress = (route: TabRoute) => {
    if (route === activeTab) return;
    // 150ms GPU-accelerated transition (<=180ms mandate)
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 75,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 75,
        useNativeDriver: true,
      }),
    ]).start();

    setActiveTab(route);
  };

  const handleSignOut = async () => {
    setIsAccountModalOpen(false);
    await signOut();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Compact Account & Sync Status Utility Bar */}
      <View testID="mobile-top-bar" style={styles.topBar}>
        <TouchableOpacity
          testID="sync-status-badge"
          style={[
            styles.syncPill,
            pendingCount > 0 ? styles.syncPillPending : styles.syncPillSynced,
          ]}
          onPress={() => setIsAccountModalOpen(true)}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.syncDot,
              pendingCount > 0 ? styles.syncDotPending : styles.syncDotSynced,
            ]}
          />
          <Text style={styles.syncPillText}>{syncStatusLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="account-menu-btn"
          style={styles.accountPill}
          onPress={() => setIsAccountModalOpen(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.accountPillText} numberOfLines={1}>
            {userEmail ?? 'Local Dev'}
          </Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.screenContainer, { opacity: fadeAnim }]}>
        {activeTab === 'NetWorth' && <NetWorthScreen />}
        {activeTab === 'CashFlow' && <CashFlowScreen />}
        {activeTab === 'TransactionEntry' && <TransactionEntryScreen />}
        {activeTab === 'IOUTracker' && <IOUTrackerScreen />}
      </Animated.View>

      {/* Venzer Botanical Bottom Tab Bar */}
      <View testID="bottom-tab-bar" style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              testID={tab.testId}
              activeOpacity={0.7}
              onPress={() => handleTabPress(tab.key)}
              style={styles.tabItem}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Account Identity & Cloud Sync Drawer Modal */}
      <Modal
        visible={isAccountModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsAccountModalOpen(false)}
      >
        <View testID="account-modal" style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>FINVAULT ACCOUNT & SYNC</Text>
            <Text testID="account-email-text" style={styles.modalEmail} numberOfLines={1}>
              {userEmail ?? 'Local Dev Mode (Unauthenticated)'}
            </Text>

            <View style={styles.statusPanel}>
              <Text style={styles.statusPanelLabel}>CLOUD SYNC STATUS</Text>
              <Text testID="account-sync-status-text" style={styles.statusPanelValue}>
                {syncStatusLabel}
              </Text>
              {lastSyncTime && (
                <Text style={styles.statusTimestamp}>
                  Last synced: {new Date(lastSyncTime).toLocaleTimeString()}
                </Text>
              )}
              {syncError && (
                <Text testID="account-sync-error-text" style={styles.statusError}>
                  {syncError}
                </Text>
              )}
            </View>

            <Button
              testID="sync-now-btn"
              title={isSyncing ? 'Syncing...' : 'Sync Now'}
              variant="primary"
              disabled={isSyncing || !session}
              onPress={() => void triggerSync()}
              style={styles.modalPrimaryBtn}
            />

            <View style={styles.modalSecondaryRow}>
              <Button
                testID="account-modal-close-btn"
                title="Close"
                variant="secondary"
                onPress={() => setIsAccountModalOpen(false)}
                style={styles.modalHalfBtn}
              />
              <Button
                testID="sign-out-btn"
                title="Sign Out"
                variant="alert"
                onPress={() => void handleSignOut()}
                style={styles.modalHalfBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 36) : 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 66, 76, 0.45)',
    gap: 10,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radii.pill,
    borderWidth: 1,
    gap: 6,
  },
  syncPillSynced: {
    backgroundColor: 'rgba(122, 170, 74, 0.14)',
    borderColor: 'rgba(122, 170, 74, 0.45)',
  },
  syncPillPending: {
    backgroundColor: 'rgba(224, 106, 85, 0.16)',
    borderColor: 'rgba(224, 106, 85, 0.5)',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncDotSynced: {
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  syncDotPending: {
    backgroundColor: TOKENS.colors.alert,
  },
  syncPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.softMint,
  },
  accountPill: {
    flexShrink: 1,
    maxWidth: '54%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radii.pill,
    backgroundColor: 'rgba(222, 238, 218, 0.08)',
    borderWidth: 1,
    borderColor: TOKENS.colors.slateBase,
  },
  accountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.mossCeladon,
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    height: 64,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    borderTopColor: TOKENS.colors.slateBase,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: TOKENS.colors.oliveLeaf,
  },
  tabLabelInactive: {
    color: TOKENS.colors.sageSlate,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: TOKENS.colors.oliveLeaf,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 10, 0.78)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: TOKENS.colors.softMint,
    borderRadius: TOKENS.radii.container,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    padding: 20,
  },
  modalEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 1,
    marginBottom: 4,
  },
  modalEmail: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
    marginBottom: 16,
  },
  statusPanel: {
    backgroundColor: 'rgba(4, 10, 10, 0.06)',
    borderRadius: TOKENS.radii.control,
    borderWidth: 1,
    borderColor: TOKENS.colors.mossCeladon,
    padding: 12,
    marginBottom: 16,
  },
  statusPanelLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.slateBase,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statusPanelValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.obsidianCarbon,
  },
  statusTimestamp: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.slateBase,
    marginTop: 4,
  },
  statusError: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.alert,
    marginTop: 6,
  },
  modalPrimaryBtn: {
    width: '100%',
    marginBottom: 10,
  },
  modalSecondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalHalfBtn: {
    flex: 1,
  },
});
