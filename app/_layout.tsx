import { installRandomSource } from '@/state/randomPolyfill';

// Antes de qualquer import que possa gerar um id: o Hermes não tem `crypto`.
installRandomSource();

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { DatabaseProvider } from '@/state/database';
import { ThemeProvider, useTheme, useThemeControl } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Sem esperar a fonte, a primeira pintura sai na fonte do sistema e troca na
  // cara do usuário — o pulo é mais feio que a espera.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ThemeProvider>
          <Navigation />
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const palette = useTheme();
  const { isDark } = useThemeControl();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
    </>
  );
}
