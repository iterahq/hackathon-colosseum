import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { StudentCertification } from '@/types/endorsement';

const MAX = 3;
const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-evergreen px-5 text-sm font-medium text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:opacity-60';

interface Props {
  certification: StudentCertification;
  busy: boolean;
  disabled: boolean;
  onEndorse: () => void;
}

/** One learner certification in the instructor's list: who, which trail, how many endorsements, and the action. */
export function StudentCertificationRow({ certification: c, busy, disabled, onEndorse }: Props) {
  const { t } = useI18n();
  const full = c.endorsements >= MAX;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3" data-testid="student-certification" data-endorsed={c.endorsedByMe}>
      {c.imageUrl && <img src={c.imageUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-border" />}
      <div className="min-w-0 flex-1 basis-[180px]">
        <p className="truncate text-sm font-medium text-foreground">{c.learnerName ?? t('endorse.learner')}</p>
        <p className="truncate text-xs text-muted-foreground">
          {c.trail} · {c.daysDone}/{c.totalDays}
        </p>
        <Link to={`/c/${c.assetAddress}`} className="inline-flex min-h-6 items-center text-xs text-menta hover:underline">
          {t('endorse.count', { n: c.endorsements, max: MAX })} · {t('endorse.open')}
        </Link>
      </div>
      {c.endorsedByMe ? (
        <span className="inline-flex min-h-11 items-center text-sm font-medium text-menta" data-testid="student-endorsed">
          ✓ {t('endorse.done')}
        </span>
      ) : (
        <button type="button" disabled={disabled || busy || full} onClick={onEndorse} className={BUTTON} data-testid="student-endorse">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t(busy ? 'endorse.writing' : full ? 'endorse.full' : 'endorse.action')}
        </button>
      )}
    </li>
  );
}
