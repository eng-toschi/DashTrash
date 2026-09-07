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
import { MIN_TOUCH, RADIUS, SPACING, personColor } from './tokens';
import { useTheme } from './theme';

const LOCALE = 'pt-BR';

type TextTone = 'default' | 'muted' | 'faint' | 'positive' | 'negative' | 'accent' | 'warning' | 'inverse';
type TextVariant = 'display' | 'title' | 'body' | 'label' | 'caption' | 'overline';

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  numeric = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  numeric?: boolean;
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

  const byVariant: Record<TextVariant, TextStyle> = {
    display: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
    body: { fontSize: 15.5, fontWeight: '500' },
    label: { fontSize: 13.5, fontWeight: '600' },
    caption: { fontSize: 12.5, fontWeight: '500' },
    overline: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  };

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[byVariant[variant], { color }, numeric ? styles.numeric : null, style]}
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
  style,
}: {
  value: Money;
  variant?: TextVariant;
  signed?: boolean;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  const resolved = tone ?? (value.cents > 0 ? 'positive' : value.cents < 0 ? 'negative' : 'muted');
  const text = formatMoney({ cents: Math.abs(value.cents), currency: value.currency }, LOCALE);
  const prefix = signed && value.cents > 0 ? '+' : signed && value.cents < 0 ? '−' : '';
  return (
    <Text variant={variant} tone={resolved} numeric style={style}>
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
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: RADIUS.xl,
          padding: padded ? SPACING.lg : 0,
        },
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
      <RNText style={{ fontSize: 16, fontWeight: '700', color: disabled ? t.textFaint : palette.fg }}>
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
      <RNText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>{initial}</RNText>
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
  const fg = { neutral: t.text, accent: t.accent, warning: t.warning, positive: t.positive }[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={onPress === undefined}
      style={{
        backgroundColor: selected ? t.inverse : soft,
        borderRadius: RADIUS.pill,
        paddingVertical: 8,
        paddingHorizontal: 13,
      }}
    >
      <RNText style={{ fontSize: 13, fontWeight: '700', color: selected ? t.onInverse : fg }}>{label}</RNText>
    </Pressable>
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
            }}
          >
            <RNText style={{ fontSize: 14, fontWeight: active ? '700' : '600', color: active ? t.text : t.textMuted }}>
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

const styles = StyleSheet.create({
  numeric: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.9 },
});
