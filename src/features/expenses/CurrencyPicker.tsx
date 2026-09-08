/**
 * Seletor de moeda.
 *
 * Antes era um chip que avançava uma moeda por toque — para chegar no iene
 * eram quatro toques, e no won não chegava nunca. Agora é uma lista com busca:
 * um toque para abrir, digitar duas letras, um toque para escolher.
 */
import { useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { CURRENCIES, searchCurrencies, type CurrencyInfo } from '@/domain/currencies';
import { stripDiacritics } from '@/domain/pix';
import { Divider, Row, Text } from '@/ui/components';
import { IconCheck } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

export function CurrencyPicker({
  visible,
  selected,
  recent,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  /** Moedas já usadas na viagem, no topo da lista. */
  recent: readonly string[];
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [query, setQuery] = useState('');

  const matches = searchCurrencies(query, stripDiacritics);
  const ordered =
    query.trim() === ''
      ? [
          ...recent
            .map((code) => CURRENCIES.find((c) => c.code === code))
            .filter((c): c is CurrencyInfo => c !== undefined),
          ...matches.filter((c) => !recent.includes(c.code)),
        ]
      : matches;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: SPACING.xl }}>
        <View style={{ paddingHorizontal: SPACING.xl, gap: SPACING.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="title">Moeda da despesa</Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
              <Text variant="label" tone="accent">
                Fechar
              </Text>
            </Pressable>
          </Row>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nome ou código"
            placeholderTextColor={t.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Buscar moeda"
            style={{
              minHeight: MIN_TOUCH,
              backgroundColor: t.surfaceAlt,
              borderRadius: RADIUS.md,
              paddingHorizontal: SPACING.md,
              fontSize: 16,
              color: t.text,
            }}
          />
        </View>

        <FlatList
          data={ordered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md }}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: item.code === selected }}
              onPress={() => {
                onSelect(item.code);
                setQuery('');
                onClose();
              }}
              style={{ minHeight: 52, justifyContent: 'center' }}
            >
              <Row>
                <Text variant="body" style={{ width: 54, fontWeight: '700' }}>
                  {item.code}
                </Text>
                <Text variant="body" tone="muted" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                {item.code === selected ? <IconCheck size={18} color={t.accent} /> : null}
              </Row>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text variant="caption" tone="muted" style={{ paddingVertical: SPACING.xl }}>
              Nenhuma moeda com esse nome.
            </Text>
          }
        />
      </View>
    </Modal>
  );
}
