import { FOCUS } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';

export function CatalogSkeleton() {
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

export const STATE_BUTTON = `h-12 rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px] ${FOCUS}`;

type Kind = 'error' | 'empty' | 'filtered' | 'notFound';

const COPY: Record<Kind, { text: string; action: string | null; id: string }> = {
  error: { text: 'video.error', action: 'dash.retry', id: 'courses-error' },
  empty: { text: 'video.empty', action: null, id: 'courses-empty' },
  filtered: { text: 'video.emptyFilter', action: 'video.emptyFilterCta', id: 'courses-filtered' },
  notFound: { text: 'video.notFound', action: 'video.notFoundCta', id: 'course-not-found' },
};

export function VideoState({ kind, onAction }: { kind: Kind; onAction: () => void }) {
  const { t } = useI18n();
  const copy = COPY[kind];
  return (
    <div className="flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8" data-testid={copy.id} role={kind === 'error' ? 'alert' : undefined}>
      <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{`> ${t(copy.text)}`}</span>
      {copy.action && (
        <button type="button" onClick={onAction} className={STATE_BUTTON}>
          {t(copy.action)}
        </button>
      )}
    </div>
  );
}
