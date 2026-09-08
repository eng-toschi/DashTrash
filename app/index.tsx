import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_BUILD } from '@/config/app';
import { deleteTrip } from '@/commands';
import { computeBalances, expenseInBase, outstandingCents } from '@/domain/balance';
import { formatMoney } from '@/domain/money';
import { findMe, listParticipants, listTrips, loadLedger } from '@/db/repositories';
import { shareTripDossier } from '@/features/report/shareDossier';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import { useDatabase, useMutate, useQuery } from '@/state/database';
import { todayIso } from '@/state/format';
import { periodLabel } from '@/state/format';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  MoneyText,
  Row,
  Text,
  ThemeToggle,
} from '@/ui/components';
import { IconCheck, IconClock, IconMore, IconPlus, IconShare, IconTrash } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { MIN_TOUCH, RADIUS, SPACING, personColor } from '@/ui/tokens';

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
  /** Quanto cada pagador adiantou, na moeda-base, para a barra de cores. */
  readonly byPayer: { id: string; seed: string; cents: number }[];
  /** Ninguém deve nada a ninguém — o que a viagem encerrada quer dizer. */
  readonly settled: boolean;
  /** Quanto ainda falta circular entre as pessoas, na moeda do acerto. */
  readonly openCents: number;
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
      const people = listParticipants(db, trip.id);

      // Tudo na moeda-base: somar centavos de moedas diferentes daria um total
      // que não quer dizer nada, e é ele que a barra e o rodapé mostram.
      const paid = new Map<string, number>();
      let spent = 0;
      for (const expense of ledger.expenses) {
        const cents = expenseInBase(expense, trip.base_currency).totalCents;
        spent += cents;
        paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + cents);
      }

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
        people: people.map((p) => ({ id: p.id, name: p.display_name, seed: p.avatar_seed })),
        spentCents: spent,
        expenseCount: ledger.expenses.length,
        byPayer: people
          .map((p) => ({ id: p.id, seed: p.avatar_seed, cents: paid.get(p.id) ?? 0 }))
          .filter((p) => p.cents > 0)
          .sort((a, b) => b.cents - a.cents),
        settled: balances.balances.every((b) => b.cents === 0),
        openCents: outstandingCents(balances.balances),
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

  const [sheetTripId, setSheetTripId] = useState<string | undefined>(undefined);

  const active = trips.filter((trip) => !trip.archived);
  const archived = trips.filter((trip) => trip.archived);

  const sheetTrip = trips.find((trip) => trip.id === sheetTripId);
  const sheetActions: SheetAction[] =
    sheetTrip === undefined
      ? []
      : [
          {
            key: 'dossier',
            label: 'Dossiê em PDF',
            tone: 'accent',
            icon: <IconShare size={20} color={t.accent} />,
            onPress: () => { void shareTripDossier(db, sheetTrip.id, sheetTrip.name, todayIso()); },
          },
          {
            key: 'discard',
            label: 'Descartar viagem',
            tone: 'negative',
            icon: <IconTrash size={20} color={t.negative} />,
            onPress: () => { confirmDiscard(sheetTrip.id, sheetTrip.name); },
          },
        ];

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
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="label" tone="muted">
              Suas contas de viagem · {APP_BUILD}
            </Text>
            <Text variant="display">Minhas viagens</Text>
          </View>
          <ThemeToggle />
        </Row>

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
                  <Text variant="headline">{trip.name}</Text>
                  <Text variant="caption" tone="muted">
                    {[trip.period, `${String(trip.people.length)} pessoas`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Badge label="Em curso" tone="positive" uppercase />
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
                    variant="display"
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

              <View style={{ gap: SPACING.sm }}>
                {/* Uma faixa por pagador, na cor da pessoa: mostra num relance
                    quem está bancando a viagem, que é a pergunta real por trás
                    do saldo. As larguras são `flex`, então nunca somam 99,7%. */}
                <View
                  style={{
                    flexDirection: 'row',
                    height: 6,
                    borderRadius: RADIUS.pill,
                    overflow: 'hidden',
                    backgroundColor: t.surfaceAlt,
                  }}
                >
                  {trip.byPayer.map((payer) => (
                    <View key={payer.id} style={{ flex: payer.cents, backgroundColor: personColor(payer.seed) }} />
                  ))}
                </View>
                <Text variant="caption" tone="muted">
                  {trip.expenseCount === 0
                    ? 'Nenhuma despesa lançada'
                    : `${formatMoney({ cents: trip.spentCents, currency: trip.baseCurrency }, 'pt-BR')} gastos · ${String(trip.expenseCount)} despesas`}
                </Text>
              </View>
            </View>
          </Card>
        ))}

        {archived.length > 0 ? (
          <Row gap={10} style={{ marginTop: SPACING.sm, paddingHorizontal: 2 }}>
            <Text variant="overline" tone="faint">
              Encerradas
            </Text>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: t.border }} />
          </Row>
        ) : null}

        {/* Uma LINHA por viagem, não um card cada. Com card, três viagens
            encerradas já enchiam a tela e empurravam a viagem em curso — que é
            a única em que alguém ainda mexe — para fora dela. */}
        {archived.length === 0 ? null : (
          <Card padded={false} style={{ borderRadius: RADIUS.lg }}>
            {archived.map((trip, index) => (
              <View key={trip.id}>
                {index === 0 ? null : (
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth * 2,
                      backgroundColor: t.border,
                      marginLeft: 16,
                    }}
                  />
                )}
                <Row gap={SPACING.md} style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${trip.name}`}
                    onPress={() => { router.push(`/trip/${trip.id}`); }}
                    style={{ flex: 1, gap: 3, minHeight: MIN_TOUCH - 8, justifyContent: 'center' }}
                  >
                    <Text variant="body" numberOfLines={1}>
                      {trip.name}
                    </Text>
                    <Text variant="caption" tone="faint" numberOfLines={1}>
                      {[
                        trip.period,
                        `${String(trip.people.length)} pessoas`,
                        `${String(trip.expenseCount)} despesas`,
                      ]
                        .filter((part) => part !== undefined && part !== '')
                        .join(' · ')}
                    </Text>
                  </Pressable>

                  <Row gap={5}>
                    {trip.settled ? (
                      <IconCheck size={14} color={t.positive} />
                    ) : (
                      <IconClock size={14} color={t.warning} />
                    )}
                    <Text variant="caption" strong tone={trip.settled ? 'positive' : 'warning'} numeric>
                      {trip.settled
                        ? 'Acertado'
                        : `${formatMoney({ cents: trip.openCents, currency: trip.baseCurrency }, 'pt-BR')} em aberto`}
                    </Text>
                  </Row>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ações de ${trip.name}`}
                    onPress={() => { setSheetTripId(trip.id); }}
                    hitSlop={8}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: RADIUS.pill,
                      backgroundColor: t.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconMore size={15} color={t.textMuted} />
                  </Pressable>
                </Row>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Fundo sólido: sem ele o último card passa por baixo do botão. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: SPACING.md,
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + SPACING.lg,
          backgroundColor: t.bg,
        }}
      >
        <Button
          label="Nova viagem"
          variant="inverse"
          icon={<IconPlus size={19} color={t.onInverse} />}
          onPress={() => { router.push('/trip/new'); }}
        />
      </View>

      <ActionSheet
        visible={sheetTrip !== undefined}
        title={sheetTrip?.name ?? ''}
        {...(sheetTrip === undefined
          ? {}
          : { subtitle: `Encerrada · ${String(sheetTrip.expenseCount)} despesas` })}
        actions={sheetActions}
        onClose={() => { setSheetTripId(undefined); }}
      />
    </View>
  );
}
