/** judge_each controls — label one generated option good or bad. */
import type { Verdict } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';

const VERDICTS: Verdict[] = ['good', 'bad'];

export function ByocVerdictButtons({
  given,
  expected,
  disabled,
  onPick,
}: {
  given?: Verdict;
  /** The answer key, shown once the round is over so an unanswered option still teaches. */
  expected?: Verdict;
  disabled: boolean;
  onPick: (verdict: Verdict) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-3 flex gap-2">
      {VERDICTS.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onPick(v)}
          data-testid={`byoc-verdict-${v}`}
          data-active={given === v ? 'true' : undefined}
          data-expected={expected === v ? 'true' : undefined}
          className={`h-9 px-4 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 ${
            given === v
              ? 'border-menta bg-menta/15 text-menta'
              : expected === v
                ? 'border-verde-tech bg-verde-tech/10 text-verde-tech'
                : 'border-border bg-card hover:border-evergreen/50'
          }`}
        >
          {t(v === 'good' ? 'byoc.good' : 'byoc.bad')}
        </button>
      ))}
    </div>
  );
}
