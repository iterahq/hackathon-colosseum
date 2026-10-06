import { motion } from 'framer-motion';
import { BookOpen, Check, Lock } from 'lucide-react';
import { hexAlpha } from '@/utils/hexAlpha';
import { NODE_LABEL_WIDTH, SkillTreeNodeLabel } from './SkillTreeNodeLabel';
import { darken } from './skillTreeUnitPalette';
import type { TreeNode } from '@/types/skillTree';
import type { UnitTone } from '@/types/unitTone';

const LOCKED_EDGE = '#050403';
const RING_TRACK = '#262320';
const RING_WIDTH = 5;
const RING_GAP = 9;
const EDGE_MARGIN = 4;

export function SkillTreePathNode({
  node,
  x,
  y,
  size,
  trailWidth,
  day,
  dayLabel,
  title,
  kindLabel,
  tone,
  primary,
  activitiesDone,
  activitiesTotal,
  reducedMotion,
  onClick,
}: {
  node: TreeNode;
  x: number;
  y: number;
  size: number;
  trailWidth: number;
  day: number;
  dayLabel: string;
  title: string;
  kindLabel: string;
  tone: UnitTone;
  primary: boolean;
  activitiesDone: number;
  activitiesTotal: number;
  reducedMotion: boolean;
  onClick: () => void;
}) {
  const { state } = node;
  const interactive = state !== 'locked';
  const done = state === 'done';
  const current = state === 'current';
  const showProgress = primary && activitiesTotal > 0;
  const percent = showProgress ? Math.round((activitiesDone / activitiesTotal) * 100) : 0;
  const ringSize = size + RING_GAP * 2;
  const labelShift = Math.max(
    EDGE_MARGIN,
    Math.min(trailWidth - EDGE_MARGIN - NODE_LABEL_WIDTH, x - NODE_LABEL_WIDTH / 2),
  ) - (x - NODE_LABEL_WIDTH / 2);

  return (
    <div
      className="absolute"
      data-primary={primary ? 'true' : undefined}
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
    >
      {showProgress && (
        <span
          aria-hidden="true"
          className="absolute rounded-full pointer-events-none"
          style={{
            left: -RING_GAP,
            top: -RING_GAP,
            width: ringSize,
            height: ringSize,
            background: `conic-gradient(${tone.base} ${percent}%, ${RING_TRACK} ${percent}%)`,
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_WIDTH}px), #000 calc(100% - ${RING_WIDTH - 1}px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_WIDTH}px), #000 calc(100% - ${RING_WIDTH - 1}px))`,
          }}
        />
      )}
      {primary && !reducedMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute rounded-full pointer-events-none"
          style={{ inset: -14, border: `2px solid ${tone.base}` }}
          initial={{ scale: 0.92, opacity: 0.8 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 2, ease: 'easeOut', repeat: Infinity }}
        />
      )}
      <motion.button
        whileHover={interactive && !reducedMotion ? { scale: 1.06 } : undefined}
        whileTap={interactive ? { y: 4, scale: 0.97 } : undefined}
        onClick={onClick}
        aria-disabled={interactive ? undefined : true}
        data-testid={`tree-node-${state}`}
        aria-label={title}
        className={`relative z-2 w-full h-full rounded-full flex flex-col items-center justify-center p-0 ${
          interactive ? 'cursor-pointer' : 'bg-card text-muted-foreground cursor-help'
        }`}
        style={
          interactive
            ? {
                backgroundColor: tone.base,
                color: tone.onBase,
                border: current ? `3px solid ${tone.hi}` : 'none',
                boxShadow: `0 7px 0 ${darken(tone.base, 45)}${current ? `, 0 0 36px ${hexAlpha(tone.base, 35)}` : ''}`,
              }
            : { border: `2px solid ${RING_TRACK}`, boxShadow: `0 7px 0 ${LOCKED_EDGE}` }
        }
      >
        {done ? (
          <Check className="w-8 h-8" strokeWidth={3} />
        ) : current ? (
          <BookOpen className={primary ? 'w-9 h-9' : 'w-7 h-7'} />
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 mb-0.5" />
            <span className="font-mono text-base font-semibold leading-none">{String(day).padStart(2, '0')}</span>
          </>
        )}
      </motion.button>
      <div
        className="absolute"
        style={{ top: size + 16, left: (size - NODE_LABEL_WIDTH) / 2 + labelShift }}
      >
        <SkillTreeNodeLabel
          dayLabel={dayLabel}
          title={title}
          kindLabel={kindLabel}
          state={state}
          primary={primary}
          showTitle={!primary}
          tone={tone}
        />
      </div>
    </div>
  );
}
