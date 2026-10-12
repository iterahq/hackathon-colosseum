import { RequirementChip } from '@/components/bounty/bountyUi';
import { missionSkills, skillPreview } from '@/components/bounty/bountySkills';
import { SkillBadge } from '@/components/skills/SkillBadge';
import { useI18n } from '@/i18n';
import { plural } from '@/utils/bounty';
import { ITERA_V2_GRAPH } from '../../../supabase/functions/_shared/capability-graph';
import type { SponsorTrail } from '@/types/bounty';

export interface SkillRequirement {
  program: string | null | undefined;
  trail: string;
  minDays: number;
}

/** A requirement as skills: the trail and its days in one small line, then up to `max` badges (two fit one line of a phone card) and a `+N`. */
export function MissionSkillRow({ requirement, max = 2 }: { requirement: SkillRequirement | null | undefined; max?: number }) {
  const { t, locale } = useI18n();
  if (!requirement) return null;
  const skills = missionSkills(requirement, locale);
  if (!skills) return <RequirementChip trail={requirement.trail} minDays={requirement.minDays} />;
  const { shown, more } = skillPreview(skills, max);
  return (
    <span className="flex min-w-0 max-w-full flex-col gap-1.5" data-testid="mission-skills" data-count={skills.length}>
      <span className="[font:600_10px/1.2_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]" data-testid="mission-skills-gate">
        {plural(t, 'bounty.req', requirement.minDays, { trail: requirement.trail })}
      </span>
      <span role="list" aria-label={t('bounty.skills.label')} className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map((skill) => (
          <span role="listitem" key={skill.id} className="inline-flex min-w-0 max-w-full">
            <SkillBadge claimId={skill.id} title={skill.title} hint={skill.hint} />
          </span>
        ))}
        {more > 0 && (
          <span role="listitem" className="inline-flex h-8 items-center rounded-full border border-[#2E2A25] px-2.5 [font:700_11px/1_JetBrains_Mono] text-[#A0978A]" title={skills.slice(0, more).map((skill) => skill.title).join(' · ')} data-testid="mission-skills-more">
            <span aria-hidden>+{more}</span>
            <span className="sr-only">{plural(t, 'bounty.skills.more', more)}</span>
          </span>
        )}
      </span>
    </span>
  );
}

/** In a post form: the skills the chosen trail and days ask for. Read-only; nothing is posted from it. Empty while the days are not a valid number for the trail. */
export function AskingForPreview({ trail, minDays }: { trail: Pick<SponsorTrail, 'title' | 'totalDays'> | undefined; minDays: number | null }) {
  const { t, locale } = useI18n();
  if (!trail || minDays === null || minDays < 1 || minDays > trail.totalDays) return null;
  const skills = missionSkills({ program: ITERA_V2_GRAPH.program, trail: trail.title.en || trail.title.pt, minDays }, locale);
  if (!skills) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3" data-testid="asking-for" data-count={skills.length}>
      <span className="[font:600_10px/1.2_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{t('bounty.skills.asking')}</span>
      <span role="list" aria-label={t('bounty.skills.label')} className="flex min-w-0 flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span role="listitem" key={skill.id} className="inline-flex min-w-0 max-w-full">
            <SkillBadge claimId={skill.id} title={skill.title} hint={skill.hint} />
          </span>
        ))}
      </span>
    </div>
  );
}
