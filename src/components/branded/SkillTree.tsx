/**
 * Course-detail skill-tree — a winding path of lesson nodes.
 *
 * Mapping to our real data:
 *   Program → Units (= "feature branch" sections) → Lessons (= path nodes).
 *   A lesson node is `done` when all its activities are done, `current` when it
 *   is the first not-yet-complete node of ITS UNIT, otherwise `locked`. Clicking
 *   an unlocked node opens the lesson player. Locked nodes are non-interactive.
 *
 * Each unit is a WEEK (Tainan: the first course ships in weekly units, one
 * launch per week) and gets its own color from `toneForUnit`. The first
 * `current` node of the program is the learner's "primary" node: it is enlarged,
 * shows its activity progress ring and the continue callout.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Flag, GitBranch, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n';
import { buildSections } from '@/utils/buildSections';
import { toneForUnit } from './skillTreeUnitPalette';
import { SkillTreeUnitHeader } from './SkillTreeUnitHeader';
import { SkillTreePathNode } from './SkillTreePathNode';
import { SkillTreeCallout } from './SkillTreeCallout';
import {
  BANNER_INSET,
  buildTrailPath,
  computeTrailLayout,
  trailWidthFor,
} from './skillTreeGeometry';
import type { ProgramDetail, Lesson, ActivityKind } from '@/types/content';

const DEFAULT_WIDTH = 390;
const CALLOUT_MAX_WIDTH = 280;
const CALLOUT_INSET = 12;
const PATH_BASE = '#2E2A25';
const PATH_FLOW = '#A9F0C7';
const GRID_LINE = 'rgba(63,209,127,0.022)';
const GRID_BACKGROUND = `linear-gradient(${GRID_LINE} 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px) 0 0/26px 26px`;

/**
 * Representative activity kind for the eyebrow shown under a node. There is no
 * lesson-level kind in the model, so we use the first activity's kind. Falls
 * back to `document` when a lesson has no activities yet.
 */
function lessonKind(lesson: Lesson): ActivityKind {
  return lesson.activities?.[0]?.kind ?? 'document';
}

function countDone(lesson: Lesson): number {
  return (lesson.activities ?? []).filter(
    (a) => a.status === 'done' || (a.status as string) === 'completed',
  ).length;
}

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function SkillTree({
  program,
  onOpenLesson,
}: {
  program: ProgramDetail;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { t, tText } = useI18n();
  const reducedMotion = !!useReducedMotion();
  const [trailRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const sections = buildSections(program);

  const totalLessons = sections.reduce((n, s) => n + s.total, 0);
  const flatNodes = sections.flatMap((s) => s.nodes);
  const primaryIndex = flatNodes.findIndex((n) => n.state === 'current');
  const primary = primaryIndex >= 0 ? primaryIndex : null;

  const width = trailWidthFor(containerWidth);
  const layout = computeTrailLayout({
    width,
    sectionSizes: sections.map((s) => s.nodes.length),
    primaryIndex: primary,
  });
  const fullPath = buildTrailPath(layout.nodes);
  const doneUpTo = primary ?? layout.nodes.length - 1;
  const donePath = doneUpTo >= 1 ? buildTrailPath(layout.nodes.slice(0, doneUpTo + 1)) : '';
  const flowPath = primary !== null && primary >= 1 ? buildTrailPath(layout.nodes.slice(primary - 1, primary + 1)) : '';
  const trailLeft = (containerWidth - width) / 2;

  return (
    <div
      className="relative overflow-hidden rounded-3xl px-2 py-4 md:px-4"
      style={{ background: GRID_BACKGROUND }}
      data-testid="skill-tree"
    >
      {/* JOURNEY header */}
      <div className="relative z-[1] flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 mb-6">
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
      <div className="relative z-[1] flex justify-center mb-2">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-card font-mono text-xs text-muted-foreground">
          <Flag className="w-3.5 h-3.5 text-evergreen-hi" /> {t('journey.basecamp')}
        </span>
      </div>

      <div ref={trailRef} className="relative w-full" style={{ height: layout.height }}>
        {sections.map((section, si) => (
          <span
            key={`mark-${section.unit.id}`}
            aria-hidden="true"
            className="absolute pointer-events-none select-none font-display font-bold leading-none whitespace-nowrap"
            style={{
              top: layout.banners[si].y + layout.banners[si].height + 30,
              [si % 2 === 0 ? 'left' : 'right']: 8,
              fontSize: 168,
              color: 'transparent',
              WebkitTextStroke: '1px rgba(255,255,255,0.07)',
            }}
          >
            {String(section.index + 1).padStart(2, '0')}
          </span>
        ))}

        <div className="absolute top-0 bottom-0" style={{ left: trailLeft, width }}>
          <svg
            width={width}
            height={layout.height}
            className="absolute inset-0 pointer-events-none overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="skill-tree-done" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={layout.height}>
                {sections.flatMap((section, si) => {
                  const color = toneForUnit(section.index).base;
                  const start = si === 0 ? 0 : layout.banners[si].y / layout.height;
                  const end = (layout.banners[si + 1]?.y ?? layout.height) / layout.height;
                  return [
                    <stop key={`${section.unit.id}-a`} offset={start} stopColor={color} />,
                    <stop key={`${section.unit.id}-b`} offset={end} stopColor={color} />,
                  ];
                })}
              </linearGradient>
            </defs>
            <path
              d={fullPath}
              fill="none"
              stroke={PATH_BASE}
              strokeWidth={5}
              strokeDasharray="2 11"
              strokeLinecap="round"
            />
            {donePath && (
              <>
                <path d={donePath} fill="none" stroke="url(#skill-tree-done)" strokeOpacity={0.2} strokeWidth={16} strokeLinecap="round" />
                <path d={donePath} fill="none" stroke="url(#skill-tree-done)" strokeWidth={6} strokeLinecap="round" />
              </>
            )}
            {flowPath && !reducedMotion && (
              <motion.path
                d={flowPath}
                fill="none"
                stroke={PATH_FLOW}
                strokeOpacity={0.9}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="3 57"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -60 }}
                transition={{ duration: 1.5, ease: 'linear', repeat: Infinity }}
              />
            )}
          </svg>

          {sections.map((section, si) => {
            const tone = toneForUnit(section.index);
            return (
              <SkillTreeUnitHeader
                key={section.unit.id}
                title={tText(section.unit.title)}
                doneCount={section.doneCount}
                total={section.total}
                tone={tone}
                weekLabel={t('journey.unitWeek', { n: section.index + 1 })}
                top={layout.banners[si].y}
                height={layout.banners[si].height}
                inset={BANNER_INSET}
              />
            );
          })}

          {layout.nodes.map((placement) => {
            const node = flatNodes[placement.globalIndex];
            const section = sections[placement.sectionIndex];
            const tone = toneForUnit(section.index);
            const isPrimary = placement.globalIndex === primary;
            return (
              <SkillTreePathNode
                key={node.lesson.id}
                node={node}
                x={placement.x}
                y={placement.y}
                size={placement.size}
                trailWidth={width}
                day={placement.day}
                dayLabel={t('journey.day', { n: placement.day })}
                title={tText(node.lesson.title)}
                kindLabel={t(`activity.${lessonKind(node.lesson)}`)}
                tone={tone}
                primary={isPrimary}
                activitiesDone={countDone(node.lesson)}
                activitiesTotal={node.lesson.activities?.length ?? 0}
                reducedMotion={reducedMotion}
                onClick={() => node.state !== 'locked' && onOpenLesson(node.lesson.id)}
              />
            );
          })}

          {primary !== null && layout.calloutTop !== null && (() => {
            const node = flatNodes[primary];
            const placement = layout.nodes[primary];
            const section = sections[placement.sectionIndex];
            const calloutWidth = Math.min(CALLOUT_MAX_WIDTH, width - CALLOUT_INSET * 2);
            const left = Math.max(CALLOUT_INSET, Math.min(width - CALLOUT_INSET - calloutWidth, placement.x - calloutWidth / 2));
            const done = countDone(node.lesson);
            return (
              <SkillTreeCallout
                eyebrow={t('journey.calloutEyebrow', {
                  day: String(placement.day).padStart(2, '0'),
                  n: placement.indexInSection + 1,
                  total: section.total,
                })}
                title={tText(node.lesson.title)}
                ctaLabel={done > 0 ? t('program.continue') : t('program.start')}
                activitiesDone={done}
                activitiesTotal={node.lesson.activities?.length ?? 0}
                tone={toneForUnit(section.index)}
                left={left}
                top={layout.calloutTop}
                width={calloutWidth}
                tailLeft={placement.x - left}
                onOpen={() => onOpenLesson(node.lesson.id)}
              />
            );
          })()}

          {sections.map(
            (section, si) =>
              section.nodes.length === 0 && (
                <p
                  key={`empty-${section.unit.id}`}
                  className="absolute left-0 right-0 text-center text-sm text-muted-foreground"
                  style={{ top: layout.banners[si].y + layout.banners[si].height + 8 }}
                >
                  {t('home.emptyHint')}
                </p>
              ),
          )}
        </div>
      </div>

      {/* Summit badge */}
      <div className="relative z-[1] flex flex-col items-center mt-2">
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
