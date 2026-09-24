import { motion } from 'framer-motion';
import { BookOpen, Check, Lock } from 'lucide-react';
import { hexAlpha } from '@/utils/hexAlpha';
import { SkillTreeNodeLabel } from './SkillTreeNodeLabel';
import type { TreeNode } from '@/types/skillTree';
import type { UnitTone } from '@/types/unitTone';

const LOCKED_LINE = '#7D7568';

export function SkillTreePathNode({
  node,
  offset,
  title,
  kindLabel,
  tone,
  onClick,
}: {
  node: TreeNode;
  offset: 0 | 1;
  title: string;
  kindLabel: string;
  tone: UnitTone;
  onClick: () => void;
}) {
  const { state } = node;
  const interactive = state !== 'locked';
  const filled = state === 'done';

  return (
    <div className="flex flex-col items-center w-full">
      {/* node + its label, stacked & centered, with a modest left/right zigzag.
          The short connector lives INSIDE this offset wrapper so it stays
          centered on the node it leads into (the node zig-zags ±24px; a
          connector outside the wrapper would dangle off-centre). */}
      <div
        className="flex flex-col items-center"
        style={{ transform: offset ? 'translateX(24px)' : 'translateX(-24px)' }}
      >
        <div
          className="w-0.5 h-4"
          style={{ backgroundColor: state === 'locked' ? hexAlpha(LOCKED_LINE, 30) : hexAlpha(tone.base, 45) }}
        />
        <motion.button
          whileHover={interactive ? { scale: 1.06 } : undefined}
          whileTap={interactive ? { scale: 0.96 } : undefined}
          onClick={onClick}
          disabled={!interactive}
          data-testid={`tree-node-${state}`}
          aria-label={title}
          className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            state === 'locked' ? 'bg-card border border-border text-muted-foreground cursor-not-allowed' : ''
          }`}
          style={
            state === 'locked'
              ? undefined
              : {
                  backgroundColor: filled ? tone.base : tone.soft,
                  border: filled ? 'none' : `2px solid ${tone.base}`,
                  color: filled ? tone.onBase : tone.hi,
                }
          }
        >
          {state === 'done' ? (
            <Check className="w-7 h-7" strokeWidth={3} />
          ) : state === 'locked' ? (
            <Lock className="w-5 h-5" />
          ) : (
            <BookOpen className="w-6 h-6" />
          )}
        </motion.button>
        <SkillTreeNodeLabel title={title} kindLabel={kindLabel} state={state} />
      </div>
    </div>
  );
}
