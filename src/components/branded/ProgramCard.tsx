/**
 * Program card — parity with João Pedro's "Your in-progress courses" card.
 *
 * Anatomy (matches his 100%): category pill (top-left) · category-gradient icon
 * tile (centered) on a faint category-tinted wash · evergreen progress bar at
 * the foot of the image · title · meta row (lessons · units · activities) ·
 * footer (level tag left, "N% complete" / Start right). Wired to our real
 * itera.programs counts + progress — fields we don't have (author/rating) are
 * omitted gracefully; the layout is preserved.
 */
import { motion } from 'framer-motion';
import { BookOpen, Layers, ListChecks, Play } from 'lucide-react';
import { ProgramIcon, categoryFor } from './ProgramIcon';
import { useI18n } from '@/i18n';
import type { Program } from '@/types/content';

/** Derive a coarse level from activity volume (no level field in the schema). */
function levelFor(activityCount: number): 'beginner' | 'intermediate' | 'advanced' {
  if (activityCount >= 15) return 'advanced';
  if (activityCount >= 7) return 'intermediate';
  return 'beginner';
}

export function ProgramCard({ program, onClick }: { program: Program; onClick?: () => void }) {
  const { t, tText } = useI18n();
  const total = program.activityCount ?? 0;
  const done = program.completedCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const { label: category, gradient } = categoryFor(program.icon);
  const level = levelFor(total);

  return (
    <motion.button
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      data-testid="program-card"
      className="group relative text-left rounded-2xl overflow-hidden bg-card border border-border hover:border-verde-tech/50 transition-colors"
    >
      {/* Image area — faint category-tinted wash behind the gradient icon. */}
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
        {/* Category pill (top-left) */}
        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-1 rounded-full font-mono text-[11px] tracking-wider uppercase bg-obsidiana/70 border border-border text-evergreen-hi">
            {category}
          </span>
        </div>
        {/* Hover play affordance */}
        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-evergreen text-obsidiana flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 fill-obsidiana ml-0.5" />
        </div>
        {/* Progress bar at the foot of the image (his layout) */}
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div className="h-full bg-evergreen" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <h4 className="font-display font-semibold leading-tight group-hover:text-menta transition-colors">
          {tText(program.title)}
        </h4>

        {/* Meta row — lessons · units · activities (real counts) */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {program.lessonCount ?? 0} {t('label.lessons').toLowerCase()}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            {program.unitCount ?? 0} {t('label.units').toLowerCase()}
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="w-3.5 h-3.5" />
            {total}
          </span>
        </div>

        {/* Footer — level tag (left) · % complete / Start (right) */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t(`level.${level}`)}
          </span>
          <span className="text-xs font-medium text-evergreen-hi">
            {pct > 0 ? t('program.percentComplete', { n: String(pct) }) : t('program.start')}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
