/**
 * Program card — parity with João Pedro's "Your in-progress courses" card.
 *
 * Anatomy: icon tile (centered) on a faint tinted wash · evergreen progress
 * bar at the foot of the image · title · meta row (lessons · units ·
 * activities) · footer ("N% complete" / Start). Wired to our real
 * itera.programs counts + progress — fields we don't have (category, level,
 * author/rating) are not shown.
 *
 * Reused on TWO surfaces:
 *  - HomePage "Cursos" (enrolled): default footer (% complete), whole
 *    card is one big button (`onClick`).
 *  - CatalogPage "Catálogo de cursos" (discovery): a custom `footer` slot is
 *    passed for the Enroll/Open CTA. Catalog programs lack `completedCount`
 *    (a not-yet-enrolled user has 0 progress) → the progress bar is hidden,
 *    exactly the not-started look. No "undefined"/"NaN".
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Layers, ListChecks, Lock, Play } from 'lucide-react';
import { ProgramIcon, categoryFor } from './ProgramIcon';
import { useCountLabel } from './useCountLabel';
import { useI18n } from '@/i18n';
import type { I18nText } from '@/types/content';

/**
 * The minimal shape ProgramCard renders. Both `Program` (enrolled dashboard)
 * and `CatalogProgram` (discovery) satisfy it structurally — catalog programs
 * simply omit `completedCount`, which degrades to the not-started look.
 */
export interface ProgramCardData {
  id: string;
  title: I18nText;
  unitCount?: number;
  lessonCount?: number;
  activityCount?: number;
  /** Per-user progress. Absent on catalog (not-yet-enrolled) → 0% / no bar. */
  completedCount?: number;
  icon?: string;
}

export function ProgramCard({
  program,
  onClick,
  footer,
  locked = false,
}: {
  program: ProgramCardData;
  /** Whole-card click (enrolled surface). Ignored when `footer` is provided. */
  onClick?: () => void;
  /** Custom footer slot (e.g. catalog Enroll/Open CTA). Replaces the default
   *  %-complete line and makes the card a non-button container. */
  footer?: ReactNode;
  /** Visitor mode (2026-09-18): shows a lock badge over the cover image. Counts
   *  and title stay visible — only the CTA (via `footer`) changes what unlocking
   *  means. Purely visual; access is still enforced by the route/RLS. */
  locked?: boolean;
}) {
  const { t, tText } = useI18n();
  const total = program.activityCount ?? 0;
  const done = program.completedCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const { gradient } = categoryFor(program.icon);
  const count = useCountLabel();

  const cardClass =
    'group relative text-left rounded-2xl overflow-hidden bg-card border border-border hover:border-verde-tech/50 transition-colors';

  const image = (
    <div className="relative aspect-[16/10] overflow-hidden bg-obsidiana">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.12]`}
        aria-hidden
      />
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <ProgramIcon
          icon={program.icon}
          size="xl"
          className="group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      {/* Lock badge (top-right) — visitor mode. */}
      {locked && (
        <div className="absolute top-3 right-3">
          <span
            data-testid="program-card-lock"
            className="w-7 h-7 rounded-full bg-obsidiana/80 border border-border flex items-center justify-center text-menta"
          >
            <Lock className="w-3.5 h-3.5" />
          </span>
        </div>
      )}
      {/* Hover play affordance — only meaningful when the card itself is clickable */}
      {onClick && !footer && (
        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-evergreen text-obsidiana flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 fill-obsidiana ml-0.5" />
        </div>
      )}
      {/* Progress bar at the foot of the image (his layout) */}
      {pct > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
          <div className="h-full bg-evergreen" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );

  const meta = (
    <>
      <h4 className="font-display font-semibold leading-tight group-hover:text-menta transition-colors">
        {tText(program.title)}
      </h4>

      {/* Meta row — lessons · units · activities (real counts) */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          {count(program.lessonCount ?? 0, 'label.lesson', 'label.lessons')}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" />
          {count(program.unitCount ?? 0, 'label.unit', 'label.units')}
        </span>
        <span className="flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" />
          {count(total, 'label.activity', 'label.activities')}
        </span>
      </div>
    </>
  );

  const defaultFooter = (
    <div className="flex items-center justify-end pt-2 border-t border-border">
      <span className="text-xs font-medium text-evergreen-hi">
        {pct > 0 ? t('program.percentComplete', { n: String(pct) }) : t('program.start')}
      </span>
    </div>
  );

  // Catalog surface: custom footer (its own buttons) → render a container, not a
  // single button (nested interactive elements are invalid inside a <button>).
  if (footer) {
    return (
      <motion.div
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        data-testid="program-card"
        className={cardClass}
      >
        {onClick ? (
          <button type="button" onClick={onClick} className="block w-full text-left">
            {image}
          </button>
        ) : (
          image
        )}
        <div className="p-4 space-y-3">
          {meta}
          {footer}
        </div>
      </motion.div>
    );
  }

  // Enrolled surface (HomePage): whole card is one big button.
  return (
    <motion.button
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      data-testid="program-card"
      className={cardClass}
    >
      {image}
      <div className="p-4 space-y-3">
        {meta}
        {defaultFooter}
      </div>
    </motion.button>
  );
}
