import { RotateCcw } from 'lucide-react';
import { t, type I18n, type Locale, type Quality } from '@iterahq/activity-spec/runtime';

// Standardized rating options (Tainan 2026-07): TEXT LABELS ONLY — no emoji.
// The two buttons are visually IDENTICAL (neutral, MultiChoice-option style)
// until the learner picks, so neither valence is telegraphed as "the right
// judgment" (the exercise IS the judgment). The correctness color (green/red)
// lands only AFTER the pick is graded against the canned verdict.
const RATINGS: { q: Quality; label: I18n }[] = [
  { q: 'ruim', label: { pt: 'fraca', en: 'weak' } },
  { q: 'top', label: { pt: 'forte', en: 'strong' } },
];

const DEFAULT_CRITIQUE: I18n = {
  pt: 'Olha de novo o que a resposta entregou de verdade.',
  en: 'Look again at what the answer really delivered.',
};

/**
 * The "avaliar" turn: the learner rates the last answer (fraca / forte).
 * A correct rating advances; a wrong one is rejected with the canned
 * critique + a retry, so the student re-judges instead of coasting through.
 */
export function SandboxEvalPanel({
  locale,
  picked,
  wrong,
  critique,
  onRate,
  onRetry,
}: {
  locale: Locale;
  picked?: Quality;
  wrong: boolean;
  critique?: I18n;
  onRate: (q: Quality) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="sandbox-eval">
      <div className="flex flex-wrap gap-2.5">
        {RATINGS.map((r) => {
          // A pick is graded synchronously (canned verdict), so `picked` implies
          // the verdict is known: picked + wrong → red, picked + right → green.
          // Unpicked buttons stay neutral (the MultiChoice-option look).
          const active = picked === r.q;
          const verdict = active ? (wrong ? 'incorrect' : 'correct') : 'neutral';
          return (
            <button
              key={r.q}
              type="button"
              disabled={wrong}
              onClick={() => onRate(r.q)}
              data-testid={`sandbox-rate-${r.q}`}
              data-state={verdict}
              className={`flex flex-1 basis-24 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                verdict === 'correct'
                  ? 'border-verde-tech bg-verde-tech/10 text-menta'
                  : verdict === 'incorrect'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border bg-card text-foreground hover:border-verde-tech/50'
              }`}
            >
              {t(r.label, locale)}
            </button>
          );
        })}
      </div>
      {wrong && (
        <div className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4" data-testid="sandbox-eval-wrong">
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-destructive">
              {t({ pt: 'Não foi essa. Repara:', en: 'Not quite. Look:' }, locale)}
            </div>
            <p className="text-sm leading-relaxed text-foreground">{t(critique ?? DEFAULT_CRITIQUE, locale)}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            data-testid="sandbox-eval-retry"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-evergreen px-5 py-2.5 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
          >
            <RotateCcw className="h-4 w-4" /> {t({ pt: 'Tentar de novo', en: 'Try again' }, locale)}
          </button>
        </div>
      )}
    </div>
  );
}
