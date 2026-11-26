import React from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider } from './src/providers/AuthProvider';
import { DatabaseProvider } from './src/providers/DatabaseProvider';
import { SyncProvider } from './src/providers/SyncProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DatabaseProvider>
          <SyncProvider>
            <StatusBar style="light" backgroundColor="#040A0A" />
            <RootNavigator />
          </SyncProvider>
        </DatabaseProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

registerRootComponent(App);
