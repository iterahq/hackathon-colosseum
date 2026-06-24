/**
 * Program (course) detail — Duolingo-style skill-tree, parity with João Pedro's
 * course design. The app navbar (AppHeader) stays at the TOP; a sticky course
 * sub-header carries the back arrow + branch label + title. The points/heart/
 * fire (🔥/❤️/⚡) badges from his mock are intentionally DROPPED (Tainan).
 *
 * The vertical node path is rendered by <SkillTree> from the real
 * Program → Unit → Lesson → Activity data.
 */
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, GitBranch } from 'lucide-react';
import { AppHeader, ProgramIcon, SkillTree } from '@/components/branded';
import { useProgram } from '@/hooks';
import { useI18n } from '@/i18n';

export default function ProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const { data: program, isPending, isError, refetch } = useProgram(slug);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />

      {/* Sticky course sub-header (back · branch · title). No heart/fire/XP. */}
      {program && (
        <div className="sticky top-14 md:top-16 z-40 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-[1100px] mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
            <Link
              to="/"
              aria-label={t('common.back')}
              className="flex-shrink-0 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> {t('label.program')}
              </div>
              <div className="font-display font-semibold truncate leading-tight">
                {tText(program.title)}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
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

            {program.units.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
                {t('home.emptyHint')}
              </div>
            ) : (
              <SkillTree
                program={program}
                onOpenLesson={(lessonId) => navigate(`/lesson/${lessonId}`)}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
