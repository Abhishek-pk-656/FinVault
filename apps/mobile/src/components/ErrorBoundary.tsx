import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { TOKENS } from '../lib/theme/tokens';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[FinVault ErrorBoundary] Uncaught runtime exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Card variant="dark" style={styles.errorCard}>
              <View style={styles.badgeRow}>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>SYSTEM RECOVERY</Text>
                </View>
              </View>

              <Text style={styles.title}>Application Encountered an Error</Text>
              <Text style={styles.subtitle}>
                Local ledger state remains safely secured in offline SQLite storage.
              </Text>

              <View style={styles.errorBox}>
                <Text style={styles.errorMessage}>
                  {this.state.error.name}: {this.state.error.message}
                </Text>
              </View>

              {this.state.errorInfo?.componentStack && (
                <View style={styles.stackContainer}>
                  <Text style={styles.stackLabel}>Component Stack:</Text>
                  <ScrollView style={styles.stackScrollView} nestedScrollEnabled>
                    <Text style={styles.stackText}>
                      {this.state.errorInfo.componentStack.trim()}
                    </Text>
                  </ScrollView>
                </View>
              )}

              <Button
                title="Restart View"
                variant="primary"
                onPress={this.handleReset}
                style={styles.actionButton}
              />
            </Card>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.obsidianCarbon,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: TOKENS.colors.slateBase,
    padding: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statusBadge: {
    backgroundColor: TOKENS.colors.alert,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: TOKENS.radii.control,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TOKENS.colors.softMint,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: TOKENS.colors.sageSlate,
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#140808',
    borderColor: TOKENS.colors.alert,
    borderWidth: 1,
    borderRadius: TOKENS.radii.control,
    padding: 12,
    marginBottom: 16,
  },
  errorMessage: {
    color: TOKENS.colors.alert,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  stackContainer: {
    marginBottom: 20,
  },
  stackLabel: {
    color: TOKENS.colors.sageSlate,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  stackScrollView: {
    maxHeight: 140,
    backgroundColor: '#020505',
    borderRadius: TOKENS.radii.control,
    padding: 10,
    borderWidth: 1,
    borderColor: TOKENS.colors.slateBase,
  },
  stackText: {
    color: TOKENS.colors.softMint,
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  actionButton: {
    marginTop: 8,
  },
});
