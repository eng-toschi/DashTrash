import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_BUILD } from '@/config/app';
import { deleteTrip } from '@/commands';
import { computeBalances } from '@/domain/balance';
import { findMe, listParticipants, listTrips, loadLedger } from '@/db/repositories';
import { shareTripDossier } from '@/features/report/shareDossier';
import { useDatabase, useMutate, useQuery } from '@/state/database';
import { todayIso } from '@/state/format';
import { periodLabel } from '@/state/format';
import { Avatar, Button, Card, Divider, EmptyState, MoneyText, Row, Text } from '@/ui/components';
import { IconPlus, IconShare, IconTrash } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

interface TripCard {
  readonly id: string;
  readonly name: string;
  readonly period: string | undefined;
  readonly baseCurrency: string;
  readonly archived: boolean;
  readonly myBalanceCents: number | undefined;
  readonly people: { id: string; name: string; seed: string }[];
  readonly spentCents: number;
  readonly expenseCount: number;
}

export default function TripsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mutate = useMutate();
  const { db } = useDatabase();

  const trips = useQuery<TripCard[]>((db) =>
    listTrips(db).map((trip) => {
      const ledger = loadLedger(db, trip.id);
      const balances = computeBalances(ledger);
      const me = findMe(db, trip.id);
      const spent = ledger.expenses.reduce((total, e) => total + e.amountCents, 0);

      return {
        id: trip.id,
        name: trip.name,
        period: periodLabel(trip.starts_on, trip.ends_on),
        baseCurrency: trip.base_currency,
        archived: trip.archived_at !== null,
        myBalanceCents:
          me === undefined
            ? undefined
            : balances.balances.find((b) => b.participantId === me.id)?.cents,
        people: listParticipants(db, trip.id).map((p) => ({
          id: p.id,
          name: p.display_name,
          seed: p.avatar_seed,
        })),
        spentCents: spent,
        expenseCount: ledger.expenses.length,
      };
    }),
  );

  /**
   * Descartar pede confirmação e diz o que se perde. É tombstone no banco, mas
   * a tela não deve prometer um "desfazer" que ainda não existe em lugar
   * nenhum — então o aviso sugere gerar o dossiê antes.
   */
  const confirmDiscard = (tripId: string, tripName: string): void => {
    Alert.alert(
      'Descartar viagem',
      `"${tripName}" sai da lista. Se quiser guardar as contas, gere o dossiê em PDF antes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => { mutate((database, ctx) => deleteTrip(database, ctx, tripId)); },
        },
      ],
    );
  };

  const active = trips.filter((trip) => !trip.archived);
  const archived = trips.filter((trip) => trip.archived);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + SPACING.md,
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + 110,
          gap: SPACING.md,
        }}
      >
        <View style={{ gap: 2, marginBottom: SPACING.xs }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" tone="muted">
              Suas contas de viagem
            </Text>
            <Text variant="caption" tone="faint">
              {APP_BUILD}
            </Text>
          </Row>
          <Text variant="display">Minhas viagens</Text>
        </View>

        {trips.length === 0 ? (
          <EmptyState
            title="Nenhuma viagem ainda"
            hint="Crie a primeira, adicione quem vai junto e comece a lançar as despesas. Tudo funciona sem internet."
          />
        ) : null}

        {active.map((trip) => (
          <Card key={trip.id} onPress={() => { router.push(`/trip/${trip.id}`); }}>
            <View style={{ gap: SPACING.lg }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 4, flex: 1 }}>
                  <Text variant="title">{trip.name}</Text>
                  <Text variant="caption" tone="muted">
                    {[trip.period, `${String(trip.people.length)} pessoas`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Row>

              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    {trip.myBalanceCents === undefined
                      ? 'Total gasto'
                      : trip.myBalanceCents >= 0
                        ? 'Você tem a receber'
                        : 'Você deve'}
                  </Text>
                  <MoneyText
                    variant="title"
                    value={{
                      cents: trip.myBalanceCents ?? trip.spentCents,
                      currency: trip.baseCurrency,
                    }}
                    {...(trip.myBalanceCents === undefined ? { tone: 'default' as const } : {})}
                  />
                </View>
                <Row gap={0}>
                  {trip.people.slice(0, 4).map((person, index) => (
                    <View
                      key={person.id}
                      style={{ marginLeft: index === 0 ? 0 : -10, borderWidth: 2, borderColor: t.surface, borderRadius: RADIUS.pill }}
                    >
                      <Avatar name={person.name} seed={person.seed} />
                    </View>
                  ))}
                </Row>
              </Row>

              <Text variant="caption" tone="faint">
                {trip.expenseCount === 0
                  ? 'Nenhuma despesa lançada'
                  : `${String(trip.expenseCount)} despesas`}
              </Text>
            </View>
          </Card>
        ))}

        {archived.length > 0 ? (
          <Text variant="overline" tone="faint" style={{ marginTop: SPACING.md }}>
            Encerradas
          </Text>
        ) : null}

        {archived.map((trip) => (
          <Card key={trip.id} style={{ backgroundColor: 'transparent' }}>
            <View style={{ gap: SPACING.md }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${trip.name}`}
                onPress={() => { router.push(`/trip/${trip.id}`); }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ gap: 3 }}>
                    <Text variant="body">{trip.name}</Text>
                    <Text variant="caption" tone="faint">
                      {[trip.period, `${String(trip.expenseCount)} despesas`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted">
                    Encerrada
                  </Text>
                </Row>
              </Pressable>

              <Divider />

              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gerar dossiê de ${trip.name}`}
                  onPress={() => { void shareTripDossier(db, trip.id, trip.name, todayIso()); }}
                  hitSlop={8}
                  style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
                >
                  <Row gap={SPACING.sm}>
                    <IconShare size={17} color={t.accent} />
                    <Text variant="label" tone="accent">
                      Dossiê em PDF
                    </Text>
                  </Row>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Descartar ${trip.name}`}
                  onPress={() => { confirmDiscard(trip.id, trip.name); }}
                  hitSlop={8}
                  style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
                >
                  <Row gap={SPACING.sm}>
                    <IconTrash size={17} color={t.textMuted} />
                    <Text variant="label" tone="muted">
                      Descartar
                    </Text>
                  </Row>
                </Pressable>
              </Row>
            </View>
          </Card>
        ))}
      </ScrollView>

      <View style={{ position: 'absolute', left: SPACING.xl, right: SPACING.xl, bottom: insets.bottom + SPACING.lg }}>
        <Button
          label="Nova viagem"
          variant="inverse"
          icon={<IconPlus size={19} color={t.onInverse} />}
          onPress={() => { router.push('/trip/new'); }}
        />
      </View>
    </View>
  );
}
