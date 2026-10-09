import { Heart, HeartCrack } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { attemptBudget, attemptNotice, CODE_ATTEMPT_BUDGET } from './attemptBudget.js';

/**
 * O saldo de vidas, na tela de veredito das DUAS superfícies do `code`.
 *
 * Um componente só porque a frase é a mesma pergunta nas duas ("quantas me
 * sobram?"), e porque o corte por variante já é o suficiente: o guiado e o
 * editor aberto discordam de quase tudo, e o pouco em que concordam não deveria
 * ser copiado.
 *
 * `note` rides on the same muted line (e.g. "editor locked"), so the panel spends
 * one row on both instead of two.
 *
 * Só aparece DEPOIS de um envio, e é a mesma decisão do Tainan sobre a checklist
 * de checks (`CodeChecksFeedback`): um contador permanente ao lado do enunciado
 * transforma o exercício em jogo de sobrevivência antes de a pessoa ter lido a
 * primeira linha.
 */
export function CodeAttemptsNotice({ spent, note }: { spent: number; note?: string }) {
  const { t } = useActivityI18n();
  const { remaining, exhausted } = attemptBudget(spent);
  const notice = attemptNotice(spent);

  return (
    <p
      className={`mt-2 flex items-center gap-2 text-xs sm:mt-3 ${
        exhausted ? 'text-clay' : 'text-muted-foreground'
      }`}
      data-testid="code-attempts"
      data-remaining={String(remaining)}
      data-budget={String(CODE_ATTEMPT_BUDGET)}
    >
      {exhausted ? (
        <HeartCrack className="h-4 w-4 shrink-0" />
      ) : (
        <Heart className="h-4 w-4 shrink-0" />
      )}
      <span>
        {t(notice.key, { count: notice.count })}
        {note ? ` · ${note}` : ''}
      </span>
    </p>
  );
}
