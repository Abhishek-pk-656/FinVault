import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from './src/providers/DatabaseProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <DatabaseProvider>
      <StatusBar style="light" backgroundColor="#040A0A" />
      <RootNavigator />
    </DatabaseProvider>
  );
}
