import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n';
import type { TrailColor } from '@/types/trailDashboard';
import { LockGlyph } from './LockGlyph';
import { Stamp } from './Stamp';
import { passportSlots } from './slots';

export type PageVariant = 'active' | 'gold' | 'locked' | 'fresh';

interface Props {
  title: string;
  color: TrailColor;
  total: number;
  done: number;
  variant?: PageVariant;
  /** Rendered width in px; the height keeps the 3:4 ratio. */
  width?: number;
  /** 1-based slot whose stamp drops in (ceremony); the slot stays empty until then. */
  dropDay?: number | null;
  dropAfterMs?: number;
  /** Pulse the next empty slot. */
  pulseNext?: boolean;
  /** Text of the ribbon on a gold page. */
  ribbon?: string;
  className?: string;
}

const PAPER = { active: '#F4EDE2', fresh: '#F4EDE2', gold: '#F2C66D', locked: '#1C1916' } as const;

/** A 3:4 passport page drawn in code: accent header, zig-zag stamp slots, a counter and progress dashes. */
export function PassportPage({ title, color, total, done, variant = 'active', width = 300, dropDay = null, dropAfterMs, pulseNext, ribbon, className }: Props) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const gold = variant === 'gold';
  const locked = variant === 'locked';
  const stroke = gold ? '#B8913A' : locked ? '#3A342D' : '#C9BFB0';
  const ink = locked ? '#A0978A' : '#0A0908';
  const header = gold ? '#B8913A' : locked ? '#262320' : color.c;
  const headerInk = gold ? '#0A0908' : locked ? '#A0978A' : color.ink;
  const slots = passportSlots(total, done);
  const compact = width < 220;
  const dashes = Math.min(12, Math.max(1, total));
  const lit = Math.round((Math.min(done, total) / Math.max(1, total)) * dashes);
  const label = `${title}: ${t('passport.days', { done, total })}`;

  return (
    <svg
      viewBox="0 0 300 400"
      width={width}
      height={(width * 4) / 3}
      role="img"
      aria-label={label}
      data-testid="passport-page"
      data-variant={variant}
      className={`max-w-full shrink-0 ${className ?? ''}`}
      style={{ opacity: locked ? 0.7 : 1 }}
    >
      <rect width="300" height="400" rx="16" fill={PAPER[variant]} style={{ transition: reduce ? 'none' : 'fill 600ms ease' }} />
      <path d="M0 64V16a16 16 0 0 1 16-16h268a16 16 0 0 1 16 16v48z" fill={header} />
      <text x="20" y="24" fontFamily="'JetBrains Mono', monospace" fontWeight={700} fontSize="10" letterSpacing="1.5" fill={headerInk}>
        {t('passport.pageLabel')}
      </text>
      <text x="20" y="52" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize="28" fill={headerInk}>
        {title.length > 22 ? `${title.slice(0, 21)}…` : title}
      </text>
      <rect x="14" y="78" width="272" height="308" rx="8" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="4 4" />
      {gold && ribbon && (
        <motion.g initial={reduce ? false : { y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: reduce ? 0 : 0.5 }}>
          <rect x="60" y="92" width="180" height="26" rx="4" fill="#0A0908" />
          <text x="150" y="110" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight={700} fontSize="12" letterSpacing="3" fill="#F2C66D">
            {ribbon}
          </text>
        </motion.g>
      )}
      {locked ? (
        <g transform="translate(130 160) scale(2.5)" color="#A0978A">
          <LockGlyph size={16} />
        </g>
      ) : (
        <g transform={`translate(25 ${gold ? 150 : 140})`}>
          {slots.map((s) => {
            const dropping = dropDay === s.day;
            if (s.filled && !dropping) return <Stamp key={s.day} cx={s.cx} cy={s.cy} r={s.r} day={s.day} color={color} gold={gold} compact={compact} />;
            return (
              <g key={s.day}>
                <circle cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={stroke} strokeWidth="2" strokeDasharray="5 4" className={pulseNext && s.next ? 'dash-pulse' : undefined} />
                <text x={s.cx} y={s.cy + 4} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={Math.max(8, s.r * 0.4)} fill={stroke}>
                  {s.day}
                </text>
                {dropping && <Stamp cx={s.cx} cy={s.cy} r={s.r} day={s.day} color={color} dropAfterMs={dropAfterMs ?? 0} gold={gold} compact={compact} />}
              </g>
            );
          })}
        </g>
      )}
      {!locked && (
        <>
          <text x="150" y="330" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize="52" fill={ink} data-testid="passport-counter">
            {Math.min(done, total)}/{total}
          </text>
          <g transform={`translate(${150 - (dashes * 14) / 2} 346)`}>
            {Array.from({ length: dashes }, (_, i) => (
              <rect key={i} x={i * 14} width="10" height="5" rx="2" fill={i < lit ? (gold ? '#B8913A' : color.c) : stroke} />
            ))}
          </g>
        </>
      )}
      {locked && (
        <text x="150" y="330" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill={ink}>
          {t('passport.locked')}
        </text>
      )}
      <title>{label}</title>
    </svg>
  );
}
