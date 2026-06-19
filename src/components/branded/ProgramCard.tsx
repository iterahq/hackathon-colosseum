/**
 * Program card — João Oak's CourseCard visual, re-labelled to the canonical
 * "Program" entity (NOT git-metaphor). Shows unit/lesson/activity counts and a
 * progress bar derived from real data.
 */
import { motion } from 'framer-motion';
import { Layers, BookOpen, Play, ListChecks } from 'lucide-react';
import { ProgramIcon } from './ProgramIcon';
import { useI18n } from '@/i18n';
import type { Program } from '@/types/content';

export function ProgramCard({ program, onClick }: { program: Program; onClick?: () => void }) {
  const { t, tText } = useI18n();
  const total = program.activityCount ?? 0;
  const done = program.completedCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <motion.button
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      data-testid="program-card"
      className="group relative text-left rounded-2xl overflow-hidden bg-card border border-border hover:border-verde-tech/50 transition-colors"
    >
      {/* Flat brand panel: solid obsidiana, subtle grid, NO gradient/blur/glow/shadow. */}
      <div className="relative aspect-[16/10] overflow-hidden bg-obsidiana">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <ProgramIcon
            icon={program.icon}
            size="xl"
            className="group-hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-1 rounded-full font-mono text-[11px] tracking-wider uppercase bg-obsidiana/80 border border-border text-evergreen-hi">
            {t('label.program')}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-evergreen text-obsidiana flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 fill-obsidiana ml-0.5" />
        </div>
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            {program.unitCount ?? 0} {t('label.units').toLowerCase()}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {program.lessonCount ?? 0} {t('label.lessons').toLowerCase()}
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="w-3.5 h-3.5" />
            {total}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('label.activities')}
          </span>
          <span className="text-xs font-medium text-evergreen-hi">
            {pct > 0 ? `${pct}%` : t('program.start')}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
