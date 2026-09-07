import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addParticipant, updateParticipant } from '@/commands';
import { findMe, listParticipants } from '@/db/repositories';
import { maskPixKey, parsePixKey } from '@/domain/pix';
import { useMutate, useQuery } from '@/state/database';
import { Avatar, Button, Card, Divider, Row, Text } from '@/ui/components';
import { IconBack, IconCheck, IconInfo, IconPlus } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

export default function ParticipantsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mutate = useMutate();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [pixDraft, setPixDraft] = useState('');
  const [pixError, setPixError] = useState<string | undefined>(undefined);

  const people = useQuery((db) =>
    listParticipants(db, tripId).map((p) => ({
      id: p.id,
      name: p.display_name,
      seed: p.avatar_seed,
      pixKey: p.pix_key,
      pixKind: p.pix_key_kind,
      isMe: findMe(db, tripId)?.id === p.id,
      archived: p.archived_at !== null,
    })),
  );

  const add = (): void => {
    const name = draft.trim();
    if (name === '') return;
    mutate((db, ctx) => addParticipant(db, ctx, { tripId, displayName: name }));
    setDraft('');
  };

  const savePix = (participantId: string): void => {
    const parsed = parsePixKey(pixDraft);
    if (!parsed.ok) {
      setPixError(
        parsed.error.code === 'invalid_cpf'
          ? 'CPF inválido — confira os dígitos.'
          : parsed.error.code === 'invalid_cnpj'
            ? 'CNPJ inválido — confira os dígitos.'
            : 'Não reconheci essa chave. Use CPF, e-mail, telefone ou chave aleatória.',
      );
      return;
    }
    const name = people.find((p) => p.id === participantId)?.name ?? '';
    mutate((db, ctx) =>
      updateParticipant(db, ctx, {
        participantId,
        pixKey: parsed.value.value,
        pixKeyKind: parsed.value.kind,
        pixName: name,
      }),
    );
    setEditing(undefined);
    setPixDraft('');
    setPixError(undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => { router.back(); }} hitSlop={12}>
            <IconBack size={24} color={t.text} />
          </Pressable>
          <Text variant="title">Participantes</Text>
          <View style={{ width: 24 }} />
        </Row>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.lg,
          paddingBottom: insets.bottom + 110,
          gap: SPACING.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Card padded={false}>
          {people.map((person, index) => (
            <View key={person.id}>
              {index === 0 ? null : <Divider />}
              <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm }}>
                <Row>
                  <Avatar name={person.name} seed={person.seed} size={38} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" style={{ fontWeight: person.isMe ? '700' : '600' }}>
                      {person.name}
                      {person.isMe ? ' · você' : ''}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {person.pixKey === null
                        ? 'sem Pix cadastrado'
                        : `Pix ${maskPixKey({ kind: (person.pixKind ?? 'random') as 'cpf', value: person.pixKey })}`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar Pix de ${person.name}`}
                    hitSlop={10}
                    onPress={() => {
                      setEditing(editing === person.id ? undefined : person.id);
                      setPixDraft('');
                      setPixError(undefined);
                    }}
                  >
                    <Text variant="label" tone="accent">
                      {person.pixKey === null ? 'Cadastrar' : 'Trocar'}
                    </Text>
                  </Pressable>
                </Row>

                {editing === person.id ? (
                  <View style={{ gap: SPACING.sm }}>
                    <Row>
                      <TextInput
                        value={pixDraft}
                        onChangeText={(text) => {
                          setPixDraft(text);
                          setPixError(undefined);
                        }}
                        placeholder="CPF, e-mail, telefone ou chave aleatória"
                        placeholderTextColor={t.textFaint}
                        autoCapitalize="none"
                        accessibilityLabel="Chave Pix"
                        style={{
                          flex: 1,
                          minHeight: MIN_TOUCH,
                          fontSize: 15,
                          color: t.text,
                          backgroundColor: t.surfaceAlt,
                          borderRadius: RADIUS.md,
                          paddingHorizontal: SPACING.md,
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Salvar chave Pix"
                        onPress={() => { savePix(person.id); }}
                        style={{ backgroundColor: t.accent, borderRadius: RADIUS.pill, padding: 11 }}
                      >
                        <IconCheck size={16} color={t.onAccent} />
                      </Pressable>
                    </Row>
                    {pixError === undefined ? null : (
                      <Text variant="caption" tone="negative">
                        {pixError}
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Row>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={add}
              returnKeyType="done"
              placeholder="Adicionar alguém pelo nome"
              placeholderTextColor={t.textFaint}
              accessibilityLabel="Nome do participante"
              style={{ flex: 1, fontSize: 15.5, color: t.text, minHeight: MIN_TOUCH }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar participante"
              onPress={add}
              style={{ backgroundColor: t.accentSoft, borderRadius: RADIUS.pill, padding: 9 }}
            >
              <IconPlus size={18} color={t.accent} />
            </Pressable>
          </Row>
        </Card>

        <Card style={{ backgroundColor: t.surfaceAlt }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <IconInfo size={18} color={t.textMuted} />
            <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
              O convite por link e QR chega junto com a sincronização entre aparelhos. Por enquanto a
              viagem vive só neste celular — as despesas em nome de cada pessoa já funcionam.
            </Text>
          </Row>
        </Card>
      </ScrollView>

      <View style={{ position: 'absolute', left: SPACING.xl, right: SPACING.xl, bottom: insets.bottom + SPACING.lg }}>
        <Button label="Voltar para a viagem" variant="secondary" onPress={() => { router.back(); }} />
      </View>
    </View>
  );
}
