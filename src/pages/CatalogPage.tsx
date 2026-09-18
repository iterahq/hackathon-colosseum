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
import { GraduationCap } from 'lucide-react';
import { AppHeader, LockedCatalogCard } from '@/components/branded';
import { useCatalog } from '@/hooks/useCatalog';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useI18n } from '@/i18n';
import { CatalogCard } from './CatalogCard';

export default function CatalogPage() {
  const { t } = useI18n();
  const { data: programs = [], isPending, isError, refetch } = useCatalog();
  // Visitor mode (2026-09-18): a signed-in user with no active subscription
  // still reaches this page (RequireSubscription mode="preview") and browses
  // the SAME cards, but locked — the enroll button never renders and
  // `useEnroll` is never even mounted for them (LockedCatalogCard doesn't call
  // it), so a visitor can never trigger enrollment from here.
  const { level: accessLevel } = useAccessLevel();
  const isVisitor = accessLevel === 'visitor';

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
              {programs.map((p) =>
                isVisitor ? (
                  <LockedCatalogCard key={p.id} program={p} />
                ) : (
                  <CatalogCard key={p.id} program={p} />
                )
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
