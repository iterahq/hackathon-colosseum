/**
 * Standalone per-kind TEST route (plan 20260706, Phase 5 / ADR-12).
 * `/author/activities/:activityId/test` — loads one activity and mounts the
 * `ActivityTestHarness` (real onComplete → in-memory sink → verdict, ZERO DB
 * writes). Also reachable from a canvas cell's "Test" affordance.
 *
 * Four states, all distinguishable (E2E 2026-07-28, finding D5): loading / NOT
 * FOUND / transport error / loaded. "Not found" used to be indistinguishable
 * from "still loading" — PostgREST answers an unknown id with an empty 200, so
 * the screen just sat on the spinner with no error and no way out. ADR-10 of
 * 20260728-itera-back-office deep-links the activity library straight here, so
 * every stale id (deleted, republished, another tenant's) lands on this path.
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, SearchX } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { ActivityTestHarness } from '@/components/author/ActivityTestHarness';
import { useActivity } from '@/hooks/useAuthorCanvas';
import { isActivityNotFoundError } from '@/services/authorCanvas.service';
import { useI18n } from '@/i18n';

export default function ActivityTestPage() {
  const { t } = useI18n();
  const { activityId } = useParams<{ activityId: string }>();
  const [searchParams] = useSearchParams();
  const { data: activity, isPending, isError, error, refetch } = useActivity(activityId);

  // Back should return to the canvas the user came from. The canvas Test link
  // carries the originating unit (`?unit=<unitId>`); fall back to /author only
  // when it's absent (e.g. deep-linked straight into the test route).
  const backUnitId = searchParams.get('unit');
  const backTo = backUnitId ? `/author/units/${backUnitId}/canvas` : '/author';
  const backLabel = backUnitId ? t('authorTest.backToCanvas') : t('authorTest.backToAuthor');

  // A missing route param can never resolve either (the query stays disabled and
  // therefore permanently `isPending`) — treat it exactly like a not-found row so
  // this route never renders an eternal spinner.
  const notFound = !activityId || (isError && isActivityNotFoundError(error));
  const loading = Boolean(activityId) && isPending && !notFound;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <div className="border-b border-border bg-card/40">
        <div className="max-w-[760px] w-full mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Link
            to={backTo}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            data-testid="test-back-link"
          >
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </Link>
          <h1 className="text-sm font-semibold text-foreground" data-testid="test-page-title">
            {t('authorTest.title')}
          </h1>
        </div>
      </div>

      <main className="flex-1 max-w-[760px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {loading && (
          <p className="text-sm text-muted-foreground" data-testid="test-loading">
            {t('authorTest.loading')}
          </p>
        )}

        {notFound && (
          <div
            className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3"
            data-testid="activity-not-found"
          >
            <div className="w-11 h-11 rounded-2xl bg-muted/40 border border-border flex items-center justify-center text-muted-foreground">
              <SearchX className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {t('authorTest.notFound.title')}
            </h2>
            <p className="text-sm text-muted-foreground max-w-[46ch]">
              {t('authorTest.notFound.body')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <Link
                to={backTo}
                className="h-10 px-5 inline-flex items-center rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
                data-testid="activity-not-found-back"
              >
                {backLabel}
              </Link>
              {backUnitId && (
                <Link
                  to="/author"
                  className="h-10 px-5 inline-flex items-center rounded-full border border-border text-foreground hover:bg-card transition-colors"
                  data-testid="activity-not-found-author"
                >
                  {t('authorTest.backToAuthor')}
                </Link>
              )}
            </div>
          </div>
        )}

        {isError && !notFound && (
          <div className="text-sm text-muted-foreground" data-testid="test-load-error">
            {t('authorTest.error')}{' '}
            <button className="underline" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {activity && <ActivityTestHarness activity={activity} />}
      </main>
    </div>
  );
}
