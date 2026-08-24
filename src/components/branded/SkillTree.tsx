/**
 * Course-detail skill-tree — Duolingo-style vertical path, parity with João
 * Pedro's course design. Tainan asked for this to be 100% identical to his,
 * EXCEPT the points/heart/fire badges (dropped).
 *
 * Mapping to our real data:
 *   Program → Units (= "feature branch" sections) → Lessons (= path nodes).
 *   A lesson node is `done` when all its activities are done, `current` when it
 *   is the first not-yet-complete node of ITS UNIT, otherwise `locked`. Clicking
 *   an unlocked node opens the lesson player. Locked nodes are non-interactive.
 */
import { motion } from 'framer-motion';
import { BookOpen, Check, Lock, Flag, GitBranch, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { buildSections } from '@/utils/buildSections';
import type { ProgramDetail, Lesson, ActivityKind } from '@/types/content';
import type { NodeState, TreeNode } from '@/types/skillTree';

/**
 * Representative activity kind for the eyebrow shown under a node. There is no
 * lesson-level kind in the model, so we use the first activity's kind. Falls
 * back to `document` when a lesson has no activities yet.
 */
function lessonKind(lesson: Lesson): ActivityKind {
  return lesson.activities?.[0]?.kind ?? 'document';
}

export function SkillTree({
  program,
  onOpenLesson,
}: {
  program: ProgramDetail;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { t, tText } = useI18n();
  const sections = buildSections(program);

  const totalLessons = sections.reduce((n, s) => n + s.total, 0);

  return (
    <div className="relative" data-testid="skill-tree">
      {/* JOURNEY header */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 mb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-evergreen-hi flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" /> {t('journey.title')}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> {totalLessons} {t('label.lessons').toLowerCase()}
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> {t('journey.badge')}
          </span>
        </span>
      </div>

      {/* Base camp */}
      <div className="flex justify-center mb-2">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-card font-mono text-xs text-muted-foreground">
          <Flag className="w-3.5 h-3.5 text-evergreen-hi" /> {t('journey.basecamp')}
        </span>
      </div>

      {sections.map((section) => (
        <div key={section.unit.id} className="relative">
          {/* Feature-branch section header */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4 my-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-evergreen-soft border border-evergreen/30 text-evergreen-hi font-display font-bold flex items-center justify-center">
                {section.index + 1}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3" /> {t('label.unit')}
                </div>
                <div className="font-display font-semibold truncate">{tText(section.unit.title)}</div>
              </div>
              <span className="ml-auto font-mono text-xs text-muted-foreground whitespace-nowrap">
                {section.doneCount}/{section.total} {t('label.lessons').toLowerCase()}
              </span>
            </div>
          </div>

          {/* Vertical node path */}
          <div className="flex flex-col items-center">
            {section.nodes.map((node, ni) => (
              <PathNode
                key={node.lesson.id}
                node={node}
                offset={ni % 2 === 0 ? 0 : 1}
                title={tText(node.lesson.title)}
                kindLabel={t(`activity.${lessonKind(node.lesson)}`)}
                onClick={() => node.state !== 'locked' && onOpenLesson(node.lesson.id)}
              />
            ))}
            {section.nodes.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{t('home.emptyHint')}</p>
            )}
          </div>
        </div>
      ))}

      {/* Summit badge */}
      <div className="flex flex-col items-center mt-4">
        <div className="w-0.5 h-8 bg-border" />
        <div className="flex flex-col items-center gap-2 mt-2">
          <div className="w-16 h-16 rounded-2xl bg-evergreen-soft border border-evergreen/30 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-evergreen-hi" />
          </div>
          <span className="font-display font-semibold text-sm">{t('journey.summit')}</span>
        </div>
      </div>
    </div>
  );
}

function PathNode({
  node,
  offset,
  title,
  kindLabel,
  onClick,
}: {
  node: TreeNode;
  offset: 0 | 1;
  title: string;
  kindLabel: string;
  onClick: () => void;
}) {
  const { state } = node;
  const interactive = state !== 'locked';

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
        {/* short connector above the node, centred on the node */}
        <div className="w-0.5 h-4 bg-border" />
        <motion.button
          whileHover={interactive ? { scale: 1.06 } : undefined}
          whileTap={interactive ? { scale: 0.96 } : undefined}
          onClick={onClick}
          disabled={!interactive}
          data-testid={`tree-node-${state}`}
          aria-label={title}
          className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            state === 'done'
              ? 'bg-evergreen text-obsidiana'
              : state === 'current'
                ? 'bg-evergreen-soft border-2 border-evergreen text-evergreen-hi'
                : 'bg-card border border-border text-muted-foreground cursor-not-allowed'
          }`}
        >
          {state === 'done' ? (
            <Check className="w-7 h-7" strokeWidth={3} />
          ) : state === 'locked' ? (
            <Lock className="w-5 h-5" />
          ) : (
            <BookOpen className="w-6 h-6" />
          )}
        </motion.button>
        <NodeLabel title={title} kindLabel={kindLabel} state={state} />
      </div>
    </div>
  );
}

function NodeLabel({
  title,
  kindLabel,
  state,
}: {
  title: string;
  kindLabel: string;
  state: NodeState;
}) {
  return (
    <div className="mt-1.5 flex flex-col items-center text-center max-w-[160px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
        {kindLabel}
      </span>
      <span
        className={`mt-0.5 text-xs font-medium leading-tight line-clamp-2 ${
          state === 'locked' ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {title}
      </span>
    </div>
  );
}
