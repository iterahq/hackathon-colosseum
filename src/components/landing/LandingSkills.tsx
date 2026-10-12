import { SkillBadge } from '@/components/skills/SkillBadge';
import { skillShortTitle } from '@/components/skills/skillLabels';
import { useI18n } from '@/i18n';
import { ITERA_V2_GRAPH } from '../../../supabase/functions/_shared/capability-graph';

const PROVEN = ['html-tags', 'html-form', 'css-flex-row', 'js-events'] as const;
const GATE = 'html-form';

const claimOf = (id: string) => ITERA_V2_GRAPH.claims.find((claim) => claim.id === id);

/** Examples from the capability graph, not anybody's record: what a proven skill looks like, and a skill going from locked to stamped. */
export function LandingSkills({ kind }: { kind: 'proven' | 'gate' }) {
  const { t, locale } = useI18n();
  const badge = (id: string, state: 'lit' | 'locked', key: string) => {
    const claim = claimOf(id);
    if (!claim) return null;
    const hint = claim.title[locale] ?? claim.title.en;
    return <SkillBadge key={key} claimId={id} title={skillShortTitle(id, locale, hint)} hint={hint} state={state} stateLabel={t(`landing.skill.${state}`)} />;
  };
  if (kind === 'gate') {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="img" aria-label={t('landing.step.earn.gate')} data-testid="landing-skill-gate">
        {badge(GATE, 'locked', 'locked')}
        <span aria-hidden className="[font:700_13px_JetBrains_Mono] text-[#5E574E]">→</span>
        {badge(GATE, 'lit', 'lit')}
      </div>
    );
  }
  return (
    <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label={t('landing.step.prove.skills')} data-testid="landing-skill-row">
      {PROVEN.map((id) => (
        <li key={id} className="inline-flex min-w-0 max-w-full">{badge(id, 'lit', id)}</li>
      ))}
    </ul>
  );
}
