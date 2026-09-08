/** Moedas oferecidas no seletor, com o nome em português. */
export interface CurrencyInfo {
  readonly code: string;
  readonly name: string;
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'BRL', name: 'Real brasileiro' },
  { code: 'USD', name: 'Dólar americano' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Libra esterlina' },
  { code: 'JPY', name: 'Iene japonês' },
  { code: 'ARS', name: 'Peso argentino' },
  { code: 'CLP', name: 'Peso chileno' },
  { code: 'UYU', name: 'Peso uruguaio' },
  { code: 'PYG', name: 'Guarani paraguaio' },
  { code: 'COP', name: 'Peso colombiano' },
  { code: 'PEN', name: 'Sol peruano' },
  { code: 'MXN', name: 'Peso mexicano' },
  { code: 'CAD', name: 'Dólar canadense' },
  { code: 'CHF', name: 'Franco suíço' },
  { code: 'SEK', name: 'Coroa sueca' },
  { code: 'NOK', name: 'Coroa norueguesa' },
  { code: 'DKK', name: 'Coroa dinamarquesa' },
  { code: 'PLN', name: 'Zloty polonês' },
  { code: 'CZK', name: 'Coroa tcheca' },
  { code: 'HUF', name: 'Florim húngaro' },
  { code: 'TRY', name: 'Lira turca' },
  { code: 'ZAR', name: 'Rand sul-africano' },
  { code: 'AED', name: 'Dirham dos Emirados' },
  { code: 'MAD', name: 'Dirham marroquino' },
  { code: 'EGP', name: 'Libra egípcia' },
  { code: 'CNY', name: 'Yuan chinês' },
  { code: 'HKD', name: 'Dólar de Hong Kong' },
  { code: 'KRW', name: 'Won sul-coreano' },
  { code: 'THB', name: 'Baht tailandês' },
  { code: 'VND', name: 'Dong vietnamita' },
  { code: 'IDR', name: 'Rupia indonésia' },
  { code: 'MYR', name: 'Ringgit malaio' },
  { code: 'SGD', name: 'Dólar de Singapura' },
  { code: 'INR', name: 'Rupia indiana' },
  { code: 'AUD', name: 'Dólar australiano' },
  { code: 'NZD', name: 'Dólar neozelandês' },
  { code: 'ILS', name: 'Shekel israelense' },
];

/** Busca por código ou nome, ignorando acento e caixa. */
export function searchCurrencies(query: string, strip: (text: string) => string): CurrencyInfo[] {
  const needle = strip(query).trim().toLowerCase();
  if (needle === '') return [...CURRENCIES];
  return CURRENCIES.filter(
    (currency) =>
      currency.code.toLowerCase().includes(needle) ||
      strip(currency.name).toLowerCase().includes(needle),
  );
}
