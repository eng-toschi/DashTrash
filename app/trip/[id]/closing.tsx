import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { archiveTrip, recordSettlement } from '@/commands';
import {
  getTrip,
  listExpenses,
  listParticipants,
  listRates,
  listTripCurrencies,
  loadLedger,
} from '@/db/repositories';
import { computeBalances, totalIof, totalSpent } from '@/domain/balance';
import { summarizeByCategory } from '@/domain/summary';
import { selectRateForDate } from '@/domain/fx';
import { formatMoney } from '@/domain/money';
import { buildPixPayload, parsePixKey } from '@/domain/pix';
import { computeRealDebts, paymentOptions, simplifyDebts, type Transfer } from '@/domain/settle';
import { convertCents } from '@/domain/fx';
import { useMutate, useQuery } from '@/state/database';
import { CATEGORY_LABELS, todayIso } from '@/state/format';
import { Avatar, Button, Card, Chip, Divider, MoneyText, Row, SegmentedControl, Text } from '@/ui/components';
import { IconBack, IconCopy } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { RADIUS, SPACING } from '@/ui/tokens';

const LOCALE = 'pt-BR';

interface Person {
  readonly id: string;
  readonly name: string;
  readonly seed: string;
  readonly pixKey: string | null;
  readonly pixName: string | null;
  readonly pixCity: string | null;
}

export default function ClosingScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mutate = useMutate();
  const params = useLocalSearchParams();
  const tripId = typeof params.id === 'string' ? params.id : '';
  const [mode, setMode] = useState<'simple' | 'real'>('simple');
  const [payCurrency, setPayCurrency] = useState<string | undefined>(undefined);

  const data = useQuery((db) => {
    const trip = getTrip(db, tripId);
    if (trip === undefined) return undefined;

    const ledger = loadLedger(db, tripId);
    const people: Person[] = listParticipants(db, tripId).map((p) => ({
      id: p.id,
      name: p.display_name,
      seed: p.avatar_seed,
      pixKey: p.pix_key,
      pixName: p.pix_name,
      pixCity: p.pix_city,
    }));

    const categories = summarizeByCategory(
      listExpenses(db, tripId).map((row) => ({
        category: row.category,
        amountCents: row.amount_cents,
        currency: row.currency,
        fxRatePpm: row.fx_rate_ppm,
        iofPpm: row.iof_ppm,
      })),
      trip.base_currency,
    );

    // Moedas da viagem que têm cotação conhecida: sem taxa não dá para oferecer
    // o acerto naquela moeda sem inventar número.
    const today = todayIso();
    const alternatives = new Map<string, number>();
    for (const code of listTripCurrencies(db, tripId)) {
      if (code === trip.base_currency) continue;
      const cached = selectRateForDate(listRates(db, trip.base_currency, code), today);
      const fromExpense = listExpenses(db, tripId).find((row) => row.currency === code)?.fx_rate_ppm;
      const ratePpm = cached?.ratePpm ?? fromExpense;
      if (ratePpm !== undefined) alternatives.set(code, ratePpm);
    }

    const report = computeBalances(ledger);
    return {
      baseCurrency: trip.base_currency,
      name: trip.name,
      people,
      total: totalSpent(ledger),
      iof: totalIof(ledger),
      perPerson: people.length === 0 ? 0 : Math.round(totalSpent(ledger) / people.length),
      categories,
      balances: report.balances,
      simple: simplifyDebts(report.balances),
      real: computeRealDebts(ledger),
      alternatives: [...alternatives.entries()].map(([currency, ratePpm]) => ({ currency, ratePpm })),
    };
  });

  if (data === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const transfers: Transfer[] = mode === 'simple' ? data.simple : data.real;
  const selectedCurrency = payCurrency ?? data.baseCurrency;
  const settled = transfers.length === 0;
  const nameOf = (pid: string): Person | undefined => data.people.find((p) => p.id === pid);

  const markPaid = (transfer: Transfer, currency: string, cents: number, ratePpm: number): void => {
    mutate((db, ctx) => {
      recordSettlement(db, ctx, {
        tripId,
        fromId: transfer.fromId,
        toId: transfer.toId,
        amountCents: cents,
        currency,
        fxRatePpm: ratePpm,
        settledOn: todayIso(),
      });
    });
  };

  const copyPix = (transfer: Transfer): void => {
    const receiver = nameOf(transfer.toId);
    if (receiver?.pixKey == null) return;
    const key = parsePixKey(receiver.pixKey);
    if (!key.ok) {
      Alert.alert('Chave Pix inválida', 'Peça para essa pessoa conferir a chave cadastrada.');
      return;
    }
    const payload = buildPixPayload({
      key: key.value,
      receiverName: receiver.pixName ?? receiver.name,
      city: receiver.pixCity ?? 'BRASIL',
      amountCents: transfer.cents,
    });
    void Clipboard.setStringAsync(payload);
    Alert.alert(
      'Pix copiado',
      'O código já vai com o valor. Cole no seu banco.\n\nO app não movimenta dinheiro: marcar como pago é uma declaração de quem pagou.',
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => { router.back(); }} hitSlop={12}>
            <IconBack size={24} color={t.text} />
          </Pressable>
          <Text variant="title">Fechamento</Text>
          <View style={{ width: 24 }} />
        </Row>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.lg,
          paddingBottom: insets.bottom + 140,
          gap: SPACING.md,
        }}
      >
        <Card>
          <View style={{ gap: SPACING.lg }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ gap: 3 }}>
                <Text variant="caption" tone="muted">
                  Gasto total
                </Text>
                <MoneyText variant="display" tone="default" value={{ cents: data.total, currency: data.baseCurrency }} />
              </View>
              <View style={{ gap: 3, alignItems: 'flex-end' }}>
                <Text variant="caption" tone="muted">
                  Por pessoa
                </Text>
                <MoneyText variant="title" tone="default" value={{ cents: data.perPerson, currency: data.baseCurrency }} />
              </View>
            </Row>

            <View style={{ gap: SPACING.sm }}>
              {data.categories.map(({ category, cents }) => (
                <Row key={category} gap={SPACING.sm}>
                  <Text variant="caption" style={{ width: 86 }}>
                    {CATEGORY_LABELS[category] ?? category}
                  </Text>
                  <View style={{ flex: 1, height: 9, backgroundColor: t.surfaceAlt, borderRadius: RADIUS.pill }}>
                    <View
                      style={{
                        height: 9,
                        borderRadius: RADIUS.pill,
                        backgroundColor: t.accent,
                        width: `${((cents / Math.max(1, data.total)) * 100).toFixed(2)}%` as `${number}%`,
                      }}
                    />
                  </View>
                  <MoneyText variant="caption" tone="default" value={{ cents, currency: data.baseCurrency }} />
                </Row>
              ))}
            </View>

            {data.alternatives.length > 0 || data.iof > 0 ? (
              <Text variant="caption" tone="faint">
                {data.alternatives.length > 0 ? 'Convertido pela cotação de cada dia' : 'Tudo na moeda da viagem'}
                {data.iof > 0
                  ? ` · inclui ${formatMoney({ cents: data.iof, currency: data.baseCurrency }, LOCALE)} de IOF`
                  : ''}
                .
              </Text>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: SPACING.sm, marginTop: SPACING.xs }}>
          <Text variant="title">Quem paga a quem</Text>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'simple', label: 'Simplificado' },
              { value: 'real', label: 'Dívidas reais' },
            ]}
          />
          <Text variant="caption" tone="muted" style={{ lineHeight: 17 }}>
            {mode === 'simple'
              ? 'Cruza todos os saldos para juntar pagamentos. Você pode acabar recebendo de alguém com quem não dividiu nada.'
              : 'Só quita entre quem dividiu de verdade. Costuma dar mais pagamentos, mas cada um paga a quem realmente deve.'}
          </Text>
        </View>

        {settled || data.alternatives.length === 0 ? null : (
          <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
            <Text variant="caption" tone="muted">
              Acertar em
            </Text>
            {[data.baseCurrency, ...data.alternatives.map((a) => a.currency)].map((code) => (
              <Chip
                key={code}
                label={code}
                selected={code === selectedCurrency}
                onPress={() => { setPayCurrency(code); }}
              />
            ))}
          </Row>
        )}

        {settled ? (
          <Card>
            <Text variant="body" tone="positive">
              Todo mundo está zerado. Nada a pagar.
            </Text>
          </Card>
        ) : null}

        {transfers.map((transfer) => {
          const from = nameOf(transfer.fromId);
          const to = nameOf(transfer.toId);
          const options = paymentOptions(transfer, data.baseCurrency, data.alternatives);
          const chosen = options.find((option) => option.currency === selectedCurrency) ?? options[0];
          if (chosen === undefined) return null;

          // Pagar numa moeda de granularidade mais grossa arredonda, e o resto
          // fica visível em vez de sumir dentro do saldo.
          const backInBase =
            chosen.currency === data.baseCurrency
              ? chosen.cents
              : convertCents(chosen.cents, chosen.currency, data.baseCurrency, chosen.ratePpm);
          const residueCents = backInBase - transfer.cents;
          const canPix = chosen.currency === 'BRL' && data.baseCurrency === 'BRL' && to?.pixKey != null;

          return (
            <Card key={`${transfer.fromId}-${transfer.toId}`}>
              <View style={{ gap: SPACING.md }}>
                <Row>
                  <Row gap={0}>
                    <Avatar name={from?.name ?? '?'} seed={from?.seed ?? ''} size={31} />
                    <View style={{ marginLeft: -9 }}>
                      <Avatar name={to?.name ?? '?'} seed={to?.seed ?? ''} size={31} />
                    </View>
                  </Row>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">
                      {from?.name ?? '?'} paga a {to?.name ?? '?'}
                    </Text>
                    <MoneyText
                      variant="title"
                      tone="default"
                      value={{ cents: chosen.cents, currency: chosen.currency }}
                    />
                    {chosen.currency === data.baseCurrency ? null : (
                      <Text variant="caption" tone={residueCents === 0 ? 'faint' : 'warning'} numeric>
                        ={' '}
                        {formatMoney({ cents: backInBase, currency: data.baseCurrency }, LOCALE)}
                        {residueCents === 0
                          ? ''
                          : ` · ${formatMoney({ cents: Math.abs(residueCents), currency: data.baseCurrency }, LOCALE)} ${
                              residueCents > 0 ? 'a mais' : 'a menos'
                            } que o saldo`}
                      </Text>
                    )}
                  </View>
                </Row>

                {canPix ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copiar Pix"
                    onPress={() => { copyPix(transfer); }}
                    style={{
                      minHeight: 44,
                      borderRadius: RADIUS.pill,
                      backgroundColor: t.inverse,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: SPACING.sm,
                    }}
                  >
                    <IconCopy size={15} color={t.onInverse} />
                    <Text variant="label" tone="inverse">
                      Pix copia e cola
                    </Text>
                  </Pressable>
                ) : null}

                <Divider />

                <Pressable
                  accessibilityRole="button"
                  disabled={chosen.cents === 0}
                  onPress={() => { markPaid(transfer, chosen.currency, chosen.cents, chosen.ratePpm); }}
                  style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text variant="label" tone={chosen.cents === 0 ? 'faint' : 'accent'}>
                    {chosen.cents === 0
                      ? `Valor pequeno demais para pagar em ${chosen.currency}`
                      : `Marcar como pago em ${chosen.currency}`}
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: SPACING.xl,
          right: SPACING.xl,
          bottom: insets.bottom + SPACING.lg,
          gap: SPACING.sm,
        }}
      >
        <Button
          label="Encerrar viagem"
          variant="inverse"
          disabled={!settled}
          onPress={() => {
            Alert.alert('Encerrar viagem', `"${data.name}" vai para as encerradas. O histórico continua lá.`, [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Encerrar',
                onPress: () => {
                  mutate((db, ctx) => { archiveTrip(db, ctx, tripId); });
                  router.dismissTo('/');
                },
              },
            ]);
          }}
        />
        {settled ? null : (
          <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            {transfers.length === 1
              ? 'Falta 1 pagamento para todo mundo zerar.'
              : `Faltam ${String(transfers.length)} pagamentos para todo mundo zerar.`}
          </Text>
        )}
      </View>
    </View>
  );
}
