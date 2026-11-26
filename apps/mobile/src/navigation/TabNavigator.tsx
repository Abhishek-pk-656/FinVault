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
} from 'react-native';
import { TOKENS } from '../lib/theme/tokens';
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
  const [activeTab, setActiveTab] = useState<TabRoute>('NetWorth');
  const fadeAnim = useRef(new Animated.Value(1)).current;

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

  return (
    <SafeAreaView style={styles.safeArea}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 36) : 0,
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
});
