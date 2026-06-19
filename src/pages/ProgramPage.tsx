/**
 * Program detail — Unit → Lesson navigation. Canonical labels throughout.
 * João's CourseView visual language: collapsible units, lesson rows with
 * activity-kind badges, evergreen accents.
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronDown,
  Play,
  FileText,
  GitBranch,
  HelpCircle,
  Code2,
  CheckCircle2,
} from 'lucide-react';
import { AppHeader, ProgramIcon } from '@/components/branded';
import { useProgram } from '@/hooks';
import { useI18n } from '@/i18n';
import type { LucideIcon } from 'lucide-react';
import type { ActivityKind, Unit } from '@/types/content';

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  document: FileText,
  diagram: GitBranch,
  quiz: HelpCircle,
  code: Code2,
};

export default function ProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { data: program, isPending, isError, refetch } = useProgram(slug);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> {t('common.back')}
        </Link>

        {isPending ? (
          <div className="space-y-4">
            <div className="h-40 rounded-3xl ds-shimmer" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl ds-shimmer" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-muted-foreground">{t('program.notFound')}</p>
            <button
              onClick={() => refetch()}
              className="h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : program ? (
          <>
            {/* Program hero */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl overflow-hidden border border-border bg-obsidiana p-6 md:p-8 mb-8"
            >
              {/* Flat brand hero: solid panel + subtle grid (no gradient/blur/glow). */}
              <div className="absolute inset-0 grid-pattern opacity-30" />
              <div className="relative flex items-center gap-5">
                <ProgramIcon icon={program.icon} size="lg" />
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">
                    {t('label.program')}
                  </span>
                  <h1 className="font-display font-bold text-foreground mt-1">
                    {tText(program.title)}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {program.units.length} {t('label.units').toLowerCase()}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Units */}
            <div className="space-y-4">
              {program.units.map((unit, i) => (
                <UnitBlock
                  key={unit.id}
                  unit={unit}
                  index={i}
                  defaultOpen={i === 0}
                  onOpenLesson={(lessonId) => navigate(`/lesson/${lessonId}`)}
                />
              ))}
              {program.units.length === 0 && (
                <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
                  {t('home.emptyHint')}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function UnitBlock({
  unit,
  index,
  defaultOpen,
  onOpenLesson,
}: {
  unit: Unit;
  index: number;
  defaultOpen?: boolean;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { t, tText } = useI18n();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const lessons = unit.lessons ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-4 md:p-5 text-left hover:bg-obsidiana/40 transition-colors"
        data-testid="unit-row"
      >
        <div className="w-10 h-10 rounded-xl bg-verde-floresta/60 border border-border flex items-center justify-center font-display font-bold text-menta">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('label.unit')}
          </div>
          <div className="font-display font-semibold truncate">{tText(unit.title)}</div>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {lessons.length} {t('label.lessons').toLowerCase()}
        </span>
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 md:px-4 md:pb-4 space-y-2">
              {lessons.map((lesson) => {
                const activities = lesson.activities ?? [];
                return (
                  <button
                    key={lesson.id}
                    onClick={() => onOpenLesson(lesson.id)}
                    className="w-full flex items-center gap-4 p-3 rounded-xl border border-border bg-obsidiana/40 hover:border-verde-tech/50 transition-colors text-left group"
                    data-testid="lesson-row"
                  >
                    <div className="w-9 h-9 rounded-full bg-menta/15 text-menta flex items-center justify-center group-hover:bg-menta group-hover:text-obsidiana transition-colors">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {t('label.lesson')}
                      </div>
                      <div className="font-medium truncate">{tText(lesson.title)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {activities.slice(0, 4).map((a) => {
                        const Icon = KIND_ICON[a.kind] ?? FileText;
                        const isDone = a.status === 'done';
                        return (
                          <span
                            key={a.id}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                              isDone
                                ? 'bg-verde-tech/20 border-verde-tech/40 text-menta'
                                : 'bg-card border-border text-muted-foreground'
                            }`}
                            title={t(`activity.${a.kind}`)}
                          >
                            {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
