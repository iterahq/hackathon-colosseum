import { useI18n } from '@/i18n';
import { HomeLiveBlocks } from '@/components/live/HomeLiveBlocks';
import { useActiveLiveClass, useNextScheduledClass } from '@/hooks/useLiveClass';

export function LiveClassesCard({ describeLesson }: { describeLesson: (lessonId: string) => string | null }) {
  const { t } = useI18n();
  const { data: active } = useActiveLiveClass();
  const { data: scheduled } = useNextScheduledClass();

  if (!active && !scheduled) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-[#262320] bg-[#141210] px-6 py-[22px]" data-testid="live-classes">
      <h2 className="[font:700_26px_'Barlow_Condensed']">{t('dash.live.title')}</h2>
      <HomeLiveBlocks describeLesson={describeLesson} />
    </section>
  );
}
