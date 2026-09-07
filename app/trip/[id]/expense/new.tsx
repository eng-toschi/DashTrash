import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createExpense } from '@/commands';
import { getTrip, listActiveParticipants, listRates, listSubgroups } from '@/db/repositories';
import { RATE_SCALE, formatRate, parseRateInput, selectRateForDate } from '@/domain/fx';
import { formatMoney, parseMoneyInput } from '@/domain/money';
import { paidAmount, suggestIofPpm, type PaymentMethod } from '@/domain/payment';
import { computeShares, type Split } from '@/domain/split';
import { useDatabase, useMutate, useQuery } from '@/state/database';
import { CATEGORY_LABELS, CATEGORY_ORDER, PAYMENT_LABELS, todayIso } from '@/state/format';
import { Avatar, Button, Card, Chip, Divider, Row, SegmentedControl, Text } from '@/ui/components';
import { IconCheck } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

const LOCALE = 'pt-BR';
const CURRENCIES = ['BRL', 'USD', 'EUR', 'JPY', 'GBP', 'ARS', 'CLP'] as const;
const METHODS: readonly PaymentMethod[] = ['credit_card', 'debit_card', 'cash_fx', 'global_account', 'no_fx'];

export default function NewExpenseScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mutate = useMutate();
  const { db } = useDatabase();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';
  const spentOn = todayIso();

  const trip = useQuery((database) => getTrip(database, tripId));
  const people = useQuery((database) => listActiveParticipants(database, tripId));
  const subgroups = useQuery((database) => listSubgroups(database, tripId));
  const baseCurrency = trip?.base_currency ?? 'BRL';

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [method, setMethod] = useState<PaymentMethod>('no_fx');
  const [rateText, setRateText] = useState('');
  const [paidBy, setPaidBy] = useState<string>(people[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(people.map((p) => p.id));
  const [mode, setMode] = useState<'equal' | 'exact'>('equal');
  const [exact, setExact] = useState<Record<string, string>>({});

  const cachedRate = useMemo(() => {
    if (currency === baseCurrency) return undefined;
    return selectRateForDate(listRates(db, baseCurrency, currency), spentOn);
  }, [db, baseCurrency, currency, spentOn]);

  const parsedAmount = parseMoneyInput(amountText, currency, LOCALE);
  const amountCents = parsedAmount.ok ? parsedAmount.value : 0;

  const parsedRate = currency === baseCurrency ? undefined : parseRateInput(rateText);
  const ratePpm =
    currency === baseCurrency
      ? RATE_SCALE
      : parsedRate?.ok === true
        ? parsedRate.value
        : (cachedRate?.ratePpm ?? 0);

  const iofPpm = suggestIofPpm(method, currency, baseCurrency);

  const split: Split =
    mode === 'equal'
      ? { type: 'equal', participantIds: selected }
      : {
          type: 'exact',
          entries: selected.map((participantId) => {
            const parsed = parseMoneyInput(exact[participantId] ?? '', currency, LOCALE);
            return { participantId, cents: parsed.ok ? parsed.value : 0 };
          }),
        };

  const shares = amountCents > 0 ? computeShares(amountCents, split) : undefined;
  const missingCents =
    shares !== undefined && !shares.ok && shares.error.code === 'exact_mismatch'
      ? shares.error.differenceCents
      : 0;

  const converted =
    amountCents > 0 && ratePpm > 0
      ? paidAmount(amountCents, currency, baseCurrency, ratePpm, iofPpm)
      : undefined;

  const perPersonCents =
    shares?.ok === true && selected.length > 0
      ? Math.round((converted?.totalCents ?? amountCents) / selected.length)
      : 0;

  const canSave =
    amountCents > 0 && ratePpm > 0 && paidBy !== '' && selected.length > 0 && shares?.ok === true;

  const toggle = (participantId: string): void => {
    setSelected((current) =>
      current.includes(participantId)
        ? current.filter((x) => x !== participantId)
        : [...current, participantId],
    );
  };

  const save = (): void => {
    mutate((database, ctx) => {
      const result = createExpense(database, ctx, {
        tripId,
        description: description.trim() === '' ? (CATEGORY_LABELS[category] ?? 'Despesa') : description.trim(),
        category,
        amountCents,
        currency,
        fxRatePpm: ratePpm,
        fxManual: parsedRate?.ok === true,
        ...(cachedRate === undefined ? {} : { fxAsOf: cachedRate.asOf }),
        paymentMethod: method,
        iofPpm,
        spentOn,
        paidBy,
        split,
      });
      if (result.ok) router.back();
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + SPACING.lg,
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + 110,
          gap: SPACING.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" onPress={() => { router.back(); }}>
            <Text variant="label" tone="muted">
              Cancelar
            </Text>
          </Pressable>
          <Text variant="title">Nova despesa</Text>
          <View style={{ width: 60 }} />
        </Row>

        <View style={{ alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.lg }}>
          <Row gap={SPACING.sm}>
            <Chip label={currency} onPress={() => { setCurrency(nextCurrency(currency)); }} />
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0"
              placeholderTextColor={t.textFaint}
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel="Valor da despesa"
              style={{
                fontSize: 46,
                fontWeight: '700',
                color: t.text,
                minWidth: 120,
                textAlign: 'center',
                fontVariant: ['tabular-nums'],
              }}
            />
          </Row>

          {converted !== undefined && currency !== baseCurrency ? (
            <View style={{ alignItems: 'center', gap: 3 }}>
              <Text variant="label" tone="muted" numeric>
                ≈ {formatMoney({ cents: converted.totalCents, currency: baseCurrency }, LOCALE)}
              </Text>
              <Text variant="caption" tone="faint" numeric>
                {formatMoney({ cents: converted.netCents, currency: baseCurrency }, LOCALE)}
                {converted.iofCents > 0
                  ? ` + IOF ${formatMoney({ cents: converted.iofCents, currency: baseCurrency }, LOCALE)}`
                  : ''}
                {' · taxa '}
                {formatRate(ratePpm)}
                {cachedRate?.stale === true ? ` de ${cachedRate.asOf}` : ''}
              </Text>
            </View>
          ) : null}

          {currency !== baseCurrency && cachedRate === undefined ? (
            <Card style={{ width: '100%', paddingVertical: SPACING.md }}>
              <Row>
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                  Sem cotação salva. Qual a taxa de 1 {currency} em {baseCurrency}?
                </Text>
                <TextInput
                  value={rateText}
                  onChangeText={setRateText}
                  placeholder="0,00"
                  placeholderTextColor={t.textFaint}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Taxa de câmbio"
                  style={{ fontSize: 16, fontWeight: '700', color: t.text, minWidth: 80, textAlign: 'right' }}
                />
              </Row>
            </Card>
          ) : null}
        </View>

        <Card style={{ paddingVertical: SPACING.md }}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="No que foi?"
            placeholderTextColor={t.textFaint}
            accessibilityLabel="Descrição"
            style={{ fontSize: 16, fontWeight: '600', color: t.text, minHeight: MIN_TOUCH - 12 }}
          />
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
          {CATEGORY_ORDER.map((key) => (
            <Chip
              key={key}
              label={CATEGORY_LABELS[key] ?? key}
              selected={key === category}
              onPress={() => { setCategory(key); }}
            />
          ))}
        </ScrollView>

        {currency !== baseCurrency ? (
          <Card style={{ paddingVertical: SPACING.md }}>
            <View style={{ gap: SPACING.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" tone="muted">
                  Como foi pago
                </Text>
                <Text variant="caption" tone="warning" numeric>
                  {iofPpm === 0 ? 'sem IOF' : `IOF ${(iofPpm / 10_000).toFixed(1)}%`}
                </Text>
              </Row>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
                {METHODS.map((option) => (
                  <Chip
                    key={option}
                    label={PAYMENT_LABELS[option] ?? option}
                    selected={option === method}
                    onPress={() => { setMethod(option); }}
                  />
                ))}
              </ScrollView>
            </View>
          </Card>
        ) : null}

        <Card style={{ paddingVertical: SPACING.md }}>
          <View style={{ gap: SPACING.sm }}>
            <Text variant="label" tone="muted">
              Quem pagou
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
              {people.map((person) => (
                <Chip
                  key={person.id}
                  label={person.display_name}
                  selected={person.id === paidBy}
                  onPress={() => { setPaidBy(person.id); }}
                />
              ))}
            </ScrollView>
          </View>
        </Card>

        <Card>
          <View style={{ gap: SPACING.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label" tone="muted">
                Dividir entre
              </Text>
              <Text variant="caption" tone="accent" numeric>
                {selected.length} de {people.length}
                {mode === 'equal' && perPersonCents > 0
                  ? ` · ${formatMoney({ cents: perPersonCents, currency: baseCurrency }, LOCALE)} cada`
                  : ''}
              </Text>
            </Row>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
              <Chip
                label="Todos"
                selected={selected.length === people.length}
                onPress={() => { setSelected(people.map((p) => p.id)); }}
              />
              {subgroups.map((group) => (
                <Chip
                  key={group.id}
                  label={
                    group.label ??
                    group.participantIds
                      .map((pid) => people.find((p) => p.id === pid)?.display_name ?? '')
                      .filter((n) => n !== '')
                      .join(', ')
                  }
                  onPress={() => { setSelected(group.participantIds); }}
                />
              ))}
            </ScrollView>

            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'equal', label: 'Igual' },
                { value: 'exact', label: 'Valor exato' },
              ]}
            />

            <View>
              {people.map((person, index) => {
                const isOn = selected.includes(person.id);
                return (
                  <View key={person.id}>
                    {index === 0 ? null : <Divider />}
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isOn }}
                      accessibilityLabel={person.display_name}
                      onPress={() => { toggle(person.id); }}
                      style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
                    >
                      <Row>
                        <Avatar name={person.display_name} seed={person.avatar_seed} size={30} />
                        <Text variant="body" style={{ flex: 1 }}>
                          {person.display_name}
                        </Text>

                        {mode === 'exact' && isOn ? (
                          <TextInput
                            value={exact[person.id] ?? ''}
                            onChangeText={(text) => { setExact((c) => ({ ...c, [person.id]: text })); }}
                            placeholder="0,00"
                            placeholderTextColor={t.textFaint}
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Valor de ${person.display_name}`}
                            style={{
                              fontSize: 15,
                              fontWeight: '700',
                              color: t.text,
                              minWidth: 76,
                              textAlign: 'right',
                              fontVariant: ['tabular-nums'],
                            }}
                          />
                        ) : null}

                        <View
                          style={{
                            width: 23,
                            height: 23,
                            borderRadius: RADIUS.sm,
                            backgroundColor: isOn ? t.accent : 'transparent',
                            borderWidth: isOn ? 0 : 2,
                            borderColor: t.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isOn ? <IconCheck size={14} color={t.onAccent} /> : null}
                        </View>
                      </Row>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {missingCents !== 0 ? (
              <Text variant="caption" tone="negative" numeric>
                {missingCents > 0 ? 'Faltam ' : 'Passou '}
                {formatMoney({ cents: Math.abs(missingCents), currency }, LOCALE)}
                {' para fechar o total.'}
              </Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>

      <View style={{ position: 'absolute', left: SPACING.xl, right: SPACING.xl, bottom: insets.bottom + SPACING.lg }}>
        <Button label="Salvar despesa" onPress={save} disabled={!canSave} />
      </View>
    </View>
  );
}

function nextCurrency(current: string): string {
  const index = CURRENCIES.indexOf(current as (typeof CURRENCIES)[number]);
  return CURRENCIES[(index + 1) % CURRENCIES.length] ?? 'BRL';
}
