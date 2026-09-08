import { installRandomSource } from '@/state/randomPolyfill';

// Antes de qualquer import que possa gerar um id: o Hermes não tem `crypto`.
installRandomSource();

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { DatabaseProvider } from '@/state/database';
import { ThemeProvider } from '@/ui/theme';
import { DARK, LIGHT } from '@/ui/tokens';

export default function RootLayout() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? DARK : LIGHT;

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ThemeProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="trip/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="trip/[id]/expense/new"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="trip/[id]/expense/[expenseId]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
