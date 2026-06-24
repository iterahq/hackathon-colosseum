/**
 * Itera dashboard (Discover) — João Oak's gamified home, wired to real
 * itera.programs / xp_events / badges. Canonical labels: Program / Unit /
 * Lesson / Activity. No more "iterate" header, no MOCK banners.
 */
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Sparkles, CreditCard } from 'lucide-react';
import { AppHeader, ProgramCard, StatsCard, BadgeGrid } from '@/components/branded';
import { usePrograms, useUserStats, useBadges } from '@/hooks';
import { useI18n } from '@/i18n';

export default function HomePage() {
  const navigate = useNavigate();
  const { t, tText } = useI18n();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const { data: allPrograms = [], isPending, isError, refetch } = usePrograms();
  const { data: stats, isPending: statsLoading } = useUserStats();
  const { data: badges, isPending: badgesLoading } = useBadges();

  // Navbar search filters the program grid (real feature behind ?q=).
  const programs = q
    ? allPrograms.filter((p) => tText(p.title).toLowerCase().includes(q))
    : allPrograms;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />

      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 md:py-8 space-y-8 md:space-y-12">
          {/* Hero + stats */}
          <section className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl overflow-hidden border border-border"
            >
              {/* Flat brand hero: solid panel + subtle grid, NO gradient/blur/glow. */}
              <div className="relative bg-obsidiana p-6 md:p-10 min-h-[220px] md:min-h-[260px] flex flex-col justify-end">
                <div className="absolute inset-0 grid-pattern opacity-30" />
                <div className="relative max-w-lg">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider bg-evergreen-soft text-evergreen-hi border border-evergreen/30">
                    <Sparkles className="w-3 h-3" /> Itera
                  </span>
                  <h1
                    className="font-display font-bold mt-3 text-foreground"
                    style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', lineHeight: 1.1 }}
                  >
                    {t('home.heroTitle')}{' '}
                    <span className="text-gradient">{t('home.heroAccent')}</span>
                  </h1>
                  <p className="text-muted-foreground mt-3 text-sm md:text-base max-w-md">
                    {t('home.heroSubtitle')}
                  </p>
                  {/* Self-serve subscribe CTA (PLG) → /subscribe. */}
                  <button
                    type="button"
                    onClick={() => navigate('/subscribe')}
                    data-testid="home-subscribe-cta"
                    className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    {t('subscribe.cta')}
                  </button>
                </div>
              </div>
            </motion.div>

            <StatsCard stats={stats} loading={statsLoading} />
          </section>

          {/* Programs */}
          <Section title={t('home.yourPrograms')} subtitle={t('home.programsSubtitle')}>
            {isPending ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card aspect-[16/13] ds-shimmer" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-4 py-12" data-testid="programs-error">
                <p className="text-muted-foreground text-center max-w-md">{t('home.error')}</p>
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
                data-testid="programs-empty"
              >
                <p className="font-display text-lg text-foreground">{t('home.empty')}</p>
                <p className="text-sm text-muted-foreground mt-2">{t('home.emptyHint')}</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="programs-grid">
                {programs.map((p) => (
                  <ProgramCard key={p.id} program={p} onClick={() => navigate(`/program/${p.slug}`)} />
                ))}
              </div>
            )}
          </Section>

          {/* Badges */}
          <Section
            title={t('badges.title')}
            subtitle={t('badges.subtitle')}
            seeAllLabel={t('badges.seeAll')}
          >
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
              <BadgeGrid badges={badges} loading={badgesLoading} />
            </div>
          </Section>
        </div>
      </main>

      <footer className="shrink-0 border-t border-border mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Itera</span>
            <span className="text-verde-tech">/</span>
            <span>by DevFellowship</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  subtitle,
  seeAllLabel,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  seeAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h3 className="font-display text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {seeAllLabel && (
          <button
            type="button"
            className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-menta hover:text-evergreen-hi transition-colors"
          >
            {seeAllLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
