/**
 * Tokens do design system (spec §11).
 *
 * As cores são SEMÂNTICAS: `bg`, `text`, `positive`. Nenhuma tela conhece um
 * hexadecimal — é isso que faz o tema escuro ser uma troca de tabela em vez de
 * uma varredura por arquivos.
 */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const RADIUS = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 } as const;

/** Alvo mínimo de toque exigido pelas duas plataformas. */
export const MIN_TOUCH = 44;

/**
 * Famílias carregadas em `app/_layout`. Com fonte própria não se usa
 * `fontWeight`: cada peso é uma família diferente, e misturar os dois faz o
 * Android renderizar errado.
 */
export const FONT = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  bold: 'Figtree_700Bold',
  semi: 'Figtree_600SemiBold',
  medium: 'Figtree_500Medium',
} as const;

/**
 * Sombra suave dos cards. É o que separa o cartão do fundo — sem ela a tela
 * vira retângulo com fio de borda, que foi exatamente o que aconteceu.
 */
export const SHADOW = {
  card: {
    shadowColor: '#1F1B16',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#1F1B16',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Uma cor por categoria, como no desenho. Barra e ícone usam a mesma. */
export const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  restaurant: '#E8654F',
  lodging: '#6D4AFF',
  transport: '#E2A63C',
  groceries: '#3FA97A',
  flight: '#4A8FE0',
  car: '#C97B3F',
  activity: '#D65B9A',
  shopping: '#A165D6',
  fees: '#3FA9A2',
  other: '#8A8076',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other ?? '#8A8076';
}

/**
 * Fundo do ladrilho do ícone: a mesma cor da categoria, translúcida.
 *
 * Translúcido em vez de um segundo hexadecimal por categoria porque assim o
 * ladrilho se apoia na superfície do tema — clara ou escura — sem manter duas
 * tabelas de cor que inevitavelmente saem de sincronia.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase()}`;
}

/** No escuro o mesmo alfa some no fundo, então a camada é mais forte. */
export function categoryTint(category: string, isDark: boolean): string {
  return withAlpha(categoryColor(category), isDark ? 0.24 : 0.14);
}

export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textFaint: string;
  readonly border: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly positiveSoft: string;
  readonly negative: string;
  readonly negativeSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
  readonly inverse: string;
  readonly onInverse: string;
}

export const LIGHT: Palette = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EEE7',
  text: '#1F1B16',
  textMuted: '#7A7168',
  textFaint: '#A79C90',
  border: '#E8E1D7',
  accent: '#6D4AFF',
  accentSoft: '#EFEAFF',
  onAccent: '#FFFFFF',
  positive: '#1F8A5B',
  positiveSoft: '#E3F5EC',
  negative: '#D2453B',
  negativeSoft: '#FCE9E7',
  warning: '#B47B10',
  warningSoft: '#FBF0DC',
  inverse: '#1F1B16',
  onInverse: '#FAF7F2',
};

export const DARK: Palette = {
  bg: '#16141A',
  surface: '#201D26',
  surfaceAlt: '#2A2632',
  text: '#F5F1EC',
  textMuted: '#A49CB0',
  textFaint: '#6F6880',
  border: '#322D3B',
  accent: '#9B7BFF',
  accentSoft: '#2A2338',
  onAccent: '#16141A',
  positive: '#38C08A',
  positiveSoft: '#16302A',
  negative: '#FF7A6E',
  negativeSoft: '#33201F',
  warning: '#E2A63C',
  warningSoft: '#332913',
  inverse: '#F5F1EC',
  onInverse: '#16141A',
};

/**
 * Cores das pessoas: mesma luminosidade e saturação, matiz diferente.
 * Escolhidas pelo id, então a mesma pessoa tem a mesma cor em todo aparelho.
 */
export const PERSON_COLORS = [
  '#E8654F',
  '#E2A63C',
  '#3FA97A',
  '#4A8FE0',
  '#A165D6',
  '#D65B9A',
  '#3FA9A2',
  '#C97B3F',
] as const;

export function personColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length] ?? PERSON_COLORS[0];
}
