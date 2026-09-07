import { useState } from 'react';
import { Pressable, ScrollView, View, type DimensionValue } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeBalances, expenseInBase, totalSpent } from '@/domain/balance';
import { findMe, getTrip, listExpenses, listParticipants, listShares, loadLedger } from '@/db/repositories';
import { useQuery } from '@/state/database';
import { dayLabel } from '@/state/format';
import { Avatar, Card, Chip, EmptyState, MoneyText, Row, SegmentedControl, Text } from '@/ui/components';
import { CATEGORY_ICONS, IconBack, IconPlus, IconUsers } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { RADIUS, SPACING } from '@/ui/tokens';

interface ExpenseCard {
  readonly id: string;
  readonly description: string;
  readonly category: string;
  readonly spentOn: string;
  readonly payerName: string;
  readonly amountLabel: string;
  readonly peopleCount: number;
  readonly totalPeople: number;
  readonly myImpactCents: number;
}

interface TripView {
  readonly name: string;
  readonly baseCurrency: string;
  readonly totalCents: number;
  readonly myBalanceCents: number | undefined;
  readonly expenses: ExpenseCard[];
  readonly balances: { id: string; name: string; seed: string; cents: number }[];
}

export default function TripScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';
  const [tab, setTab] = useState<'expenses' | 'balances'>('expenses');

  const view = useQuery<TripView | undefined>((db) => {
    const trip = getTrip(db, tripId);
    if (trip === undefined) return undefined;

    const ledger = loadLedger(db, tripId);
    const people = listParticipants(db, tripId);
    const nameById = new Map(people.map((p) => [p.id, p.display_name]));
    const me = findMe(db, tripId);
    const report = computeBalances(ledger);

    const expenses = listExpenses(db, tripId).map((row): ExpenseCard => {
      const shares = listShares(db, row.id);
      const inBase = expenseInBase(
        {
          id: row.id,
          amountCents: row.amount_cents,
          currency: row.currency,
          fxRatePpm: row.fx_rate_ppm,
          iofPpm: row.iof_ppm,
          paidBy: row.paid_by,
          shares,
        },
        trip.base_currency,
      );

      const myShare = me === undefined ? 0 : (inBase.shares.find((s) => s.participantId === me.id)?.cents ?? 0);
      const myPayment = me !== undefined && row.paid_by === me.id ? inBase.totalCents : 0;

      return {
        id: row.id,
        description: row.description,
        category: row.category,
        spentOn: row.spent_on,
        payerName: nameById.get(row.paid_by) ?? '—',
        amountLabel: `${row.currency} ${String(row.amount_cents / 100)}`,
        peopleCount: shares.length,
        totalPeople: people.length,
        myImpactCents: myPayment - myShare,
      };
    });

    return {
      name: trip.name,
      baseCurrency: trip.base_currency,
      totalCents: totalSpent(ledger),
      myBalanceCents:
        me === undefined ? undefined : report.balances.find((b) => b.participantId === me.id)?.cents,
      expenses,
      balances: people.map((p) => ({
        id: p.id,
        name: p.display_name,
        seed: p.avatar_seed,
        cents: report.balances.find((b) => b.participantId === p.id)?.cents ?? 0,
      })),
    };
  });

  if (view === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <EmptyState title="Viagem não encontrada" hint="Ela pode ter sido apagada em outro aparelho." />
      </View>
    );
  }

  const grouped = groupByDay(view.expenses);
  const maxBalance = Math.max(1, ...view.balances.map((b) => Math.abs(b.cents)));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.xl, gap: SPACING.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => { router.back(); }} hitSlop={12}>
            <IconBack size={24} color={t.text} />
          </Pressable>
          <Text variant="title">{view.name}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Participantes"
            onPress={() => { router.push(`/trip/${tripId}/participants`); }}
            hitSlop={12}
          >
            <IconUsers size={24} color={t.text} />
          </Pressable>
        </Row>

        <Card style={{ paddingVertical: SPACING.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="muted">
                Total da viagem
              </Text>
              <MoneyText variant="title" tone="default" value={{ cents: view.totalCents, currency: view.baseCurrency }} />
            </View>
            <View style={{ width: 1, height: 34, backgroundColor: t.border }} />
            <View style={{ gap: 2, alignItems: 'flex-end' }}>
              <Text variant="caption" tone="muted">
                Seu saldo
              </Text>
              <MoneyText
                variant="title"
                signed
                value={{ cents: view.myBalanceCents ?? 0, currency: view.baseCurrency }}
              />
            </View>
          </Row>
        </Card>

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: 'Despesas' },
            { value: 'balances', label: 'Saldos' },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.lg,
          paddingBottom: insets.bottom + 120,
          gap: SPACING.sm,
        }}
      >
        {tab === 'expenses' ? (
          view.expenses.length === 0 ? (
            <EmptyState
              title="Nenhuma despesa ainda"
              hint="Toque no + para lançar a primeira. Funciona sem internet — o câmbio fica salvo com a despesa."
            />
          ) : (
            grouped.map((group) => (
              <View key={group.day} style={{ gap: SPACING.sm }}>
                <Text variant="overline" tone="faint" style={{ marginTop: SPACING.sm }}>
                  {dayLabel(group.day)}
                </Text>
                {group.items.map((expense) => {
                  const Icon = CATEGORY_ICONS[expense.category] ?? CATEGORY_ICONS.other;
                  return (
                    <Card key={expense.id} style={{ paddingVertical: SPACING.md }}>
                      <Row>
                        <View
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: RADIUS.md,
                            backgroundColor: t.surfaceAlt,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {Icon === undefined ? null : <Icon size={21} color={t.textMuted} />}
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Row gap={SPACING.sm}>
                            <Text variant="body" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>
                              {expense.description}
                            </Text>
                            {expense.peopleCount < expense.totalPeople ? (
                              <Chip
                                label={`${String(expense.peopleCount)} de ${String(expense.totalPeople)}`}
                                tone="accent"
                              />
                            ) : null}
                          </Row>
                          <Text variant="caption" tone="muted">
                            {expense.payerName} pagou {expense.amountLabel}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text variant="caption" tone="muted">
                            {expense.myImpactCents >= 0 ? 'emprestou' : 'você deve'}
                          </Text>
                          <MoneyText
                            value={{ cents: Math.abs(expense.myImpactCents), currency: view.baseCurrency }}
                            tone={expense.myImpactCents >= 0 ? 'positive' : 'negative'}
                          />
                        </View>
                      </Row>
                    </Card>
                  );
                })}
              </View>
            ))
          )
        ) : (
          <View style={{ gap: SPACING.lg }}>
            <Card>
              <View style={{ gap: SPACING.xl }}>
                {view.balances.map((person) => {
                  const width = `${((Math.abs(person.cents) / maxBalance) * 50).toFixed(2)}%` as DimensionValue;
                  return (
                  <View key={person.id} style={{ gap: SPACING.sm }}>
                    <Row>
                      <Avatar name={person.name} seed={person.seed} size={28} />
                      <Text variant="body" style={{ flex: 1 }}>
                        {person.name}
                      </Text>
                      <MoneyText signed value={{ cents: person.cents, currency: view.baseCurrency }} />
                    </Row>
                    <View style={{ height: 8, justifyContent: 'center' }}>
                      <View style={{ height: 2, backgroundColor: t.surfaceAlt }} />
                      <View
                        style={{
                          position: 'absolute',
                          height: 8,
                          borderRadius: RADIUS.pill,
                          backgroundColor: person.cents >= 0 ? t.positive : t.negative,
                          left: person.cents >= 0 ? '50%' : undefined,
                          right: person.cents < 0 ? '50%' : undefined,
                          width,
                        }}
                      />
                    </View>
                  </View>
                  );
                })}
              </View>
            </Card>

            <Pressable
              accessibilityRole="button"
              onPress={() => { router.push(`/trip/${tripId}/closing`); }}
              style={{
                backgroundColor: t.accent,
                borderRadius: RADIUS.pill,
                minHeight: 54,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="body" style={{ color: t.onAccent, fontWeight: '700', fontSize: 16 }}>
                Fechar a viagem
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nova despesa"
        onPress={() => { router.push(`/trip/${tripId}/expense/new`); }}
        style={{
          position: 'absolute',
          right: SPACING.xl,
          bottom: insets.bottom + SPACING.lg,
          width: 62,
          height: 62,
          borderRadius: RADIUS.pill,
          backgroundColor: t.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconPlus size={27} color={t.onAccent} />
      </Pressable>
    </View>
  );
}

function groupByDay(expenses: readonly ExpenseCard[]): { day: string; items: ExpenseCard[] }[] {
  const groups = new Map<string, ExpenseCard[]>();
  for (const expense of expenses) {
    const bucket = groups.get(expense.spentOn) ?? [];
    bucket.push(expense);
    groups.set(expense.spentOn, bucket);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({ day, items }));
}
