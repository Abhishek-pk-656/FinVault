import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
export default function App() {
    return (<SafeAreaView style={styles.container}>
      <StatusBar style="light" backgroundColor="#040A0A"/>
      <View style={styles.content}>
        <Text style={styles.brandTitle}>FinVault</Text>
        <Text style={styles.subtitle}>Privacy-First Mobile Financial Ledger</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>NET WORTH</Text>
          <Text style={styles.amount}>₹0.00</Text>
          <Text style={styles.statusBadge}>● SQLite Offline Storage Ready</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>ACTIVE IOUS & BILLS</Text>
          <Text style={styles.amount}>0 Pending</Text>
          <Text style={styles.caption}>Sub-50ms Local Offline Capture Active</Text>
        </View>
      </View>
    </SafeAreaView>);
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#040A0A',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 40,
        gap: 16,
    },
    brandTitle: {
        color: '#DEEEDA',
        fontSize: 26,
        fontWeight: '700',
    },
    subtitle: {
        color: '#90A999',
        fontSize: 14,
        marginBottom: 8,
    },
    card: {
        backgroundColor: '#DEEEDA',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#C7E0BA',
    },
    cardHeader: {
        color: '#38424C',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
    },
    amount: {
        color: '#38424C',
        fontSize: 28,
        fontWeight: '800',
        marginTop: 6,
    },
    statusBadge: {
        color: '#7AAA4A',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 8,
    },
    caption: {
        color: '#90A999',
        fontSize: 12,
        marginTop: 8,
    },
});
