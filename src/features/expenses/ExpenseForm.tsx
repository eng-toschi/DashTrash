/**
 * Formulário de despesa, usado para criar E para editar.
 *
 * É um componente só de propósito: duas telas separadas divergem com o tempo, e
 * a regra de divisão é exatamente onde divergir sai caro.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createExpense, deleteExpense, updateExpense } from '@/commands';
import {
  findMe,
  getTrip,
  lastExpenseCurrency,
  listActiveParticipants,
  listRates,
  listTripCurrencies,
  saveRate,
} from '@/db/repositories';
import { RATE_SCALE, formatRate, parseRateInput, selectRateForDate } from '@/domain/fx';
import { allocate, formatMoney, parseMoneyInput, toDecimalString, currencyExponent } from '@/domain/money';
import { IOF_DEFAULT_PPM, paidAmount } from '@/domain/payment';
import { computeShares, type Split } from '@/domain/split';
import { useDatabase, useMutate, useQuery } from '@/state/database';
import { fetchRate } from '@/services/fxRates';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  combineDateAndTime,
  dateOfLocalIso,
  dayLabel,
  localIso,
  timeLabel,
} from '@/state/format';
import { capturePlace } from '@/services/place';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import {
  Avatar,
  Button,
  Card,
  CategoryChip,
  Divider,
  RadioChip,
  Row,
  SegmentedControl,
  Text,
} from '@/ui/components';
import { IconCheck, IconChevron, IconClock, IconPin, IconTrash, IconUsers } from '@/ui/icons';
import { useTheme, useThemeControl } from '@/ui/theme';
import { FONT, MIN_TOUCH, RADIUS, SPACING } from '@/ui/tokens';

const LOCALE = 'pt-BR';
const DEFAULT_IOF_PERCENT = IOF_DEFAULT_PPM.credit_card / 10_000;

/**
 * O teclado numérico do iOS não tem tecla de "concluído" — é limitação da
 * plataforma, não escolha nossa. Sem isso, sair do campo depende de adivinhar
 * que tocar fora funciona. Os três campos de valor (total, taxa, valor exato
 * por pessoa) compartilham a mesma barra: o sistema mostra a de quem estiver
 * focado.
 */
const AMOUNT_ACCESSORY_ID = 'expense-form-amount-done';

export interface ExpenseFormInitial {
  readonly id: string;
  readonly description: string;
  readonly category: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly fxRatePpm: number;
  readonly iofPpm: number;
  readonly paymentMethod: string;
  readonly spentOn: string;
  readonly spentAt: string | undefined;
  readonly placeLabel: string | undefined;
  readonly placeLat: number | undefined;
  readonly placeLon: number | undefined;
  readonly paidBy: string;
  readonly splitType: 'equal' | 'exact';
  readonly shares: readonly { participantId: string; inputCents: number }[];
}

function moneyToText(cents: number, currency: string): string {
  return toDecimalString(cents, currencyExponent(currency)).replace('.', ',');
}

export function ExpenseForm({ tripId, initial }: { tripId: string; initial?: ExpenseFormInitial }) {
  const t = useTheme();
  const { isDark } = useThemeControl();
  const insets = useSafeAreaInsets();
  const mutate = useMutate();
  const { db } = useDatabase();

  const trip = useQuery((database) => getTrip(database, tripId));
  const people = useQuery((database) => listActiveParticipants(database, tripId));
  const me = useQuery((database) => findMe(database, tripId));
  const baseCurrency = trip?.base_currency ?? 'BRL';

  const editing = initial !== undefined;

  // Instante da despesa. Nova nasce em AGORA — não em meia-noite: é a hora que
  // a pessoa está vendo no relógio quando lança.
  const [spentAt, setSpentAt] = useState<string>(initial?.spentAt ?? localIso());
  const [picking, setPicking] = useState<'date' | 'time' | undefined>(undefined);
  const spentOn = dateOfLocalIso(spentAt);

  const [placeLabel, setPlaceLabel] = useState(initial?.placeLabel ?? '');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | undefined>(
    initial?.placeLat === undefined || initial.placeLon === undefined
      ? undefined
      : { latitude: initial.placeLat, longitude: initial.placeLon },
  );
  const [placeStatus, setPlaceStatus] = useState<'idle' | 'loading' | 'denied' | 'no_address'>('idle');

  const [amountText, setAmountText] = useState(
    initial === undefined ? '' : moneyToText(initial.amountCents, initial.currency),
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  // 'other' era o DÉCIMO chip: a tela abria sem nenhuma categoria visível
  // marcada, e parecia quebrada. Restaurante é de longe a despesa mais lançada.
  const [category, setCategory] = useState<string>(initial?.category ?? 'restaurant');
  // Lançamento novo abre na moeda do ÚLTIMO lançamento da viagem: no Japão,
  // todas as despesas são em iene, e voltar para a moeda-base a cada uma
  // obrigava a trocar de novo toda vez.
  const [currency, setCurrency] = useState<string>(
    initial?.currency ?? lastExpenseCurrency(db, tripId) ?? baseCurrency,
  );
  const [rateText, setRateText] = useState(initial === undefined ? '' : formatRate(initial.fxRatePpm));
  const [payerSheetOpen, setPayerSheetOpen] = useState(false);
  const [rateStatus, setRateStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [hasIof, setHasIof] = useState(initial === undefined ? true : initial.iofPpm > 0);
  // Sem campo de alíquota na tela (§8.1 mudou de ideia): o valor é sempre o
  // padrão vigente, ou o que a despesa já tinha gravado quando editada.
  const iofPercentText =
    initial === undefined || initial.iofPpm === 0
      ? String(DEFAULT_IOF_PERCENT).replace('.', ',')
      : String(initial.iofPpm / 10_000).replace('.', ',');

  // Quem lança pagou, na esmagadora maioria das vezes. Deixar o default no
  // primeiro da lista alfabética fazia a despesa nascer no nome errado.
  const [paidBy, setPaidBy] = useState<string>(initial?.paidBy ?? me?.id ?? people[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(
    initial === undefined ? people.map((p) => p.id) : initial.shares.map((s) => s.participantId),
  );
  const [mode, setMode] = useState<'equal' | 'exact'>(initial?.splitType ?? 'equal');
  const [exact, setExact] = useState<Record<string, string>>(() => {
    if (initial === undefined || initial.splitType !== 'exact') return {};
    return Object.fromEntries(
      initial.shares.map((s) => [s.participantId, moneyToText(s.inputCents, initial.currency)]),
    );
  });

  const tripCurrencies = useQuery((database) => listTripCurrencies(database, tripId));

  const cachedRate = useMemo(() => {
    if (currency === baseCurrency) return undefined;
    return selectRateForDate(listRates(db, baseCurrency, currency), spentOn);
  }, [db, baseCurrency, currency, spentOn, rateStatus]);

  /**
   * Busca a cotação assim que a moeda muda, se ainda não houver uma do dia.
   *
   * Sem rede não acontece nada de ruim: o campo manual continua ali, que é como
   * o app funcionava antes. Cotação é conveniência, não dependência.
   */
  useEffect(() => {
    if (currency === baseCurrency || cachedRate?.stale === false) return;

    let cancelled = false;
    setRateStatus('loading');

    void fetchRate(currency, baseCurrency, spentOn).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        mutate((database) => { saveRate(database, baseCurrency, currency, result.value.asOf, result.value.ratePpm); });
        setRateText(formatRate(result.value.ratePpm));
        setRateStatus('idle');
      } else {
        setRateStatus('failed');
      }
    });

    return () => { cancelled = true; };
  }, [currency, baseCurrency, spentOn, cachedRate?.stale, mutate]);

  const parsedAmount = parseMoneyInput(amountText, currency, LOCALE);
  const amountCents = parsedAmount.ok ? parsedAmount.value : 0;

  const parsedRate = currency === baseCurrency ? undefined : parseRateInput(rateText);
  const ratePpm =
    currency === baseCurrency
      ? RATE_SCALE
      : parsedRate?.ok === true
        ? parsedRate.value
        : (cachedRate?.ratePpm ?? 0);

  const iofPercent = Number(iofPercentText.replace(',', '.'));
  const iofPpm =
    currency === baseCurrency || !hasIof || !Number.isFinite(iofPercent) || iofPercent < 0
      ? 0
      : Math.round(iofPercent * 10_000);

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

  /**
   * Quanto cabe a cada pessoa, na moeda do acerto — pela MESMA conta do
   * fechamento, não por uma divisão aproximada.
   *
   * `Math.round(total / n)` mostraria R$ 3,33 para três pessoas em R$ 10,00,
   * e a soma na tela daria R$ 9,99. `allocate` reparte o total já convertido
   * pelo maior resto, que é exatamente o que `expenseInBase` faz quando o
   * saldo é calculado — então o que se lê aqui é o que vai para o razão.
   */
  const perPersonInBase = useMemo(() => {
    if (shares?.ok !== true || shares.value.length === 0) return new Map<string, number>();
    const totalInBase = converted?.totalCents ?? amountCents;
    return new Map(
      allocate(
        totalInBase,
        shares.value.map((share) => ({ id: share.participantId, weight: share.cents })),
      ).map((entry) => [entry.id, entry.cents]),
    );
  }, [shares, converted, amountCents]);

  const canSave =
    amountCents > 0 && ratePpm > 0 && paidBy !== '' && selected.length > 0 && shares?.ok === true;

// O picker trabalha com `Date`. Reconstruído a partir dos componentes locais
  // do texto, nunca por `new Date(spentAt)`, que reinterpretaria o fuso.
  const spentAtDate = useMemo(() => {
    const [date = '', clock = '00:00'] = spentAt.split('T');
    const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
    const [hour = 0, minute = 0] = clock.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }, [spentAt]);

  /**
   * O picker devolve um `Date` inteiro nos dois modos: no de data interessa o
   * dia dele, no de hora interessa a hora — daí a recombinação, que preserva a
   * metade que o usuário não estava editando.
   *
   * No Android ele é um diálogo do sistema e some ao confirmar; no iOS é um
   * controle embutido que fica aberto até a pessoa fechar. Daí só o Android
   * fechar aqui.
   */
  const onPickDateTime = (_event: DateTimePickerChangeEvent, picked: Date): void => {
    if (Platform.OS === 'android') setPicking(undefined);
    setSpentAt((current) =>
      picking === 'date'
        ? combineDateAndTime(dateOfLocalIso(localIso(picked)), spentAtDate)
        : combineDateAndTime(dateOfLocalIso(current), picked),
    );
  };

  const useMyLocation = (): void => {
    setPlaceStatus('loading');
    void capturePlace().then((result) => {
      if (!result.ok) {
        setPlaceStatus(result.error.code === 'denied' ? 'denied' : 'no_address');
        return;
      }
      setCoords({ latitude: result.value.latitude, longitude: result.value.longitude });
      if (result.value.label === undefined) {
        // Sem rede o endereço não vem, mas o ponto foi guardado — e é isso que
        // a tela precisa dizer, em vez de fingir que nada aconteceu.
        setPlaceStatus('no_address');
      } else {
        setPlaceLabel(result.value.label);
        setPlaceStatus('idle');
      }
    });
  };

  /**
   * Despesa nova registra hora e lugar sozinha, sem pedir toque nenhum: a hora
   * já nasce em `localIso()` (acima) e o lugar é capturado aqui, uma vez, ao
   * abrir a tela. Sem permissão ou sem rede a despesa é salva do mesmo jeito —
   * é por isso que `capturePlace` nunca lança, só devolve um resultado.
   *
   * Só a EDIÇÃO mostra o card "Quando"/"Onde": é onde faz sentido corrigir o
   * que a captura automática errou, não em toda despesa nova.
   */
  useEffect(() => {
    if (editing) return;
    useMyLocation();
    // Roda uma vez, ao abrir a despesa nova — não a cada letra digitada.
    // `useMyLocation` e `editing` não entram nas deps de propósito.
  }, [editing]);

  const payer = people.find((p) => p.id === paidBy);


  const payerActions: SheetAction[] = people.map((person) => ({
    key: person.id,
    label: person.display_name,
    avatar: { name: person.display_name, seed: person.avatar_seed },
    selected: person.id === paidBy,
    onPress: () => { setPaidBy(person.id); },
  }));

  const toggle = (participantId: string): void => {
    setSelected((current) =>
      current.includes(participantId)
        ? current.filter((x) => x !== participantId)
        : [...current, participantId],
    );
  };

  const save = (): void => {
    const payload = {
      tripId,
      description:
        description.trim() === '' ? (CATEGORY_LABELS[category] ?? 'Despesa') : description.trim(),
      category,
      amountCents,
      currency,
      fxRatePpm: ratePpm,
      fxManual: parsedRate?.ok === true,
      ...(cachedRate === undefined ? {} : { fxAsOf: cachedRate.asOf }),
      // A forma de pagamento deixou de ter controle próprio: hoje todas as
      // modalidades com câmbio têm a mesma alíquota, então o que importa é se
      // a compra tem IOF ou não. A coluna permanece para quando isso mudar.
      paymentMethod: iofPpm > 0 ? 'credit_card' : 'no_fx',
      iofPpm,
      spentOn,
      spentAt,
      ...(placeLabel.trim() === '' ? {} : { placeLabel: placeLabel.trim() }),
      ...(coords === undefined ? {} : { placeLat: coords.latitude, placeLon: coords.longitude }),
      paidBy,
      split,
    };

    mutate((database, ctx) => {
      const result =
        initial === undefined
          ? createExpense(database, ctx, payload)
          : updateExpense(database, ctx, initial.id, payload);
      if (result.ok) router.back();
    });
  };

  const remove = (): void => {
    if (initial === undefined) return;
    Alert.alert('Excluir despesa', `"${initial.description}" sai da conta de todo mundo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          mutate((database, ctx) => {
            deleteExpense(database, ctx, initial.id);
            router.back();
          });
        },
      },
    ]);
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
          <Pressable accessibilityRole="button" onPress={() => { router.back(); }} hitSlop={10}>
            <Text variant="label" tone="muted">
              Cancelar
            </Text>
          </Pressable>
          <Text variant="title">{editing ? 'Editar despesa' : 'Nova despesa'}</Text>
          {editing ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Excluir despesa" onPress={remove} hitSlop={10}>
              <IconTrash size={20} color={t.negative} />
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </Row>

        {/* A moeda fica COLADA no número, na mesma linha de base. Antes era uma
            fileira de chips no topo, e o valor sobrava sozinho no meio de um
            vazio de duzentos pixels. */}
        <View style={{ alignItems: 'center', gap: 7, paddingTop: SPACING.lg, paddingBottom: SPACING.sm }}>
          {/* Rádio, não menu: com duas ou três moedas — o caso comum — abrir
              uma folha só para trocar era um toque a mais para ver as opções
              que já cabem na tela inteiras. */}
          {tripCurrencies.length > 1 ? (
            <View
              accessibilityRole="radiogroup"
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: SPACING.sm,
                marginBottom: SPACING.xs,
              }}
            >
              {tripCurrencies.map((code) => (
                <RadioChip key={code} label={code} selected={code === currency} onPress={() => { setCurrency(code); }} />
              ))}
            </View>
          ) : null}

          <Row gap={10} style={{ alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: t.surfaceAlt,
                borderRadius: RADIUS.pill,
                paddingVertical: 7,
                paddingHorizontal: 13,
              }}
            >
              <Text variant="caption" strong>
                {currency}
              </Text>
            </View>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0,00"
              placeholderTextColor={t.textFaint}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => { Keyboard.dismiss(); }}
              inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_ACCESSORY_ID : undefined}
              autoFocus={!editing}
              accessibilityLabel="Valor da despesa"
              style={{
                fontSize: 52,
                lineHeight: 60,
                letterSpacing: -1.2,
                fontFamily: FONT.display,
                color: t.text,
                minWidth: 120,
                textAlign: 'center',
                fontVariant: ['tabular-nums'],
              }}
            />
          </Row>

          {converted !== undefined && currency !== baseCurrency ? (
            <View style={{ alignItems: 'center', gap: 3 }}>
              <Text variant="title" numeric>
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

          {/* A caixa de câmbio só aparece quando tem algo a fazer: buscando,
              ou quando a busca falhou e sobra corrigir na mão. Com a cotação
              já resolvida (o caso comum — o dia já tinha cotação, ou a busca
              deu certo), ela ficava vazia com só o placeholder "0,00", lendo
              como um campo esquecido em vez de um campo sem uso. A taxa usada
              continua visível na linha "· taxa X" acima. */}
          {currency !== baseCurrency && (rateStatus === 'loading' || rateStatus === 'failed') ? (
            <Card style={{ width: '100%', paddingVertical: SPACING.md }}>
              <View style={{ gap: SPACING.sm }}>
                <Row style={{ justifyContent: rateStatus === 'loading' ? 'flex-start' : 'flex-end' }}>
                  {rateStatus === 'loading' ? (
                    <>
                      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                        Buscando a cotação de hoje…
                      </Text>
                      <ActivityIndicator size="small" color={t.textFaint} />
                    </>
                  ) : null}
                  <TextInput
                    value={rateText}
                    onChangeText={setRateText}
                    placeholder="0,00"
                    placeholderTextColor={t.textFaint}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => { Keyboard.dismiss(); }}
                    inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_ACCESSORY_ID : undefined}
                    accessibilityLabel="Taxa de câmbio"
                    style={{ fontSize: 16, fontFamily: FONT.bold, color: t.text, minWidth: 90, textAlign: 'right' }}
                  />
                </Row>

                {rateStatus === 'failed' ? (
                  <Text variant="caption" tone="warning">
                    Não consegui buscar a cotação agora. Digite a taxa — dá para corrigir depois.
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* O IOF sai da caixa: é só uma pergunta de sim/não, não precisa da
              moldura que o campo de câmbio (que tem texto de erro e busca
              online) ainda justifica. A alíquota usada é a `DEFAULT_IOF_PPM`
              do momento — já soma na decomposição acima ("R$ X + IOF R$ Y"). */}
          {currency !== baseCurrency ? (
            <Row style={{ width: '100%', paddingVertical: SPACING.xs }}>
              <Text variant="label" style={{ flex: 1 }}>
                Tem IOF
              </Text>
              <Switch
                value={hasIof}
                onValueChange={setHasIof}
                accessibilityLabel="Esta compra tem IOF"
                trackColor={{ true: t.accent, false: t.border }}
              />
            </Row>
          ) : null}
        </View>

        <Card style={{ paddingVertical: SPACING.md }}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="No que foi?"
            placeholderTextColor={t.textFaint}
            accessibilityLabel="Descrição"
            style={{ fontSize: 16, fontFamily: FONT.semi, color: t.text, minHeight: MIN_TOUCH - 12 }}
          />
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
          {CATEGORY_ORDER.map((key) => (
            <CategoryChip
              key={key}
              category={key}
              label={CATEGORY_LABELS[key] ?? key}
              selected={key === category}
              onPress={() => { setCategory(key); }}
            />
          ))}
        </ScrollView>

        {editing ? (
          <Card style={{ paddingVertical: 13, paddingHorizontal: 17, borderRadius: RADIUS.lg }}>
            <View style={{ gap: SPACING.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={SPACING.sm} style={{ flex: 1 }}>
                  <IconClock size={17} color={t.textFaint} />
                  <Text variant="label" tone="muted">
                    Quando
                  </Text>
                </Row>
                <Row gap={SPACING.sm}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Data da despesa"
                    onPress={() => { setPicking('date'); }}
                    hitSlop={6}
                    style={{ backgroundColor: t.surfaceAlt, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text variant="caption" strong>
                      {dayLabel(spentOn)}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Hora da despesa"
                    onPress={() => { setPicking('time'); }}
                    hitSlop={6}
                    style={{ backgroundColor: t.surfaceAlt, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text variant="caption" strong numeric>
                      {timeLabel(spentAt) ?? '--:--'}
                    </Text>
                  </Pressable>
                </Row>
              </Row>

              <Divider />

              <Row gap={SPACING.sm}>
                <IconPin size={17} color={t.textFaint} />
                <TextInput
                  value={placeLabel}
                  onChangeText={(text) => {
                    setPlaceLabel(text);
                    setPlaceStatus('idle');
                  }}
                  placeholder="Onde foi?"
                  placeholderTextColor={t.textFaint}
                  accessibilityLabel="Endereço da despesa"
                  style={{ flex: 1, fontSize: 15, fontFamily: FONT.semi, color: t.text, minHeight: 26 }}
                />
                {placeStatus === 'loading' ? (
                  <ActivityIndicator size="small" color={t.textFaint} />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Usar minha localização"
                    onPress={useMyLocation}
                    hitSlop={8}
                  >
                    <Text variant="caption" strong tone="accent">
                      Usar GPS
                    </Text>
                  </Pressable>
                )}
              </Row>

              {placeStatus === 'denied' ? (
                <Text variant="caption" tone="warning">
                  Sem permissão de localização. Dá para digitar o lugar aqui do mesmo jeito.
                </Text>
              ) : null}

              {placeStatus === 'no_address' && coords !== undefined ? (
                <Text variant="caption" tone="faint" numeric>
                  Ponto guardado ({coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}) — sem rede para
                  achar o endereço. Escreva o nome do lugar se quiser.
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Uma linha, não um card com uma fileira de chips: quem pagou é quase
            sempre quem está lançando, então isto é confirmação, não escolha. */}
        <Card
          style={{ paddingVertical: 13, paddingHorizontal: 17, borderRadius: RADIUS.lg }}
          onPress={() => { setPayerSheetOpen(true); }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" tone="muted">
              Quem pagou
            </Text>
            <Row gap={9}>
              {payer === undefined ? null : (
                <Avatar name={payer.display_name} seed={payer.avatar_seed} size={27} />
              )}
              <Text variant="body" strong>
                {payer?.display_name ?? '—'}
              </Text>
              <IconChevron size={15} color={t.textFaint} />
            </Row>
          </Row>
        </Card>

        <Card>
          <View style={{ gap: SPACING.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label" tone="muted">
                Dividir entre
              </Text>
              <Text variant="caption" strong tone="accent" numeric>
                {selected.length} de {people.length} · {mode === 'equal' ? 'igual' : 'valor exato'}
              </Text>
            </Row>

            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'equal', label: 'Igual' },
                { value: 'exact', label: 'Valor exato' },
              ]}
            />

            <View>
              {people.length === 0 ? null : (
                <>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected.length === people.length }}
                    accessibilityLabel="Todos"
                    onPress={() => { setSelected(people.map((p) => p.id)); }}
                    style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
                  >
                    <Row gap={11}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: RADIUS.pill,
                          backgroundColor: t.surfaceAlt,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconUsers size={16} color={t.textMuted} />
                      </View>
                      <Text variant="body" strong style={{ flex: 1 }}>
                        Todos
                      </Text>
                      <View
                        style={{
                          width: 23,
                          height: 23,
                          borderRadius: RADIUS.sm,
                          backgroundColor: selected.length === people.length ? t.accent : 'transparent',
                          borderWidth: selected.length === people.length ? 0 : 2,
                          borderColor: t.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected.length === people.length ? (
                          <IconCheck size={14} color={t.onAccent} />
                        ) : null}
                      </View>
                    </Row>
                  </Pressable>
                  <Divider />
                </>
              )}
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
                      style={{ minHeight: MIN_TOUCH, justifyContent: 'center', opacity: isOn ? 1 : 0.45 }}
                    >
                      <Row gap={11}>
                        <Avatar name={person.display_name} seed={person.avatar_seed} size={30} />
                        <Text variant="body" style={{ flex: 1 }}>
                          {person.display_name}
                        </Text>

                        {/* Quanto cabe a esta pessoa, na moeda do acerto. Sem
                            isto a divisão só aparece somada no topo, e a
                            pergunta de quem olha é sempre "quanto é o MEU". */}
                        {mode === 'equal' ? (
                          <Text variant="label" tone={isOn ? 'muted' : 'faint'} numeric>
                            {!isOn
                              ? 'fora'
                              : perPersonInBase.has(person.id)
                                ? formatMoney(
                                    { cents: perPersonInBase.get(person.id) ?? 0, currency: baseCurrency },
                                    LOCALE,
                                  )
                                : '—'}
                          </Text>
                        ) : null}

                        {mode === 'exact' && isOn ? (
                          <TextInput
                            value={exact[person.id] ?? ''}
                            onChangeText={(text) => { setExact((c) => ({ ...c, [person.id]: text })); }}
                            placeholder="0,00"
                            placeholderTextColor={t.textFaint}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            onSubmitEditing={() => { Keyboard.dismiss(); }}
                            inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_ACCESSORY_ID : undefined}
                            accessibilityLabel={`Valor de ${person.display_name}`}
                            style={{
                              fontSize: 15,
                              fontFamily: FONT.bold,
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

      {/* Fundo sólido, não só o botão flutuando: sem ele a lista passa POR BAIXO
          do botão enquanto rola, e o último participante fica meio coberto. */}
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
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: t.border,
        }}
      >
        <Button label={editing ? 'Salvar alterações' : 'Salvar despesa'} onPress={save} disabled={!canSave} />
      </View>

      {picking === undefined ? null : Platform.OS === 'android' ? (
        <DateTimePicker
          value={spentAtDate}
          mode={picking}
          display="default"
          onValueChange={onPickDateTime}
          onDismiss={() => { setPicking(undefined); }}
          {...(picking === 'date' ? { maximumDate: new Date() } : {})}
        />
      ) : (
        <Modal visible transparent animationType="fade" onRequestClose={() => { setPicking(undefined); }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            onPress={() => { setPicking(undefined); }}
            style={{ flex: 1, backgroundColor: 'rgba(10, 9, 12, 0.55)' }}
          />
          <View
            style={{
              position: 'absolute',
              left: SPACING.sm,
              right: SPACING.sm,
              bottom: insets.bottom + SPACING.sm,
              backgroundColor: t.surface,
              borderRadius: RADIUS.xl,
              padding: SPACING.md,
              gap: SPACING.sm,
            }}
          >
            <DateTimePicker
              value={spentAtDate}
              mode={picking}
              display="spinner"
              onValueChange={onPickDateTime}
              themeVariant={isDark ? 'dark' : 'light'}
              {...(picking === 'date' ? { maximumDate: new Date() } : {})}
            />
            <Button label="Pronto" onPress={() => { setPicking(undefined); }} />
          </View>
        </Modal>
      )}

      <ActionSheet
        visible={payerSheetOpen}
        title="Quem pagou"
        subtitle="A despesa entra como adiantamento de quem pagou."
        actions={payerActions}
        onClose={() => { setPayerSheetOpen(false); }}
      />

      {/* Uma barra colada no teclado, não um botão boiando por cima dele — é
          o mesmo desenho que o Safari e o Mail usam nos campos numéricos do
          próprio iOS: sem pílula, sem ícone, só o texto de "concluir" no
          canto onde a tecla Enter ficaria se o teclado decimal tivesse uma. */}
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
          <View style={{ backgroundColor: t.surfaceAlt, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Concluído"
              onPress={() => { Keyboard.dismiss(); }}
              style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: SPACING.lg }}
            >
              <Text variant="body" strong tone="accent">
                Concluído
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}
