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
 */
export function LiveOwnWorkDivider() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3" data-testid="live-own-work-divider">
      <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
        <CornerDownRight className="w-3.5 h-3.5" aria-hidden />
        {t('live.stage.ownWork')}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
