/**
 * LIVE per-kind TEST route — `/author/activities/:activityId/test-live`.
 *
 * ADDITIVE sibling of `ActivityTestPage` (`…/test`). The base route exercises the
 * CANNED/deterministic sandbox path; this opt-in route mounts the
 * `LiveActivityTestHarness`, which forces the BYOC live path (real
 * responder + judge). Purely additive — the existing test page/route are
 * untouched; this is the "sibling route" opt-in the task calls for (equivalent to
 * a `?live=1` param, but a distinct route keeps the two modes unambiguous for the
 * e2e).
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { LiveActivityTestHarness } from '@/components/author/LiveActivityTestHarness';
import { useActivity } from '@/hooks/useAuthorCanvas';
import { useI18n } from '@/i18n';

export default function LiveActivityTestPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const { data: activity, isPending, isError, refetch } = useActivity(activityId);

  const backUnitId = searchParams.get('unit');
  const backTo = backUnitId ? `/author/units/${backUnitId}/canvas` : '/author';
  const backLabel = backUnitId ? t("author.backToCanvas"): t("author.authoring");
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
          <h1
            className="text-sm font-semibold text-foreground"
            data-testid="test-page-title"
          >
            {t("authorTest.liveTitle")}
          </h1>
        </div>
      </div>

      <main className="flex-1 max-w-[760px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {isPending && (
          <p className="text-sm text-muted-foreground">
            {t("author.loadingActivity")}
          </p>
        )}
        {isError && (
          <div className="text-sm text-muted-foreground">
            {t("authorTest.error")}{" "}
            <button className="underline" onClick={() => refetch()}>
              {t("common.retry")}
            </button>
          </div>
        )}
        {activity && <LiveActivityTestHarness activity={activity} />}
      </main>
    </div>
  );
}
