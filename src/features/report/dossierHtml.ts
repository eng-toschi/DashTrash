/**
 * O dossiê em HTML, para virar PDF no próprio aparelho.
 *
 * É uma função pura de string: dá para testar o documento inteiro sem abrir o
 * app, e é o que garante que o papel diga o mesmo que a tela.
 *
 * Escapar não é detalhe aqui — uma viagem chamada "Praia & Cia" ou uma despesa
 * com "<3" quebrariam o documento em silêncio.
 */
import { formatMoney, type CurrencyCode } from '@/domain/money';
import { dossierChecks, type TripDossier } from '@/domain/dossier';

const LOCALE = 'pt-BR';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function money(cents: number, currency: CurrencyCode): string {
  return formatMoney({ cents, currency }, LOCALE);
}

function day(iso: string): string {
  if (iso === '') return '';
  const [year = '', month = '', date = ''] = iso.split('-');
  return `${date}/${month}/${year.slice(2)}`;
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  restaurant: 'Restaurante',
  groceries: 'Mercado',
  lodging: 'Hospedagem',
  transport: 'Transporte',
  flight: 'Voo',
  car: 'Carro',
  activity: 'Passeio',
  shopping: 'Compras',
  fees: 'Taxas',
  other: 'Outros',
};

const STYLE = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #1F1B16;
  }
  h1 { font-size: 22pt; margin: 0 0 2pt; letter-spacing: -0.4pt; }
  h2 { font-size: 12pt; margin: 22pt 0 6pt; text-transform: uppercase; letter-spacing: 1pt; color: #7A7168; }
  .sub { color: #7A7168; font-size: 10pt; margin: 0; }
  .totals { display: flex; gap: 24pt; margin-top: 14pt; padding: 12pt 0; border-top: 1.5pt solid #1F1B16; border-bottom: 0.5pt solid #D9D2C7; }
  .totals div { flex: 1; }
  .totals span { display: block; font-size: 9.5pt; color: #7A7168; }
  .totals strong { font-size: 17pt; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.6pt; color: #7A7168; border-bottom: 0.5pt solid #D9D2C7; padding: 4pt 0; font-weight: 600; }
  td { padding: 5pt 0; border-bottom: 0.5pt solid #EDE7DD; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .muted { color: #7A7168; font-size: 9.5pt; }
  .time { color: #A79C90; font-size: 9pt; font-variant-numeric: tabular-nums; }
  .pos { color: #1F8A5B; }
  .neg { color: #D2453B; }
  .badge { display: inline-block; padding: 2pt 7pt; border-radius: 20pt; font-size: 9pt; font-weight: 700; }
  .open { background: #FBF0DC; color: #8A5C0A; }
  .done { background: #E3F5EC; color: #1F8A5B; }
  .foot { margin-top: 20pt; padding-top: 8pt; border-top: 0.5pt solid #D9D2C7; color: #A79C90; font-size: 8.5pt; }
`;

export function renderDossierHtml(dossier: TripDossier): string {
  const base = dossier.baseCurrency;
  const checks = dossierChecks(dossier);

  const period =
    dossier.startsOn === null && dossier.endsOn === null
      ? ''
      : ` · ${day(dossier.startsOn ?? '')}${dossier.endsOn === null ? '' : ` a ${day(dossier.endsOn)}`}`;

  const categories = dossier.categories
    .map(
      (item) => `<tr>
        <td>${escapeHtml(CATEGORY_LABELS[item.category] ?? item.category)}</td>
        <td class="num muted">${((item.cents / Math.max(1, dossier.totalCents)) * 100).toFixed(1)}%</td>
        <td class="num">${money(item.cents, base)}</td>
      </tr>`,
    )
    .join('');

  const currencies = dossier.currencies
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.currency)}</td>
        <td class="num muted">${String(item.count)} despesa${item.count === 1 ? '' : 's'}</td>
        <td class="num muted">${money(item.amountCents, item.currency)}</td>
        <td class="num">${money(item.baseCents, base)}</td>
      </tr>`,
    )
    .join('');

  const people = dossier.people
    .map(
      (person) => `<tr>
        <td>${escapeHtml(person.name)}</td>
        <td class="num">${money(person.paidCents, base)}</td>
        <td class="num">${money(person.shareCents, base)}</td>
        <td class="num muted">${money(person.settledOutCents - person.settledInCents, base)}</td>
        <td class="num ${person.balanceCents >= 0 ? 'pos' : 'neg'}">${money(person.balanceCents, base)}</td>
      </tr>`,
    )
    .join('');

  const remaining =
    dossier.remaining.length === 0
      ? '<p class="muted">Todo mundo zerado. Nada a pagar.</p>'
      : `<table><thead><tr><th>Quem paga</th><th>A quem</th><th class="num">Valor</th></tr></thead><tbody>${dossier.remaining
          .map(
            (transfer) => `<tr>
              <td>${escapeHtml(transfer.fromName)}</td>
              <td>${escapeHtml(transfer.toName)}</td>
              <td class="num">${money(transfer.cents, base)}</td>
            </tr>`,
          )
          .join('')}</tbody></table>`;

  const settlements =
    dossier.settlements.length === 0
      ? '<p class="muted">Nenhum pagamento registrado.</p>'
      : `<table><thead><tr><th>Data</th><th>De</th><th>Para</th><th class="num">Valor</th></tr></thead><tbody>${dossier.settlements
          .map(
            (settlement) => `<tr>
              <td class="muted">${day(settlement.settledOn)}</td>
              <td>${escapeHtml(settlement.fromName)}</td>
              <td>${escapeHtml(settlement.toName)}</td>
              <td class="num">${
                settlement.currency === base
                  ? money(settlement.baseCents, base)
                  : `${money(settlement.amountCents, settlement.currency)} <span class="muted">= ${money(settlement.baseCents, base)}</span>`
              }</td>
            </tr>`,
          )
          .join('')}</tbody></table>`;

  const expenses = dossier.expenses
    .map(
      (expense) => `<tr>
        <td class="muted">${day(expense.spentOn)}${
          expense.timeLabel === undefined ? '' : `<br><span class="time">${escapeHtml(expense.timeLabel)}</span>`
        }</td>
        <td>
          ${escapeHtml(expense.description)}
          <div class="muted">${escapeHtml(expense.participantNames.join(', '))}</div>
          ${expense.placeLabel === undefined ? '' : `<div class="muted">${escapeHtml(expense.placeLabel)}</div>`}
        </td>
        <td>${escapeHtml(expense.payerName)}</td>
        <td class="num muted">${
          expense.currency === base ? '' : money(expense.amountCents, expense.currency)
        }</td>
        <td class="num">${money(expense.baseCents, base)}</td>
      </tr>`,
    )
    .join('');

  const allClosed = checks.categoriesMatchTotal && checks.currenciesMatchTotal && checks.balancesSumToZero;

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${STYLE}</style></head>
<body>
  <h1>${escapeHtml(dossier.tripName)}</h1>
  <p class="sub">Dossiê gerado em ${day(dossier.generatedOn)}${period}</p>
  <p style="margin-top:8pt"><span class="badge ${dossier.closed ? 'done' : 'open'}">${
    dossier.closed ? 'Viagem acertada' : `Faltam ${String(dossier.remaining.length)} pagamento${dossier.remaining.length === 1 ? '' : 's'}`
  }</span></p>

  <div class="totals">
    <div><span>Gasto total</span><strong>${money(dossier.totalCents, base)}</strong></div>
    <div><span>Por pessoa</span><strong>${money(dossier.perPersonCents, base)}</strong></div>
    ${dossier.iofCents > 0 ? `<div><span>IOF incluído</span><strong>${money(dossier.iofCents, base)}</strong></div>` : ''}
  </div>

  <h2>Por categoria</h2>
  <table><tbody>${categories}</tbody></table>

  ${
    dossier.currencies.length > 1
      ? `<h2>Por moeda</h2><table><tbody>${currencies}</tbody></table>`
      : ''
  }

  <h2>Por pessoa</h2>
  <table>
    <thead><tr><th>Pessoa</th><th class="num">Pagou</th><th class="num">Consumiu</th><th class="num">Acertos</th><th class="num">Saldo</th></tr></thead>
    <tbody>${people}</tbody>
  </table>

  <h2>Quem paga a quem</h2>
  ${remaining}

  <h2>Pagamentos registrados</h2>
  ${settlements}

  <h2>Todas as despesas</h2>
  <table>
    <thead><tr><th>Data</th><th>Despesa</th><th>Quem pagou</th><th class="num">Original</th><th class="num">Em ${escapeHtml(base)}</th></tr></thead>
    <tbody>${expenses}</tbody>
  </table>

  <p class="foot">
    Valores em moeda estrangeira convertidos pela cotação registrada em cada despesa, com o IOF
    da época.${allClosed ? ' As somas por categoria, por moeda e por pessoa conferem com o total.' : ' ATENÇÃO: alguma soma não fechou — confira antes de usar este documento.'}
  </p>
</body>
</html>`;
}
