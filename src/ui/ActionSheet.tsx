/**
 * Folha de ações: a lista que sobe de baixo quando se toca num "···".
 *
 * Existe para tirar da linha o que não precisa estar sempre visível. Cada
 * viagem encerrada tinha dois botões grudados nela — gerar dossiê e descartar —
 * e isso fazia cada viagem ocupar um card inteiro. Aqui as duas continuam a um
 * toque de distância, mas param de disputar espaço com a informação.
 *
 * O "Cancelar" separado, e o toque no fundo escurecido, existem porque a lista
 * tem uma ação destrutiva: sair dela não pode depender de mirar direito.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Row, Text } from './components';
import { IconCheck } from './icons';
import { useTheme } from './theme';
import { MIN_TOUCH, RADIUS, SPACING } from './tokens';

export interface SheetAction {
  readonly key: string;
  readonly label: string;
  readonly tone?: 'default' | 'accent' | 'negative';
  readonly icon?: ReactNode;
  /** Quando a ação é uma pessoa, em vez de um ícone. */
  readonly avatar?: { readonly name: string; readonly seed: string };
  readonly selected?: boolean;
  readonly onPress: () => void;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}) {
  const t = useTheme();
  const tone = { default: t.text, accent: t.accent, negative: t.negative };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(10, 9, 12, 0.55)' }}
      />

      <View
        style={{
          position: 'absolute',
          left: SPACING.sm,
          right: SPACING.sm,
          bottom: SPACING.sm,
          gap: SPACING.sm,
        }}
      >
        <View style={{ backgroundColor: t.surface, borderRadius: RADIUS.xl, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md, gap: 2 }}>
            <Text variant="title">{title}</Text>
            {subtitle === undefined ? null : (
              <Text variant="caption" tone="faint">
                {subtitle}
              </Text>
            )}
          </View>

          {actions.map((action) => (
            <View key={action.key}>
              <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: t.border }} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: action.selected ?? false }}
                accessibilityLabel={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH + 8,
                  justifyContent: 'center',
                  paddingHorizontal: SPACING.xl,
                  backgroundColor: pressed ? t.surfaceAlt : 'transparent',
                })}
              >
                <Row gap={13}>
                  {action.avatar === undefined ? (
                    action.icon
                  ) : (
                    <Avatar name={action.avatar.name} seed={action.avatar.seed} size={28} />
                  )}
                  <Text variant="body" style={{ flex: 1, color: tone[action.tone ?? 'default'] }}>
                    {action.label}
                  </Text>
                  {action.selected === true ? <IconCheck size={18} color={t.accent} /> : null}
                </Row>
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => ({
            backgroundColor: pressed ? t.surfaceAlt : t.surface,
            borderRadius: RADIUS.xl,
            minHeight: MIN_TOUCH + 8,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Text variant="body" strong>
            Cancelar
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
