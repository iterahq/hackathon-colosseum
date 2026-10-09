import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePassportSound } from '@/hooks/usePassportSound';
import { useI18n } from '@/i18n';
import type { CeremonyModel } from '@/utils/ceremony';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { CeremonyStatusRow } from './CeremonyStatusRow';
import { Confetti } from './Confetti';
import { PassportPage } from './PassportPage';
import { useCeremonyClock } from './useCeremonyClock';

interface Props {
  model: CeremonyModel;
  colorIndex: number;
  /** The lesson's own next/finish buttons, kept at the bottom. */
  actions?: ReactNode;
  onRetry?: () => void;
  onLater?: () => void;
  onConnect?: () => void;
}

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

/** Full-screen stamp ceremony of a finished day: the page lands, Tera stamps it, the chain row follows. */
export function StampCeremony({ model, colorIndex, actions, onRetry, onLater, onConnect }: Props) {
  const { t } = useI18n();
  const reduce = Boolean(useReducedMotion());
  const sound = usePassportSound();
  const step = useCeremonyClock(reduce, model.day);
  const [locked, setLocked] = useState(model.status === 'minting');
  const played = useRef(new Set<string>());
  const color = TRAIL_COLORS[colorIndex % TRAIL_COLORS.length];
  const { day, totalDays, last } = model;
  const gold = last && step >= 5;
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

  useEffect(() => {
    if (model.status !== 'minting') return setLocked(false);
    setLocked(true);
    const id = window.setTimeout(() => setLocked(false), 2000);
    return () => window.clearTimeout(id);
  }, [model.status]);

  const headline = last ? t('passport.ceremony.headline.last') : t('passport.ceremony.headline.day', { n: day });
  const width = typeof window !== 'undefined' && window.innerWidth < 400 ? 260 : 300;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden text-[#F4EDE2]" style={GRID} role="dialog" aria-modal="true" aria-label={headline} data-testid="stamp-ceremony" data-step={step}>
      {last && step >= 5 && !reduce && <Confetti accent={color.c} />}
      <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col items-center gap-5 px-4 pb-8 pt-8">
        <span className="[font:500_13px_JetBrains_Mono]" style={{ color: color.cl }}>
          {t('passport.ceremony.step', { n: day, total: totalDays, trail: model.trailTitle })}
        </span>
        <h1 className="text-center [font:700_36px/1_'Barlow_Condensed'] max-sm:text-[30px]">{headline}</h1>
        <motion.div
          className="relative"
          initial={reduce ? false : { scale: 0.9, opacity: 0 }}
          animate={reduce || step < 3 ? { scale: 1, opacity: 1, x: 0 } : { scale: 1, opacity: 1, x: [0, -3, 3, -3, 3, 0] }}
          transition={reduce ? { duration: 0 } : step < 3 ? { duration: 0.3, ease: 'easeOut' } : { duration: 0.12 * 2, delay: 0.02 }}
        >
          <PassportPage
            title={model.trailTitle}
            color={color}
            total={Math.max(totalDays, day)}
            done={step >= 4 ? day : day - 1}
            variant={gold ? 'gold' : 'active'}
            width={width}
            dropDay={reduce ? null : day}
            dropAfterMs={600}
            ribbon={t('passport.ribbon')}
          />
          <motion.img
            src={step >= 3 ? '/mascot/tera-happy.webp' : '/mascot/tera-neutral.webp'}
            alt=""
            width={96}
            height={96}
            data-testid="ceremony-tera"
            className="absolute -bottom-8 -left-6 h-24 w-24 object-contain"
            initial={reduce ? false : { x: -40, opacity: 0 }}
            animate={step >= 2 ? { x: 0, opacity: 1 } : { x: -40, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
          />
          <span className="absolute -bottom-6 -right-4 flex gap-2" data-testid="ceremony-medals">
            {step >= 6 &&
              model.newMedals.map((m, i) => (
                <motion.span
                  key={m.key}
                  role="img"
                  aria-label={m.title}
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : i * 0.15 }}
                  className="box-border grid h-14 w-14 -rotate-6 place-items-center rounded-full border-b-[5px] [font:700_13px_JetBrains_Mono] text-[#0A0908]"
                  style={{ background: color.c, borderBottomColor: color.cd }}
                >
                  {m.glyph}
                </motion.span>
              ))}
          </span>
        </motion.div>
        <div className="mt-6 min-h-[110px] w-full">
          {step >= 6 && (
            <CeremonyStatusRow
              status={model.status}
              txSignature={model.txSignature}
              assetAddress={model.assetAddress}
              medalTitles={model.newMedals.map((m) => m.title)}
              locked={locked}
              onRetry={onRetry}
              onLater={onLater}
              onConnect={onConnect}
            />
          )}
        </div>
        <div className="flex w-full flex-col items-stretch gap-2" aria-disabled={locked} {...(locked ? ({ inert: '' } as object) : {})} style={{ opacity: locked ? 0.5 : 1 }}>
          {actions}
        </div>
        <Link to="/passport" className="inline-flex min-h-[44px] items-center [font:500_13px_JetBrains_Mono] text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('passport.ceremony.seePassport')}
        </Link>
      </div>
    </div>
  );
}
