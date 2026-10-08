/**
 * `/artifacts` — "Meu repositório": everything the learner has produced,
 * across every lesson, in the git-shaped folder structure.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 2).
 *
 * This is the destination of the toast the player raises the moment work is
 * saved — Tainan: *"quando persistiu, o que acontece? … nem que seja um toast,
 * e o toast tem um link, clica no link e vai pra uma página daquele usuário
 * onde ele vê as coisas persistidas por ele."* It is also reachable from the
 * navbar, so the learner can get here without having just finished something.
 *
 * Page is render-only; the data chain is `useMyArtifacts → listMyArtifacts`.
 */
import { motion } from 'framer-motion';
import { FolderGit2 } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { ArtifactBrowser } from '@/components/artifacts/ArtifactBrowser';
import { useMyArtifacts } from '@/hooks/useArtifacts';
import { useI18n } from '@/i18n';

export default function ArtifactsPage() {
  const { t } = useI18n();
  const { data, isPending, isError, refetch } = useMyArtifacts();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="artifacts" />
      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12" data-testid="artifacts-page">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border bg-evergreen-soft text-evergreen-hi border-evergreen/30">
            <FolderGit2 className="w-3.5 h-3.5" /> {t('artifacts.kicker')}
          </span>
          <h1 className="font-display text-3xl text-foreground mt-3">{t('artifacts.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{t('artifacts.subtitle')}</p>
        </motion.div>

        {isPending && (
          <div className="mt-8 space-y-3" data-testid="artifacts-loading" aria-busy="true">
            <div className="h-12 rounded-xl ds-shimmer" />
            <div className="h-12 rounded-xl ds-shimmer" />
            <div className="h-12 rounded-xl ds-shimmer" />
          </div>
        )}

        {isError && (
          <div className="mt-8" data-testid="artifacts-error">
            <p className="text-destructive">{t('artifacts.loadError')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 px-4 h-10 rounded-full border border-border text-sm hover:border-clay/60 transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isPending && !isError && (data?.length ?? 0) === 0 && (
          <div
            className="mt-8 rounded-2xl border border-border bg-card p-8 text-center"
            data-testid="artifacts-empty"
          >
            <p className="text-sm text-muted-foreground">{t('artifacts.empty')}</p>
          </div>
        )}

        {!isPending && !isError && (data?.length ?? 0) > 0 && (
          <div className="mt-8">
            <ArtifactBrowser artifacts={data ?? []} />
          </div>
        )}
      </main>
    </div>
  );
}
