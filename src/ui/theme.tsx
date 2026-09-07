import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DARK, LIGHT, type Palette } from './tokens';

const ThemeContext = createContext<Palette>(LIGHT);

/**
 * O tema segue o aparelho. Não existe seletor de tema no app: quem quer escuro
 * já configurou isso no sistema, e uma opção a mais em Ajustes não paga o custo.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={scheme === 'dark' ? DARK : LIGHT}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Palette {
  return useContext(ThemeContext);
}
