import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LINK, RequirementChip } from '@/components/bounty/bountyUi';
import { missionSkills, skillState } from '@/components/bounty/bountySkills';
import { judgedDays, questDays, type QuestDay } from '@/components/bounty/questState';
import { SkillBadge } from '@/components/skills/SkillBadge';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useBountySession, useMyBountyStatus } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { plural } from '@/utils/bounty';
import type { BountyDetail } from '@/types/bounty';

const RING = 2 * Math.PI * 26;

function ProgressRing({ done, min, ready }: { done: number | null; min: number; ready: boolean }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const judged = done !== null;
  const counted = judged ? Math.min(done, min) : 0;
  const offset = RING * (1 - counted / min);
  return (
    <div
      role="img"
      aria-label={judged ? plural(t, 'bounty.quest.ring', min, { done: counted }) : plural(t, 'bounty.sponsor.proofDays', min)}
      className="relative grid h-[68px] w-[68px] shrink-0 place-items-center"
      data-testid="quest-ring"
      data-done={judged ? counted : undefined}
      data-min={min}
    >
      <svg viewBox="0 0 64 64" className={`h-full w-full -rotate-90 ${ready ? 'drop-shadow-[0_0_10px_rgba(63,209,127,.55)]' : ''}`} aria-hidden>
        <circle cx="32" cy="32" r="26" fill="none" stroke={judged ? '#2E2A25' : '#F2C66D'} strokeOpacity={judged ? 1 : 0.45} strokeWidth="6" strokeDasharray={judged ? undefined : '3 5'} />
        {judged && counted > 0 && (
          <motion.circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="#3FD17F"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING}
            initial={reduced ? false : { strokeDashoffset: RING }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="flex flex-col items-center leading-none">
          <span className={`[font:700_22px/1_'Barlow_Condensed'] ${ready ? 'text-[#3FD17F]' : judged ? 'text-[#F4EDE2]' : 'text-[#F2C66D]'}`}>{judged ? `${counted}/${min}` : min}</span>
          <span className="mt-0.5 [font:600_8px/1_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{plural(t, 'bounty.quest.days', min)}</span>
        </span>
      </span>
    </div>
  );
}

const DAY_TONE: Record<QuestDay['state'], string> = {
  done: 'border-[#3FD17F]/40 bg-[#3FD17F]/[.06]',
  next: 'border-[#F2C66D]/70 bg-[#F2C66D]/[.06]',
  locked: 'border-[#262320] bg-[#0A0908]',
  neutral: 'border-[#262320] bg-[#0A0908]',
};
const DAY_LABEL: Record<QuestDay['state'], string> = { done: 'text-[#3FD17F]', next: 'text-[#F2C66D]', locked: 'text-[#A0978A]', neutral: 'text-[#A0978A]' };

function DayGroup({ entry, daysDone, ready, offset }: { entry: QuestDay; daysDone: number | null; ready: boolean; offset: number }) {
  const { t } = useI18n();
  return (
    <li className={`flex min-w-0 flex-col items-center gap-2 rounded-[12px] border px-2 pb-2.5 pt-2 ${DAY_TONE[entry.state]}`} data-testid="quest-day" data-day={entry.day} data-state={entry.state}>
      <span className={`inline-flex items-center gap-1 [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.1em] ${DAY_LABEL[entry.state]}`}>
        {entry.state === 'done' && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
        {entry.state === 'locked' && <Lock aria-hidden className="h-2.5 w-2.5" strokeWidth={3} />}
        {t('bounty.quest.day', { n: entry.day })}
        {entry.state === 'next' && <span className="rounded-full bg-[#F2C66D] px-1.5 py-0.5 text-[9px] text-[#0A0908]">{t('bounty.quest.next')}</span>}
      </span>
      <span className="flex justify-center gap-1">
        {entry.skills.map((skill, index) => {
          const state = skillState(skill, daysDone);
          return (
            <SkillBadge
              key={skill.id}
              claimId={skill.id}
              title={skill.title}
              hint={skill.hint}
              size="md"
              state={state}
              stateLabel={state === 'neutral' ? undefined : t(`bounty.quest.state.${state}`)}
              animate={ready}
              index={offset + index}
            />
          );
        })}
      </span>
    </li>
  );
}

/** The requirement of a bounty as a quest: the skills by day, lit up to the stamped days the gate read for this wallet. */
export function SkillQuestCard({ bounty }: { bounty: BountyDetail }) {
  const { t, locale } = useI18n();
  const { signedIn } = useBountySession();
  const mine = useMyBountyStatus(bounty.id);
  const status = signedIn && mine.isSuccess ? mine.data : null;
  const { requirement } = bounty;
  const skills = missionSkills(requirement, locale);
  const daysDone = judgedDays(bounty, status);
  const ready = daysDone !== null && Boolean(status?.eligible) && daysDone >= requirement.minDays;
  const days = skills ? questDays(skills, daysDone) : [];
  const checker = bounty.escrow?.daysCheckedBy === 'program' ? 'program' : 'server';
  let offset = 0;

  return (
    <section
      className={`${CARD} flex flex-col gap-4 p-4 transition-colors sm:p-5 ${ready ? '!border-[#3FD17F] shadow-[0_0_28px_rgba(63,209,127,.14)]' : ''}`}
      aria-labelledby="quest-title"
      data-testid="skill-quest"
      data-state={daysDone === null ? 'neutral' : ready ? 'ready' : 'locked'}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span id="quest-title" className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.skills.label')}</span>
            {ready && (
              <span className={`inline-flex items-center gap-1 rounded-full bg-[#3FD17F] px-2 py-0.5 ${MONO_LABEL} text-[#0A0908]`} data-testid="quest-ready">
                <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                {t('bounty.quest.ready')}
              </span>
            )}
          </span>
          <span className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]">{requirement.trail}</span>
        </div>
        <ProgressRing done={daysDone} min={requirement.minDays} ready={ready} />
      </div>
      {skills ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="quest-days">
          {days.map((entry) => {
            const start = offset;
            offset += entry.skills.length;
            return <DayGroup key={entry.day} entry={entry} daysDone={daysDone} ready={ready} offset={start} />;
          })}
        </ul>
      ) : (
        <RequirementChip trail={requirement.trail} minDays={requirement.minDays} />
      )}
      <p className="flex flex-wrap items-center gap-x-3 [font:500_12px/1.5_JetBrains_Mono] text-[#A0978A]" data-testid="quest-gate">
        <span>{plural(t, `bounty.quest.gate.${checker}`, requirement.minDays)}</span>
        <Link to="/verify#gate" className={LINK}>{t('bounty.quest.gateLink')} →</Link>
      </p>
    </section>
  );
}
