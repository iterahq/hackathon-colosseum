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
import { ChevronLeft, GitBranch, SearchX } from 'lucide-react';
import { AppHeader, ProgramIcon, SkillTree, LockedProgramView } from '@/components/branded';
import { useProgram } from '@/hooks';
import { useCatalog } from '@/hooks/useCatalog';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { isProgramNotFoundError } from '@/services/programs.service';
import { useI18n } from '@/i18n';
import { WebOnly } from '@/components/shell/WebOnly';

/**
 * The route resolved to no program. Two causes, ONE screen, on purpose: the
 * client cannot tell "no such slug" from "you are not enrolled, so RLS hid it"
 * — PostgREST answers both with an empty result. So the copy names both, and
 * the way forward is the catalog, where enrolment actually happens.
 *
 * It replaces a `Retry` button that could never succeed, and it is also the
 * fallback for "the query settled with nothing and no error" — the branch that
 * used to render `null` and left `<main>` empty (DFL-006A7).
 */
function ProgramUnavailable({
  visitor = false,
  onRetry,
}: {
  /** A visitor gets the subscribe CTA first — the program may exist behind the paywall. */
  visitor?: boolean;
  /** Shown when the lookup itself failed, so "unavailable" is not the last word. */
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3"
      data-testid="program-unavailable"
    >
      <div className="w-11 h-11 rounded-2xl bg-muted/40 border border-border flex items-center justify-center text-muted-foreground">
        <SearchX className="w-5 h-5" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t('program.noAccess.title')}</h2>
      <p className="text-sm text-muted-foreground max-w-[46ch]">{t('program.noAccess.body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
        {visitor && (
          <WebOnly>
            <Link
              to="/subscribe"
              className="h-10 px-5 inline-flex items-center rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
              data-testid="program-unavailable-subscribe"
            >
              {t('catalog.locked.cta')}
            </Link>
          </WebOnly>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-10 px-5 inline-flex items-center rounded-full border border-border text-foreground hover:bg-card transition-colors"
            data-testid="program-unavailable-retry"
          >
            {t('common.retry')}
          </button>
        )}
        <Link
          to="/catalog"
          className="h-10 px-5 inline-flex items-center rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
          data-testid="program-unavailable-catalog"
        >
          {t('program.noAccess.browse')}
        </Link>
        <Link
          to="/"
          className="h-10 px-5 inline-flex items-center rounded-full border border-border text-foreground hover:bg-card transition-colors"
          data-testid="program-unavailable-home"
        >
          {t('program.noAccess.home')}
        </Link>
      </div>
    </div>
  );
}

export default function ProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, tText } = useI18n();

  // Visitor mode (2026-09-18): a signed-in user with no active subscription
  // reaches this route too (RequireSubscription mode="preview"). They hold no
  // REAL tenant membership, so `useProgram` would always resolve "not found"
  // via RLS — skip that query entirely for them (`enabled: false` below) and
  // instead look the slug up in the membership-independent catalog: if it
  // matches, render a LOCKED preview instead of "no access".
  const { level: accessLevel } = useAccessLevel();
  const isVisitor = accessLevel === 'visitor';
  const { data: program, isPending, isError, error, refetch } = useProgram(
    isVisitor ? undefined : slug
  );
  const {
    data: catalogPrograms = [],
    isPending: catalogPending,
    isError: catalogError,
    refetch: refetchCatalog,
  } = useCatalog({
    enabled: isVisitor,
  });
  const catalogMatch = isVisitor ? catalogPrograms.find((p) => p.slug === slug) : undefined;

  // A missing route param can never resolve either (the query stays disabled and
  // therefore permanently `isPending`) — treat it exactly like a hidden/absent
  // program so this route never renders an eternal skeleton. Same shape as
  // `ActivityTestPage`.
  const memberUnavailable = !isVisitor && isError && isProgramNotFoundError(error);
  const unavailable = !slug || memberUnavailable;
  const loading = Boolean(slug) && !unavailable && (isVisitor ? catalogPending : isPending);

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-clip">
      <AppHeader active="discover" />

      {/* Sticky course sub-header (back · branch · title). No heart/fire/XP. */}
      {program && (
        <div className="sticky top-14 md:top-16 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
            <Link
              to="/"
              aria-label={t('common.back')}
              className="relative shrink-0 w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors before:absolute before:-inset-1"
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

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {loading ? (
          <div className="space-y-4" data-testid="program-loading">
            <div className="h-40 rounded-3xl ds-shimmer" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl ds-shimmer" />
            ))}
          </div>
        ) : isVisitor ? (
          catalogMatch ? (
            <LockedProgramView program={catalogMatch} />
          ) : (
            <ProgramUnavailable visitor onRetry={catalogError ? () => void refetchCatalog() : undefined} />
          )
        ) : unavailable ? (
          <ProgramUnavailable />
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-16" data-testid="program-error">
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
                    {program.units.length} {t(program.units.length === 1 ? 'label.unit' : 'label.units').toLowerCase()}
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
        ) : (
          // The query settled, there is no error, and there is still nothing to
          // show. Before DFL-006A7 this branch was `null` and `<main>` rendered
          // EMPTY — no error, no empty state, no redirect. It now falls back to
          // the same explicit screen.
          <ProgramUnavailable />
        )}
      </main>
    </div>
  );
}
