import { useI18n } from '@/i18n';
import { FOCUS } from './courseStyles';

export function CoursesSkeleton() {
  return (
    <div className="flex flex-col gap-10" data-testid="courses-loading" aria-busy="true">
      <div className="h-[300px] animate-pulse rounded-[14px] bg-[#141210]" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[300px] animate-pulse rounded-[14px] bg-[#141210]" />
        ))}
      </div>
    </div>
  );
}

interface Props {
  kind: 'error' | 'empty' | 'filtered';
  onAction: () => void;
}

const BUTTON = `h-12 rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px] ${FOCUS}`;

export function CoursesState({ kind, onAction }: Props) {
  const { t } = useI18n();
  const copy = {
    error: { text: t('courses.error'), action: t('dash.retry'), id: 'courses-error' },
    empty: { text: t('courses.empty'), action: t('dash.empty.cta'), id: 'courses-empty' },
    filtered: { text: t('courses.emptyFilter'), action: t('courses.emptyFilterCta'), id: 'courses-filtered' },
  }[kind];
  return (
    <div className="flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8" data-testid={copy.id} role={kind === 'error' ? 'alert' : undefined}>
      <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{`> ${copy.text}`}</span>
      {(kind !== 'empty') && (
        <button type="button" onClick={onAction} className={BUTTON}>
          {copy.action}
        </button>
      )}
    </div>
  );
}
