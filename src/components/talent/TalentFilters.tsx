import { INPUT, LABEL } from '@/components/bounty/bountyUi';
import { BTN_TEXT } from '@/components/shop/shopStyles';
import { SkillBadge } from '@/components/skills/SkillBadge';
import { skillIcon } from '@/components/skills/skillIcon';
import { skillShortTitle } from '@/components/skills/skillLabels';
import { useI18n } from '@/i18n';
import type { TalentCapability, TalentFilters as Filters } from '@/types/talent';
import { TALENT_TRAILS, inTrail, type TalentTrail } from './talentSkills';

const DAY_CHOICES = [1, 3, 5, 10];
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]';
const TRAIL_LABEL: Record<TalentTrail, string> = { html: 'HTML', css: 'CSS', js: 'JS' };
const TAB = `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 [font:700_13px/1_JetBrains_Mono] transition-colors ${FOCUS}`;
const TAB_ON = 'border-[#3FD17F] bg-[#3FD17F]/10 text-[#3FD17F] shadow-[0_0_14px_rgba(63,209,127,.25)]';
const TAB_OFF = 'border-[#2E2A25] bg-[#141210] text-[#C9BFB0] hover:border-[#3a352f] hover:text-[#F4EDE2]';

interface Props {
  filters: Filters;
  trail: TalentTrail | '';
  capabilities: TalentCapability[];
  onChange: (next: Filters, trail: TalentTrail | '') => void;
}

export function TalentFilters({ filters, trail, capabilities, onChange }: Props) {
  const { t, locale } = useI18n();
  const active = filters.capability !== '' || filters.minDays > 0 || trail !== '';
  const skills = inTrail(capabilities, trail);
  const known = capabilities.some((entry) => entry.key === filters.capability);
  return (
    <form className="flex flex-col gap-3" aria-label={t('talent.filters.aria')} onSubmit={(event) => event.preventDefault()} data-testid="talent-filters">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('talent.filters.trail')} data-testid="talent-filter-trails">
        <button type="button" className={`${TAB} ${trail === '' ? TAB_ON : TAB_OFF}`} aria-pressed={trail === ''} onClick={() => onChange(filters, '')} data-testid="talent-filter-trail" data-trail="">
          {t('talent.filters.trail.any')}
        </button>
        {TALENT_TRAILS.map((entry) => {
          const Icon = skillIcon(`${entry}-`, 'neutral');
          return (
            <button key={entry} type="button" className={`${TAB} ${trail === entry ? TAB_ON : TAB_OFF}`} aria-pressed={trail === entry} onClick={() => onChange({ ...filters, capability: '' }, trail === entry ? '' : entry)} data-testid="talent-filter-trail" data-trail={entry}>
              <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.4} />
              {TRAIL_LABEL[entry]}
            </button>
          );
        })}
        <label className="ml-auto flex min-w-0 items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5">
          <span className={`${LABEL} shrink-0`}>{t('talent.filters.minDays')}</span>
          <select className={`${INPUT} sm:w-[210px]`} value={filters.minDays} onChange={(event) => onChange({ ...filters, minDays: Number(event.target.value) }, trail)} data-testid="talent-filter-days">
            <option value={0}>{t('talent.filters.minDays.any')}</option>
            {DAY_CHOICES.map((n) => (
              <option key={n} value={n}>{t('talent.filters.minDays.n', { n })}</option>
            ))}
          </select>
        </label>
      </div>
      {(skills.length > 0 || (filters.capability !== '' && !known)) && (
        <ul className="flex flex-wrap items-center gap-x-1.5 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]" aria-label={t('talent.filters.capability')} data-testid="talent-filter-capability">
          {filters.capability !== '' && !known && (
            <li>
              <button type="button" aria-pressed className={`inline-flex min-h-11 items-center rounded-full ${FOCUS}`} onClick={() => onChange({ ...filters, capability: '' }, trail)} data-testid="talent-filter-skill" data-skill={filters.capability}>
                <SkillBadge claimId={filters.capability} title={skillShortTitle(filters.capability, locale, filters.capability)} state="lit" />
              </button>
            </li>
          )}
          {skills.map((entry) => {
            const on = filters.capability === entry.key;
            return (
              <li key={entry.key} className="min-w-0 max-w-full max-sm:shrink-0">
                <button type="button" aria-pressed={on} aria-label={t('talent.filters.skill', { title: entry.title })} className={`inline-flex min-h-11 max-w-full items-center rounded-full ${FOCUS}`} onClick={() => onChange({ ...filters, capability: on ? '' : entry.key }, trail)} data-testid="talent-filter-skill" data-skill={entry.key}>
                  <SkillBadge claimId={entry.key} title={skillShortTitle(entry.key, locale, entry.title)} hint={entry.title} state={on ? 'lit' : 'neutral'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {active && (
        <button type="button" className={`${BTN_TEXT} self-start`} onClick={() => onChange({ capability: '', minDays: 0 }, '')} data-testid="talent-filter-clear">
          {t('talent.filters.clear')}
        </button>
      )}
    </form>
  );
}
