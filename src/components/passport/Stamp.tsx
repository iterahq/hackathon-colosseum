import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n';
import type { TrailColor } from '@/types/trailDashboard';

interface Props {
  cx: number;
  cy: number;
  r: number;
  day: number;
  color: TrailColor;
  /** Drop the stamp in with this delay (ms) instead of showing it already placed. */
  dropAfterMs?: number;
  gold?: boolean;
}

const TILT = -8;

/** One stamped slot: a tilted accent disc with the day and Tera's face. */
export function Stamp({ cx, cy, r, day, color, dropAfterMs, gold }: Props) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const drop = dropAfterMs != null && !reduce;
  const fill = gold ? '#B8913A' : color.c;
  const ring = gold ? '#0A0908' : color.cd;
  const ink = gold ? '#F2C66D' : color.ink;
  const face = Math.min(12, r * 0.46);
  const clip = `stamp-face-${day}-${Math.round(cx)}`;

  return (
    <motion.g
      data-testid="passport-stamp"
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      initial={drop ? { scale: 2.2, opacity: 0, rotate: -20 } : { scale: 1, opacity: 1, rotate: TILT }}
      animate={{ scale: 1, opacity: 1, rotate: TILT }}
      transition={drop ? { delay: (dropAfterMs ?? 0) / 1000, duration: 0.22, ease: [0.2, 0.9, 0.3, 1.3] } : { duration: 0 }}
    >
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={ring} strokeWidth={2} />
      {r >= 14 ? (
        <>
          <text x={cx} y={cy - r * 0.18} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight={700} fontSize={r * 0.34} fill={ink}>
            {t('passport.stamp.day', { n: day })}
          </text>
          <clipPath id={clip}>
            <circle cx={cx} cy={cy + r * 0.38} r={face} />
          </clipPath>
          <image href="/mascot/tera-happy.webp" x={cx - face} y={cy + r * 0.38 - face} width={face * 2} height={face * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <path d={`M${cx - r * 0.4} ${cy} l${r * 0.3} ${r * 0.3} l${r * 0.5} -${r * 0.6}`} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      )}
    </motion.g>
  );
}
