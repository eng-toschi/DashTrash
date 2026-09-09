/**
 * Componentes do design system.
 *
 * Todos leem cor do tema; nenhum recebe hexadecimal de fora. Valores em dinheiro
 * usam `fontVariant: tabular-nums` para os dígitos não dançarem quando a lista
 * rola (§11).
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatMoney, type Money } from '@/domain/money';
import { CATEGORY_ICONS, IconAuto, IconMoon, IconSun } from './icons';
import {
  FONT,
  MIN_TOUCH,
  RADIUS,
  SHADOW,
  SPACING,
  categoryColor,
  categoryTint,
  personColor,
  withAlpha,
} from './tokens';
import { useTheme, useThemeControl, type ThemePreference } from './theme';

const LOCALE = 'pt-BR';

/** Variantes desenhadas na Bricolage: `strong` nelas não pode cair na Figtree. */
const DISPLAY_VARIANTS: ReadonlySet<TextVariant> = new Set<TextVariant>(['display', 'headline', 'title']);

type TextTone = 'default' | 'muted' | 'faint' | 'positive' | 'negative' | 'accent' | 'warning' | 'inverse';
type TextVariant = 'display' | 'headline' | 'title' | 'body' | 'label' | 'caption' | 'micro' | 'overline';

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  numeric = false,
  strong = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  numeric?: boolean;
  /** Sobe o peso sem mudar o tamanho. Substitui o `fontWeight`, que não vale com fonte própria. */
  strong?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const color = {
    default: t.text,
    muted: t.textMuted,
    faint: t.textFaint,
    positive: t.positive,
    negative: t.negative,
    accent: t.accent,
    warning: t.warning,
    inverse: t.onInverse,
  }[tone];

  // Escala transcrita dos artboards em `design/*.dc.html`. Bricolage nos três
  // tamanhos grandes, Figtree do corpo para baixo — é a divisão do desenho.
  const byVariant: Record<TextVariant, TextStyle> = {
    display: { fontFamily: FONT.display, fontSize: 28, letterSpacing: -0.56, lineHeight: 34 },
    headline: { fontFamily: FONT.display, fontSize: 20, letterSpacing: -0.2, lineHeight: 25 },
    title: { fontFamily: FONT.display, fontSize: 17, letterSpacing: -0.17, lineHeight: 22 },
    body: { fontFamily: FONT.semi, fontSize: 15.5, lineHeight: 21 },
    label: { fontFamily: FONT.semi, fontSize: 14, lineHeight: 19 },
    caption: { fontFamily: FONT.medium, fontSize: 12.5, lineHeight: 17 },
    micro: { fontFamily: FONT.semi, fontSize: 11.5, lineHeight: 15 },
    overline: { fontFamily: FONT.bold, fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase' },
  };

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        byVariant[variant],
        { color },
        strong ? { fontFamily: DISPLAY_VARIANTS.has(variant) ? FONT.display : FONT.bold } : null,
        numeric ? styles.numeric : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** Valor monetário formatado no locale, com sinal opcional. */
export function MoneyText({
  value,
  variant = 'body',
  signed = false,
  tone,
  strong = true,
  style,
}: {
  value: Money;
  variant?: TextVariant;
  signed?: boolean;
  tone?: TextTone;
  strong?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const resolved = tone ?? (value.cents > 0 ? 'positive' : value.cents < 0 ? 'negative' : 'muted');
  const text = formatMoney({ cents: Math.abs(value.cents), currency: value.currency }, LOCALE);
  const prefix = signed && value.cents > 0 ? '+' : signed && value.cents < 0 ? '−' : '';
  return (
    <Text variant={variant} tone={resolved} numeric strong={strong} style={style}>
      {prefix}
      {text}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  style,
  padded = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const t = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: RADIUS.xl,
          padding: padded ? SPACING.lg : 0,
        },
        SHADOW.card,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'inverse' | 'destructive';
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, fg: t.onAccent, border: 'transparent' },
    secondary: { bg: t.surface, fg: t.text, border: t.border },
    inverse: { bg: t.inverse, fg: t.onInverse, border: 'transparent' },
    destructive: { bg: t.negativeSoft, fg: t.negative, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: 54,
          borderRadius: RADIUS.pill,
          ...(variant === 'secondary' ? {} : SHADOW.card),
          backgroundColor: disabled ? t.surfaceAlt : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACING.sm,
          paddingHorizontal: SPACING.xl,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon}
      <RNText style={{ fontFamily: FONT.bold, fontSize: 16, color: disabled ? t.textFaint : palette.fg }}>
        {label}
      </RNText>
    </Pressable>
  );
}

export function Avatar({ name, seed, size = 34 }: { name: string; seed: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.pill,
        backgroundColor: personColor(seed),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText style={{ color: '#FFFFFF', fontFamily: FONT.bold, fontSize: size * 0.42 }}>{initial}</RNText>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'warning' | 'positive';
}) {
  const t = useTheme();
  const soft = { neutral: t.surfaceAlt, accent: t.accentSoft, warning: t.warningSoft, positive: t.positiveSoft }[tone];
  const fg = { neutral: t.textMuted, accent: t.accent, warning: t.warning, positive: t.positive }[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={onPress === undefined}
      style={{
        backgroundColor: selected ? t.accent : soft,
        borderRadius: RADIUS.pill,
        minHeight: 38,
        justifyContent: 'center',
        paddingVertical: 9,
        paddingHorizontal: 15,
      }}
    >
      <RNText style={{ fontFamily: FONT.bold, fontSize: 13.5, color: selected ? t.onAccent : fg }}>
        {label}
      </RNText>
    </Pressable>
  );
}

/**
 * Opção de escolha única, com o dote de rádio à vista.
 *
 * O `Chip` normal esconde a seleção no preenchimento — bom quando só uma
 * opção está visível por vez, ruim quando são poucas e mutuamente exclusivas
 * (a moeda da despesa, por exemplo): ali o dote deixa claro, sem precisar
 * abrir nada, que só uma pode estar marcada e qual é.
 */
export function RadioChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: selected ? t.accentSoft : t.surfaceAlt,
        borderRadius: RADIUS.pill,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: selected ? t.accent : 'transparent',
        minHeight: 38,
        paddingVertical: 8,
        paddingHorizontal: 14,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: RADIUS.pill,
          borderWidth: 2,
          borderColor: selected ? t.accent : t.textFaint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <View style={{ width: 8, height: 8, borderRadius: RADIUS.pill, backgroundColor: t.accent }} /> : null}
      </View>
      <RNText style={{ fontFamily: FONT.bold, fontSize: 13.5, color: selected ? t.accent : t.textMuted }}>
        {label}
      </RNText>
    </Pressable>
  );
}

/**
 * Chip de categoria: ícone e cor da própria categoria.
 *
 * A cor não é enfeite — é o que deixa a lista de despesas legível de relance,
 * e é o mesmo par (ícone, cor) que aparece no ladrilho de cada lançamento.
 */
export function CategoryChip({
  category,
  label,
  selected = false,
  onPress,
}: {
  category: string;
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const { isDark } = useThemeControl();
  const color = categoryColor(category);
  const Icon = CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        minHeight: 38,
        borderRadius: RADIUS.pill,
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: selected ? categoryTint(category, isDark) : t.surface,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: selected ? withAlpha(color, 0.5) : t.border,
      }}
    >
      {Icon === undefined ? null : <Icon size={15} color={selected ? color : t.textMuted} />}
      <RNText
        style={{
          fontFamily: selected ? FONT.bold : FONT.semi,
          fontSize: 13.5,
          color: selected ? color : t.textMuted,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

/**
 * Selo: informação de estado, não um alvo de toque.
 *
 * O `Chip` existe para ser tocado e por isso respeita a altura mínima de 38;
 * repetir esse tamanho num rótulo que ninguém toca ("Em curso", "2 de 4") é o
 * que fazia a tela parecer pesada e cheia de botões falsos.
 */
export function Badge({
  label,
  tone = 'neutral',
  uppercase = false,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'positive' | 'negative';
  uppercase?: boolean;
}) {
  const t = useTheme();
  const bg = {
    neutral: t.surfaceAlt,
    accent: t.accentSoft,
    warning: t.warningSoft,
    positive: t.positiveSoft,
    negative: t.negativeSoft,
  }[tone];
  const fg = {
    neutral: t.textMuted,
    accent: t.accent,
    warning: t.warning,
    positive: t.positive,
    negative: t.negative,
  }[tone];

  return (
    <View style={{ backgroundColor: bg, borderRadius: RADIUS.pill, paddingVertical: 5, paddingHorizontal: 10 }}>
      <RNText
        style={{
          fontFamily: FONT.bold,
          fontSize: 11,
          color: fg,
          ...(uppercase ? { letterSpacing: 0.66, textTransform: 'uppercase' as const } : {}),
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { readonly value: T; readonly label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: RADIUS.pill, padding: 4, gap: 4 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { onChange(option.value); }}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH - 8,
              borderRadius: RADIUS.pill,
              backgroundColor: active ? t.surface : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              ...(active ? SHADOW.card : {}),
            }}
          >
            <RNText
              style={{
                fontFamily: active ? FONT.bold : FONT.semi,
                fontSize: 14,
                color: active ? t.text : t.textMuted,
              }}
            >
              {option.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xxl * 2 }}>
      <Text variant="title">{title}</Text>
      <Text variant="caption" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
        {hint}
      </Text>
      {action}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: t.border }} />;
}

export function Row({ children, style, gap = SPACING.md }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/**
 * Alterna claro/escuro.
 *
 * Três estados em vez de dois: quem deixa o celular trocar sozinho ao anoitecer
 * perde isso num interruptor liga/desliga. A ordem é automático → claro →
 * escuro, e o rótulo de acessibilidade diz sempre o que o próximo toque faz.
 */
const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

const THEME_LABEL: Readonly<Record<ThemePreference, string>> = {
  system: 'Tema automático',
  light: 'Tema claro',
  dark: 'Tema escuro',
};

export function ThemeToggle({ size = 40 }: { size?: number }) {
  const t = useTheme();
  const { preference, setPreference } = useThemeControl();
  const index = THEME_ORDER.indexOf(preference);
  const next = THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'system';
  const Icon = { system: IconAuto, light: IconSun, dark: IconMoon }[preference];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={THEME_LABEL[preference]}
      accessibilityHint={`Toque para mudar para ${THEME_LABEL[next].toLowerCase()}.`}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        setPreference(next);
      }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: RADIUS.pill,
        backgroundColor: t.surface,
        borderColor: t.border,
        borderWidth: StyleSheet.hairlineWidth * 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={Math.round(size * 0.5)} color={t.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  numeric: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.9 },
});
