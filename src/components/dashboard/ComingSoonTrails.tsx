import { LockGlyph } from '@/components/passport/LockGlyph';
import { useI18n } from '@/i18n';
import type { SoonTrail } from '@/types/trailDashboard';
import { dayName, trailName } from '@/utils/trailDashboard';

interface Props {
  trails: SoonTrail[];
}

/** The trails that are announced and not open yet, grouped under their program: a name, its days, a lock. Nothing to press. */
export function ComingSoonTrails({ trails }: Props) {
  const { t, tText } = useI18n();
  if (trails.length === 0) return null;
  const programs = [...new Set(trails.map((trail) => tText(trail.programTitle)))];
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="soon-trails">
      {programs.map((program) => (
        <div key={program} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 [font:700_32px_'Barlow_Condensed']">{program}</h2>
            <span className="inline-flex min-h-[26px] items-center gap-1.5 rounded-full border border-[#3FD17F] bg-[#1C3A2A] px-3 [font:700_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#3FD17F]">
              {t('dash.soon.tag')}
            </span>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {trails
              .filter((trail) => tText(trail.programTitle) === program)
              .map((trail) => (
                <article
                  key={trail.id}
                  data-testid="soon-trail"
                  aria-disabled="true"
                  className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-[#262320] border-b-[4px] bg-[#141210] p-6 text-[#A0978A]"
                >
                  <span className="flex items-center gap-1.5 [font:500_12px_JetBrains_Mono]">
                    <LockGlyph size={13} />
                    {t('dash.soon.days', { count: trail.days.length })}
                  </span>
                  <h3 className="m-0 [font:700_36px/1_'Barlow_Condensed'] text-[#C9BFB0]">{tText(trailName(trail.title))}</h3>
                  <ol className="m-0 flex list-none flex-col gap-1.5 p-0 [font:400_13px_Inter]">
                    {trail.days.map((day, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="[font:500_12px_JetBrains_Mono] text-[#7D7568]">{String(index + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 truncate">{tText(dayName(day))}</span>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
