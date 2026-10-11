/**
 * Post-class report (`/live/instructor/report/:sessionId`) — instructor-gated.
 * Aggregates the durable rows (class_answers + class_attendance, migration 0020)
 * client-side via buildClassReport; RLS keeps it staff-only server-side.
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';
import { useI18n } from '@/i18n';
import { useClassReport, useClassSessionById } from '@/hooks/useLiveClass';
import { useLessonContent } from '@/hooks';
import { buildClassReport } from '@/utils/buildClassReport';
import { activityLabel } from '@/utils/activityLabel';
import { ReportSummary } from '@/components/live/report/ReportSummary';
import { ReportActivities } from '@/components/live/report/ReportActivities';
import { ReportRanking } from '@/components/live/report/ReportRanking';
import { ReportPodiumChain } from '@/components/live/report/ReportPodiumChain';

export default function InstructorReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { t, tText } = useI18n();
  const { data: session, isPending: sessionPending } = useClassSessionById(sessionId);
  const { data: reportData, isPending: dataPending } = useClassReport(sessionId);
  const { data: lesson } = useLessonContent(session?.lessonId);

  const activities = useMemo(() => lesson?.activities ?? [], [lesson]);
  const report = useMemo(
    () => (reportData ? buildClassReport(reportData, activities.map((a) => a.id)) : null),
    [reportData, activities]
  );
  const labels = useMemo(() => {
    const m = new Map<string, string>();
    activities.forEach((a, i) => {
      m.set(
        a.id,
        activityLabel(a.spec, t('live.report.activities.fallback', { n: String(i + 1) }))
      );
    });
    return m;
  }, [activities, t]);

  const startedAt = session?.startedAt ? new Date(session.startedAt) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="dash-root"><AppTopBar /></div>
      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        <Link
          to="/live/instructor"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('live.report.back')}
        </Link>

        <span className="block text-[13px] uppercase tracking-wider text-clay font-mono">
          {t('live.instructor.kicker')}
        </span>
        <h1
          className="font-display font-bold text-foreground leading-tight mb-1"
          data-testid="report-title"
        >
          {t('live.report.title')}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {tText(lesson?.title)}
          {startedAt
            ? ` · ${startedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} ${startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </p>

        {sessionPending || dataPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !session || !report ? (
          <p className="text-sm text-muted-foreground" data-testid="report-not-found">
            {t('live.report.notFound')}
          </p>
        ) : (
          <>
            <ReportSummary totals={report.totals} />
            <ReportActivities stats={report.perActivity} labels={labels} />
            <ReportRanking participants={report.participants} />
            <ReportPodiumChain sessionId={session.id} ended={session.status === 'ended'} />
          </>
        )}
      </main>
    </div>
  );
}
