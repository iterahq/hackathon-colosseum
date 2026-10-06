import { motion } from 'framer-motion';
import { RotateCcw, XCircle } from 'lucide-react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { useActivityI18n } from '../context.js';
import { TeraVerdict, VerdictMark } from '../components/TeraVerdict.js';
import type { CodeCheckResult } from './types.js';
import { CodeAttemptsNotice } from './CodeAttemptsNotice.js';
import { CodeChecksList } from './CodeChecksList.js';

/**
 * The post-submit feedback screen for a graded code snack.
 *
 * Deliberately NOT a live checklist under the preview: while the learner edits,
 * the screen is just editor + preview (Tainan, 2026-07-23 — "não tem essa
 * checklist embaixo não, mais simples… quando ele submete, daí sim ele
 * visualiza"). Showing the verdicts continuously turns the exercise into a
 * hot/cold game and pulls attention away from the code.
 */
export function CodeChecksFeedback({
  checks,
  results,
  allPassed,
  settled = false,
  attemptsSpent = 0,
  outOfLives = false,
  onRetry,
  onContinue,
}: {
  checks: CodeCheck[];
  results: CodeCheckResult[];
  allPassed: boolean;
  /** The result was already reported upward — the actions are spent. */
  settled?: boolean;
  /** Envios errados já gastos, para o saldo de vidas. */
  attemptsSpent?: number;
  /** O orçamento acabou: este veredito é final e não há "tentar de novo". */
  outOfLives?: boolean;
  /** Unfreeze the editor and drop this verdict, keeping the learner's code. */
  onRetry: () => void;
  /** Settle the activity with the REAL result (passed or not). */
  onContinue: () => void;
}) {
  const { t } = useActivityI18n();
  const passedCount = results.filter((r) => r.passed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-4 rounded-2xl border p-4 md:p-5 ${
        allPassed ? 'border-menta/40 bg-menta/10' : 'border-clay/40 bg-clay/10'
      }`}
      role="status"
      aria-live="polite"
      data-testid="code-checks-feedback"
      data-all-passed={allPassed ? 'true' : 'false'}
      data-settled={settled ? 'true' : undefined}
      data-out-of-lives={outOfLives ? 'true' : undefined}
    >
      <div className="flex items-center gap-2">
        <TeraVerdict correct={allPassed} size="bar" />
        <VerdictMark correct={allPassed} />
        <p
          className={`font-display font-semibold ${allPassed ? 'text-menta' : 'text-clay'}`}
          data-testid="code-checks-title"
        >
          {allPassed
            ? t('code.checks.allPassed')
            : outOfLives
              ? t('code.lives.finalTitle')
              : t('code.checks.someFailed')}
        </p>
        <span className="ml-auto font-mono text-xs text-muted-foreground" data-testid="code-checks-score">
          {t('code.checks.score', { passed: String(passedCount), total: String(results.length) })}
        </span>
      </div>

      <CodeChecksList checks={checks} results={results} />

      {/* Sem gabarito para revelar — o editor aberto não tem resposta autorada
          nenhuma (ver `guided/guidedCode.ts` → `revealedValues`) — o que resta é
          dizer o que sobrou: as dicas dos checks que falharam ficam na tela e o
          caminho para a próxima atividade fica aberto. */}
      {outOfLives ? (
        <p className="mt-3 text-xs text-clay" data-testid="code-checks-out-of-lives">
          {t('code.lives.noAnswer')}
        </p>
      ) : (
        !settled && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="code-checks-frozen">
            {t('code.checks.frozen')}
          </p>
        )
      )}

      {!allPassed && <CodeAttemptsNotice spent={attemptsSpent} />}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {/* Always offered while the result is not yet reported — the editor is
            frozen from the submit onwards, so this explicit click is the ONLY
            way back in, including after a pass. Some no orçamento zerado: um
            botão cinza convida a clicar e a única resposta possível é o nada. */}
        {!outOfLives && (
        <button
          type="button"
          onClick={onRetry}
          disabled={settled}
          data-testid="code-checks-retry"
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            allPassed
              ? 'border border-border text-muted-foreground hover:text-foreground'
              : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          {allPassed ? t('code.checks.editAgain') : t('code.checks.retry')}
        </button>
        )}
        {/* SÓ no erro. No acerto o botão sumiu (Tainan, 17/08/2026): "enviar" já
            é o suficiente, e `useCodeSnack` reporta a tentativa na hora — um
            segundo clique sem escolha nenhuma só atrasava a turma.

            "Seguir mesmo assim" já foi live-only. Virou universal em 31/07/2026:
            no self-paced, um exercício que a pessoa não consegue resolver era um
            beco sem saída — só "tentar de novo", sem caminho para a próxima
            atividade. O que se registra continua sendo o resultado REAL
            (`onComplete(false)`), então seguir não vira acerto. */}
        {!allPassed && (
          <button
            type="button"
            onClick={onContinue}
            disabled={settled}
            data-testid="code-checks-continue"
            className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-6 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              outOfLives
                ? 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {outOfLives ? t('activity.continue') : t('code.checks.continueAnyway')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
