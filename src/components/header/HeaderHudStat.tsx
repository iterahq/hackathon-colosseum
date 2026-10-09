import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { HeaderIconName } from '@/consts/headerIconPaths';
import { HeaderIcon } from './HeaderIcon';

interface Props {
  icon: HeaderIconName;
  tone: string;
  value: number | null;
  /** Small mono caption after the number; hidden on phones. */
  unit?: ReactNode;
  /** Accessible sentence for the whole cell. */
  label: string;
  dim?: boolean;
  children?: ReactNode;
  className?: string;
}

/** One HUD cell: a tinted glyph, a counter that slides in when the number changes, an optional caption. */
export function HeaderHudStat({ icon, tone, value, unit, label, dim, children, className = '' }: Props) {
  const reduced = !!useReducedMotion();
  const text = value == null ? '–' : String(value);

  return (
    <span className={`flex items-center gap-1.5 px-2.5 sm:px-3 ${className}`} role="img" aria-label={label} title={label}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center ${dim ? 'text-[#5E574E]' : ''}`} style={dim ? undefined : { color: tone }}>
        <HeaderIcon name={icon} size={18} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={text}
              initial={reduced ? false : { y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: -10, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`[font:700_16px_JetBrains_Mono] tabular-nums ${dim ? 'text-[#8A8276]' : 'text-[#F4EDE2]'}`}
            >
              {text}
            </motion.span>
          </AnimatePresence>
          {unit && <span className="[font:500_10px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] max-sm:hidden">{unit}</span>}
        </span>
        {children}
      </span>
    </span>
  );
}
