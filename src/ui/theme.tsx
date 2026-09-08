import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting } from '@/db/repositories';
import { useDatabase } from '@/state/database';
import { DARK, LIGHT, type Palette } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const SETTING_KEY = 'theme';

interface ThemeStore {
  readonly palette: Palette;
  readonly preference: ThemePreference;
  readonly isDark: boolean;
  readonly setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeStore | undefined>(undefined);

function readPreference(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * O tema segue o sistema por padrão, mas dá para fixar claro ou escuro.
 *
 * A preferência fica no banco do aparelho, não no estado da viagem: escolher
 * escuro aqui não pode mudar a tela de ninguém.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { db } = useDatabase();
  const scheme = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>(() => readPreference(getSetting(db, SETTING_KEY)));

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setSetting(db, SETTING_KEY, next);
      setStored(next);
    },
    [db],
  );

  const isDark = preference === 'system' ? scheme === 'dark' : preference === 'dark';

  const value = useMemo<ThemeStore>(
    () => ({ palette: isDark ? DARK : LIGHT, preference, isDark, setPreference }),
    [isDark, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeStore(): ThemeStore {
  const store = useContext(ThemeContext);
  if (store === undefined) throw new Error('useTheme fora do ThemeProvider.');
  return store;
}

export function useTheme(): Palette {
  return useThemeStore().palette;
}

export function useThemeControl(): Omit<ThemeStore, 'palette'> {
  const { preference, isDark, setPreference } = useThemeStore();
  return { preference, isDark, setPreference };
}
