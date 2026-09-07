/**
 * Intl.NumberFormat V3 aceita string desde o Node 20 / iOS 16 / Chrome 106,
 * mas o lib.d.ts do TypeScript ainda não declara essa sobrecarga.
 *
 * Isso importa aqui: formatar a partir da string decimal exata mantém a promessa
 * de que nenhum valor monetário passa por float, nem na hora de exibir.
 */
declare global {
  namespace Intl {
    interface NumberFormat {
      format(value: number | bigint | string): string;
    }
  }
}

export {};
