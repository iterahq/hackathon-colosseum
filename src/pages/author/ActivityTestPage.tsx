/**
 * Standalone per-kind TEST route (plan 20260706, Phase 5 / ADR-12).
 * `/author/activities/:activityId/test` — loads one activity and mounts the
 * `ActivityTestHarness` (real onComplete → in-memory sink → verdict, ZERO DB
 * writes). Also reachable from a canvas cell's "Test" affordance.
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { ActivityTestHarness } from '@/components/author/ActivityTestHarness';
import { useActivity } from '@/hooks/useAuthorCanvas';

export default function ActivityTestPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [searchParams] = useSearchParams();
  const { data: activity, isPending, isError, refetch } = useActivity(activityId);

  // Back should return to the canvas the user came from. The canvas Test link
  // carries the originating unit (`?unit=<unitId>`); fall back to /author only
  // when it's absent (e.g. deep-linked straight into the test route).
  const backUnitId = searchParams.get('unit');
  const backTo = backUnitId ? `/author/units/${backUnitId}/canvas` : '/author';
  const backLabel = backUnitId ? 'Back to canvas' : 'Author';

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
            Test as student
          </h1>
        </div>
      </div>

      <main className="flex-1 max-w-[760px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {isPending && <p className="text-sm text-muted-foreground">Loading activity…</p>}
        {isError && (
          <div className="text-sm text-muted-foreground">
            Could not load this activity.{' '}
            <button className="underline" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}
        {activity && <ActivityTestHarness activity={activity} />}
      </main>
    </div>
  );
}
