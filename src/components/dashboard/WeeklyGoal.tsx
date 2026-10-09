import { useI18n } from '@/i18n';
import { WEEKLY_GOAL } from '@/utils/trailDashboard';

const STEPS = 5;

export function WeeklyGoal({ done }: { done: number }) {
  const { t } = useI18n();
  const step = WEEKLY_GOAL / STEPS;

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-[#262320] bg-[#141210] px-6 py-[22px]" data-testid="weekly-goal">
      <h2 className="[font:700_26px_'Barlow_Condensed']">{t('dash.goal.title')}</h2>
      <span className="[font:400_15px_Inter] text-[#C9BFB0]">{t('dash.goal.body', { goal: WEEKLY_GOAL })}</span>
      <div className="flex gap-2">
        {Array.from({ length: STEPS }, (_, i) => {
          const reached = done >= (i + 1) * step;
          return (
            <span
              key={i}
              className={`box-border grid h-11 flex-1 place-items-center rounded-[10px] [font:700_14px_JetBrains_Mono] ${
                reached ? 'bg-[#0066FF] text-[#F4EDE2]' : 'border-2 border-dashed border-[#2E2A25] text-[#8A8276]'
              }`}
            >
              {reached ? '✓' : (i + 1) * step}
            </span>
          );
        })}
      </div>
      <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('dash.goal.progress', { done: Math.min(done, WEEKLY_GOAL), goal: WEEKLY_GOAL })} · {t('dash.goal.reward')}</span>
    </section>
  );
}
