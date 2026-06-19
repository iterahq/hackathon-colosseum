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
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-obsidiana via-card to-obsidiana">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div
          className={`absolute -top-10 -right-10 w-44 h-44 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${program.accent ?? 'from-menta to-verde-tech'}`}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <ProgramIcon
            icon={program.icon}
            color={program.accent}
            size="xl"
            className="group-hover:scale-105 transition-transform duration-500 shadow-2xl"
          />
        </div>
        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-obsidiana/70 backdrop-blur border border-border text-menta">
            {t('label.program')}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-menta text-obsidiana flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 fill-obsidiana ml-0.5" />
        </div>
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-gradient-to-r from-verde-tech to-menta"
              style={{ width: `${pct}%` }}
            />
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
          <span className="text-[13px] uppercase tracking-wider text-muted-foreground">
            {t('label.activities')}
          </span>
          <span className="text-xs font-medium text-menta">
            {pct > 0 ? `${pct}%` : t('program.start')}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
