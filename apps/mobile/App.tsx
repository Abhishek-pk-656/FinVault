import React from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DatabaseProvider } from './src/providers/DatabaseProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <ErrorBoundary>
      <DatabaseProvider>
        <StatusBar style="light" backgroundColor="#040A0A" />
        <RootNavigator />
      </DatabaseProvider>
    </ErrorBoundary>
  );
}

registerRootComponent(App);
