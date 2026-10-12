import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TACTILE_CTA } from '@iterahq/activities';
import { usePassportSound } from '@/hooks/usePassportSound';
import { useI18n } from '@/i18n';
import type { CeremonyModel } from '@/utils/ceremony';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { CeremonyStatusRow } from './CeremonyStatusRow';
import { LearnerMascot } from '@/components/avatar/LearnerMascot';
import { Confetti } from './Confetti';
import { PassportPage } from './PassportPage';
import { useCeremonyClock } from './useCeremonyClock';

interface Props {
  model: CeremonyModel;
  /** The server has not answered yet: the page and Tera wait in the minting state and nothing is claimed. */
  preparing?: boolean;
  colorIndex: number;
  /** The lesson's own next/finish buttons, kept at the bottom and replaced by a muted "stamping" button until the ceremony resolves. */
  actions?: ReactNode;
  /** The chest of the day, drawn under the chain row once the stamp is confirmed on chain. It never holds the actions. */
  chest?: ReactNode;
  /** A chest row will follow the chain row: the page is drawn a little smaller on a short screen, so the way out stays in view. */
  compact?: boolean;
  /** Shown under the ceremony, inside its own scroll: the ceremony covers the whole screen, so anything outside it is never seen. */
  footer?: ReactNode;
  onRetry?: () => void;
  onLater?: () => void;
  onConnect?: () => void;
  /** The learner's equipped outfit (item key). */
  outfit?: string | null;
  /** False for an account with no wallet: nothing is written on Solana yet, so the copy says "saving", not "stamping". */
  hasWallet?: boolean;
}

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

/** Full-screen stamp ceremony of a finished day: the page lands, Tera stamps it, the chain row follows. */
export function StampCeremony({ model, preparing = false, colorIndex, actions, chest, compact = false, footer, onRetry, onLater, onConnect, outfit = null, hasWallet = true }: Props) {
  const { t } = useI18n();
  const reduce = Boolean(useReducedMotion());
  const sound = usePassportSound();
  const step = useCeremonyClock(reduce, 0, preparing);
  const prepared = useRef(preparing);
  if (preparing) prepared.current = true;
  const played = useRef(new Set<string>());
  const color = TRAIL_COLORS[colorIndex % TRAIL_COLORS.length];
  const { day, daysDone, totalDays } = model;
  const last = model.last && !preparing;
  const gold = last && step >= 5;
  const settled = step >= 6 && !preparing;
  // The way out opens only once the server answered and the stamp is down: a click before that would skip it.
  const locked = !settled || model.status === 'minting';
  const once = (key: string, fn: () => void) => {
    if (played.current.has(key)) return;
    played.current.add(key);
    fn();
  };

  useEffect(() => {
    if (step >= 3) once('submit', () => sound('submit', 0.5));
    if (step >= 4) once('tick', () => sound('click', 0.3));
    if (step >= 4 && !last) once('success', () => sound('success', 0.4));
    if (step >= 5 && last) once('celebration', () => sound('celebration', 0.5));
    if (step >= 6 && model.status === 'minted') once('chime', () => sound('chime', 0.4));
    if (step >= 6 && model.status === 'failed') once('error', () => sound('error', 0.3));
  });

  const headline = preparing
    ? t(hasWallet ? 'passport.ceremony.headline.preparing' : 'passport.ceremony.headline.saving', { n: day })
    : last
      ? t('passport.ceremony.headline.last')
      : t(hasWallet || model.status === 'minted' ? 'passport.ceremony.headline.day' : 'passport.ceremony.headline.dayDone', { n: day });
  const base = typeof window !== 'undefined' && window.innerWidth < 400 ? 260 : 300;
  const width = compact && typeof window !== 'undefined' && window.innerHeight < 980 ? base - 40 : base;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden text-[#F4EDE2]" style={GRID} role="dialog" aria-modal="true" aria-label={headline} data-testid="stamp-ceremony" data-step={step} data-phase={preparing ? 'preparing' : 'resolved'}>
      {last && step >= 5 && !reduce && <Confetti accent={color.c} />}
      <div className={`mx-auto flex w-full max-w-[480px] flex-col items-center gap-5 px-4 pb-8 pt-8 ${footer ? '' : 'min-h-full'}`}>
        <span className="[font:500_13px_JetBrains_Mono]" style={{ color: color.cl }}>
          {t('passport.ceremony.step', { n: day, total: Math.max(totalDays, day), trail: model.trailTitle })}
        </span>
        {/* Two lines of room: the page below does not move when the short "stamping" line becomes the long gold one. */}
        <h1 className="flex min-h-[72px] items-center text-center [font:700_36px/1_'Barlow_Condensed'] max-sm:min-h-[60px] max-sm:text-[30px]">{headline}</h1>
        <motion.div
          className="relative"
          initial={reduce ? false : { scale: 0.9, opacity: 0 }}
          animate={reduce || step < 3 ? { scale: 1, opacity: 1, x: 0 } : { scale: 1, opacity: 1, x: [0, -3, 3, -3, 3, 0] }}
          transition={reduce ? { duration: 0 } : step < 3 ? { duration: 0.3, ease: 'easeOut' } : { duration: 0.12 * 2, delay: 0.02 }}
        >
          <PassportPage
            title={model.trailTitle}
            color={color}
            total={Math.max(totalDays, daysDone)}
            done={step >= 4 ? daysDone : daysDone - 1}
            variant={gold ? 'gold' : 'active'}
            width={width}
            dropDay={reduce || step < 3 ? null : daysDone}
            dropAfterMs={0}
            ribbon={t('passport.ribbon')}
          />
          <motion.span
            data-testid="ceremony-tera"
            className="absolute -bottom-8 -left-6"
            initial={reduce ? false : { x: -40, opacity: 0 }}
            animate={step >= 2 ? { x: 0, opacity: 1 } : { x: -40, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
          >
            <LearnerMascot mood={step >= 3 ? 'happy' : 'neutral'} outfit={outfit} />
          </motion.span>
        </motion.div>
        <div className="mt-6 min-h-[110px] w-full">
          {(settled || prepared.current) && (
            <CeremonyStatusRow
              status={settled ? model.status : 'minting'}
              txSignature={model.txSignature}
              assetAddress={model.assetAddress}
              medals={settled ? model.newMedals : []}
              goldTrail={settled && last ? model.trailTitle : null}
              accent={color.c}
              accentDark={color.cd}
              locked={locked}
              onRetry={onRetry}
              onLater={onLater}
              onConnect={onConnect}
              hasWallet={hasWallet}
            />
          )}
        </div>
        {settled && model.status === 'minted' && chest}
        <div className="flex w-full flex-col items-stretch gap-2" data-testid="ceremony-actions" aria-disabled={locked}>
          {locked ? (
            <button type="button" disabled data-testid="ceremony-actions-waiting" className={`mt-6 flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full px-6 opacity-50 ${TACTILE_CTA}`}>
              {t(hasWallet ? 'passport.ceremony.stamping' : 'passport.ceremony.saving')}
            </button>
          ) : (
            actions
          )}
        </div>
        {!(last && !locked) && (
          <Link to="/passport" className="inline-flex min-h-[44px] items-center [font:500_13px_JetBrains_Mono] text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
            {t('passport.ceremony.seePassport')}
          </Link>
        )}
      </div>
      {footer && (
        <div className="mx-auto w-full max-w-[760px] px-4 pb-10" data-testid="ceremony-footer">
          {footer}
        </div>
      )}
    </div>
  );
}
