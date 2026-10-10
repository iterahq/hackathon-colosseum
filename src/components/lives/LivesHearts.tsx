import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { HEART } from '@/components/shop/shopStyles';

interface Props {
  current: number;
  max: number;
  /** Heart edge in px. */
  size?: number;
  label: string;
  className?: string;
  'data-testid'?: string;
}

/** A gifted life above the maximum: one more heart, in gold. */
const BONUS = '#E8B84A';

/** A row of hearts: full ones warm, lost ones hollow. The row shakes once when a life goes. */
export function LivesHearts({ current, max, size = 16, label, className = '', 'data-testid': testId = 'lives-hearts' }: Props) {
  const reduced = useReducedMotion();
  const previous = useRef(current);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (current < previous.current) setShake((n) => n + 1);
    previous.current = current;
  }, [current]);

  return (
    <motion.span
      key={shake}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-lives={current}
      className={`inline-flex items-center gap-[3px] ${className}`}
      animate={shake > 0 && !reduced ? { x: [0, -5, 5, -4, 4, -2, 0] } : undefined}
      transition={{ duration: 0.42, ease: 'easeOut' }}
    >
      {Array.from({ length: max }, (_, i) => {
        const full = i < current;
        return (
          <Heart
            key={i}
            aria-hidden
            data-full={full}
            width={size}
            height={size}
            strokeWidth={2.25}
            style={full ? { color: HEART, fill: HEART } : { color: '#5E574E', fill: 'transparent' }}
          />
        );
      })}
      {current > max && <Heart aria-hidden data-full data-bonus width={size} height={size} strokeWidth={2.25} style={{ color: BONUS, fill: BONUS }} />}
    </motion.span>
  );
}
