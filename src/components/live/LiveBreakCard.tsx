import { Coffee } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Pausa para dúvidas. Enquanto o professor a mantém aberta, a turma olha para
 * ele — o card diz isso em vez de deixar cada aluno adivinhar se a aula travou.
 *
 * Não trava a atividade abaixo: quem já estava respondendo termina. É por isso
 * que ele fica ACIMA e não por cima — um overlay tiraria a resposta a meio
 * caminho de quem estava digitando.
 *
 * A entrada é `animate-fade-in` (CSS) e não animação de altura, pelo mesmo
 * motivo do `LivePalcoBanner`: rAF pausado em aba oculta congela a altura e o
 * card some justo no estado que ele existe para anunciar.
 */
export function LiveBreakCard() {
  const { t } = useI18n();

  return (
    <div
      data-testid="live-break-card"
      role="status"
      className="animate-fade-in rounded-3xl border border-streak/40 bg-streak/10 px-6 py-5 text-center"
    >
      <div className="flex items-center justify-center gap-2">
        <span className="relative flex w-2 h-2" aria-hidden>
          <span className="absolute inline-flex w-full h-full rounded-full bg-streak opacity-70 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-streak" />
        </span>
        <Coffee className="w-4 h-4 text-streak shrink-0" />
        <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-streak leading-none">
          {t('live.break.title')}
        </h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t('live.break.subtitle')}</p>
    </div>
  );
}
