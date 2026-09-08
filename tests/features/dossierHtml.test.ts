import { describe, expect, it } from 'vitest';
import { buildDossier, type DossierMeta } from '@/domain/dossier';
import type { TripLedger } from '@/domain/balance';
import { escapeHtml, renderDossierHtml } from '@/features/report/dossierHtml';

const ledger: TripLedger = {
  baseCurrency: 'BRL',
  participantIds: ['ana', 'bruno'],
  expenses: [
    {
      id: 'jantar',
      amountCents: 12_400,
      currency: 'JPY',
      fxRatePpm: 37_000,
      iofPpm: 35_000,
      paidBy: 'ana',
      shares: [
        { participantId: 'ana', cents: 6200 },
        { participantId: 'bruno', cents: 6200 },
      ],
    },
  ],
  settlements: [],
};

const meta: DossierMeta = {
  tripName: 'Praia & Cia <2026>',
  startsOn: '2026-03-12',
  endsOn: '2026-03-26',
  generatedOn: '2026-09-08',
  names: { ana: 'Ana "A" Gonçalves', bruno: 'Bruno' },
  expenses: {
    jantar: { description: 'Jantar <especial> & vinho', category: 'restaurant', spentOn: '2026-03-13' },
  },
  settlements: {},
};

describe('dossiê em HTML', () => {
  const html = renderDossierHtml(buildDossier(ledger, meta));

  it('ESCAPA o que o usuário digitou', () => {
    // Uma viagem chamada "Praia & Cia" quebraria o documento em silêncio.
    expect(html).toContain('Praia &amp; Cia &lt;2026&gt;');
    expect(html).toContain('Jantar &lt;especial&gt; &amp; vinho');
    expect(html).not.toContain('<2026>');
    expect(html).not.toContain('<especial>');
  });

  it('traz os números que a tela mostra', () => {
    expect(html).toContain('474,86');
    expect(html).toContain('16,06');
  });

  it('mostra o valor original ao lado do convertido', () => {
    expect(html).toContain('12.400');
  });

  it('diz se a viagem fechou ou o que falta', () => {
    expect(html).toContain('Falta');
    const quitado = renderDossierHtml(
      buildDossier(
        {
          ...ledger,
          settlements: [
            {
              id: 's',
              fromId: 'bruno',
              toId: 'ana',
              amountCents: 23_743,
              currency: 'BRL',
              fxRatePpm: 1_000_000,
            },
          ],
        },
        meta,
      ),
    );
    expect(quitado).toContain('Viagem acertada');
  });

  it('carrega a conferência das somas no rodapé', () => {
    expect(html).toContain('conferem com o total');
  });

  it('é um documento HTML completo', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('escapeHtml cobre os cinco caracteres que importam', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
