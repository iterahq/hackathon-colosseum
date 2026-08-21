/**
 * Data de renovação/fim de assinatura, sem hora: o aluno decide se paga de novo
 * olhando o DIA. Devolve '' para timestamp ausente/inválido, para o chamador
 * esconder a linha em vez de mostrar "Invalid Date".
 */
export function formatBillingDate(iso: string | null | undefined, locale: 'pt' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
