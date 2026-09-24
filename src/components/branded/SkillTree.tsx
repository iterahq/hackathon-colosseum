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
 *
 * Each unit is a WEEK (Tainan: the first course ships in weekly units, one
 * launch per week) and gets its own color from `toneForUnit`, promoted from
 * the designer's playground ("per unit" strategy in
 * `design-playground/CoursePathColorLab.stories.tsx`) — it is the color, not
 * just the icon, that tells a learner they moved into a new section.
 */
import { BookOpen, Flag, GitBranch, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { buildSections } from '@/utils/buildSections';
import { toneForUnit } from './skillTreeUnitPalette';
import { SkillTreeUnitHeader } from './SkillTreeUnitHeader';
import { SkillTreePathNode } from './SkillTreePathNode';
import type { ProgramDetail, Lesson, ActivityKind } from '@/types/content';

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

      {sections.map((section) => {
        const tone = toneForUnit(section.index);
        return (
          <div key={section.unit.id} className="relative">
            <SkillTreeUnitHeader
              index={section.index}
              title={tText(section.unit.title)}
              doneCount={section.doneCount}
              total={section.total}
              tone={tone}
              weekLabel={t('journey.unitWeek', { n: section.index + 1 })}
              lessonsLabel={t('label.lessons').toLowerCase()}
            />

            {/* Vertical node path */}
            <div className="flex flex-col items-center">
              {section.nodes.map((node, ni) => (
                <SkillTreePathNode
                  key={node.lesson.id}
                  node={node}
                  offset={ni % 2 === 0 ? 0 : 1}
                  title={tText(node.lesson.title)}
                  kindLabel={t(`activity.${lessonKind(node.lesson)}`)}
                  tone={tone}
                  onClick={() => node.state !== 'locked' && onOpenLesson(node.lesson.id)}
                />
              ))}
              {section.nodes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">{t('home.emptyHint')}</p>
              )}
            </div>
          </div>
        );
      })}

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
