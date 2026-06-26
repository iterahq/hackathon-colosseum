/**
 * Catalog (Cursos) — self-serve course DISCOVERY + ENROLLMENT.
 *
 * Round-1 finding #1: a subscribed/self-serve user lands in their own personal
 * tenant and can only see programs they're already a member of. The flagship
 * `modele-dados-com-ia` lives under tenant `itera`, so it was undiscoverable.
 * This page lists the catalog courses (membership-independent, via the
 * itera.catalog_programs() RPC) and lets the user enroll (→ learner membership in
 * the course's tenant). After enroll the course opens normally (tenant RLS lets
 * the user read + play it). Subscription-gated like the other learner surfaces.
 */
import { useNavigate } from 'react-router-dom';
import { GraduationCap, CheckCircle2, ArrowRight } from 'lucide-react';
import { AppHeader, ProgramCard } from '@/components/branded';
import { useCatalog, useEnroll } from '@/hooks/useCatalog';
import { useI18n } from '@/i18n';
import type { CatalogProgram } from '@/types/catalog';

export default function CatalogPage() {
  const { t } = useI18n();
  const { data: programs = [], isPending, isError, refetch } = useCatalog();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="catalog" />

      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 md:py-8 space-y-8">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> {t('nav.catalog')}
            </div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mt-1">
              {t('catalog.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">{t('catalog.subtitle')}</p>
          </header>

          {isPending ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-border bg-card aspect-[16/12] ds-shimmer" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-12" data-testid="catalog-error">
              <p className="text-muted-foreground text-center max-w-md">{t('catalog.error')}</p>
              <button
                onClick={() => refetch()}
                className="h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : programs.length === 0 ? (
            <div
              className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center"
              data-testid="catalog-empty"
            >
              <p className="font-display text-lg text-foreground">{t('catalog.empty')}</p>
              <p className="text-sm text-muted-foreground mt-2">{t('catalog.emptyHint')}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="catalog-grid">
              {programs.map((p) => (
                <CatalogCard key={p.id} program={p} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * One catalog course rendered with the shared rich {@link ProgramCard}. Catalog
 * programs are not-yet-enrolled → no per-user progress (ProgramCard shows the
 * not-started look: level tag, no progress bar). The Enroll / Open CTA + inline
 * error live in the card's `footer` slot. An already-enrolled card also makes
 * the hero clickable so it opens the course directly (parity with HomePage).
 */
function CatalogCard({ program }: { program: CatalogProgram }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const enroll = useEnroll();

  const goToCourse = () => navigate(`/program/${program.slug}`);

  const onEnroll = async () => {
    try {
      await enroll.mutateAsync(program.id);
      // On success the user holds a membership; open the course straight away.
      goToCourse();
    } catch {
      /* error surfaced inline below via enroll.isError */
    }
  };

  const footer = (
    <div data-program-slug={program.slug} data-testid="catalog-card" className="space-y-3">
      {program.alreadyEnrolled ? (
        <button
          type="button"
          onClick={goToCourse}
          data-testid="catalog-open"
          className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi font-medium hover:bg-evergreen-soft/70 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" /> {t('catalog.open')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onEnroll}
          disabled={enroll.isPending}
          data-testid="catalog-enroll"
          className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-50"
        >
          {enroll.isPending ? (
            t('catalog.enrolling')
          ) : (
            <>
              {t('catalog.enroll')} <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      )}

      {enroll.isError && (
        <p className="text-sm text-clay" data-testid="catalog-enroll-error">
          {t('catalog.enrollError')}
        </p>
      )}
    </div>
  );

  return (
    <ProgramCard
      program={program}
      onClick={program.alreadyEnrolled ? goToCourse : undefined}
      footer={footer}
    />
  );
}
