import { CornerDownRight } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * A fronteira entre O QUE A TURMA ESTÁ VENDO (o palco) e O QUE É MEU (a própria
 * atividade do aluno, logo abaixo).
 *
 * Pedido da call de 06/08: "componente que divide palco e activity do student
 * melhor". Antes as duas coisas eram só duas caixas empilhadas com `mb-6` — e as
 * duas renderizam o MESMO kind de atividade, com a mesma cara. Quando alguém era
 * puxado pro palco o aluno perdia a referência de onde acabava o trabalho do
 * colega e começava o dele, e chegou a responder olhando pro painel errado.
 *
 * É `sticky` porque a legenda estática só resolve na primeira dobra: rolando
 * para dentro da própria atividade ela sai da tela e a dúvida volta. Por isso o
 * `mb-6` mora AQUI e não num wrapper — um pai do tamanho da legenda não deixa o
 * sticky viajar, e ele deixaria de grudar sem nada quebrar visivelmente.
 */
export function LiveOwnWorkDivider() {
  const { t } = useI18n();
  return (
    <div
      className="sticky top-0 z-20 mb-6 -mx-4 md:-mx-8 px-4 md:px-8 py-2 flex items-center gap-3 bg-background/95 backdrop-blur-xs"
      data-testid="live-own-work-divider"
    >
      <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] uppercase tracking-wider font-mono text-clay">
        <CornerDownRight className="w-3.5 h-3.5" aria-hidden />
        {t('live.stage.ownWork')}
      </span>
      <span className="h-px flex-1 bg-clay/30" aria-hidden />
    </div>
  );
}
