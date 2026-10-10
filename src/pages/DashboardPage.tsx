import { useNavigate } from 'react-router-dom';
import { VisitorBanner } from '@/components/branded/VisitorBanner';
import { AchievementsPanel } from '@/components/dashboard/AchievementsPanel';
import { CourseCarousel } from '@/components/dashboard/CourseCarousel';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { FeaturedTrail } from '@/components/dashboard/FeaturedTrail';
import { LiveClassesCard } from '@/components/dashboard/LiveClassesCard';
import { TrailCards } from '@/components/dashboard/TrailCards';
import { WeeklyGoal } from '@/components/dashboard/WeeklyGoal';
import { WelcomeStrip } from '@/components/dashboard/WelcomeStrip';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { usePassportView } from '@/hooks/usePassportView';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { useVideoCourses } from '@/hooks/useVideoCourses';
import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { trailHref } from '@/utils/courses';
import { dayName, trailName } from '@/utils/trailDashboard';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

function Skeleton() {
  return (
    <div className="flex flex-col gap-12" data-testid="dashboard-loading">
      <div className="h-[340px] animate-pulse rounded-[14px] bg-[#141210]" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[220px] animate-pulse rounded-[14px] bg-[#141210]" />
        ))}
      </div>
    </div>
  );
}

/** Learner home: the featured trail, the other trails, achievements, the weekly goal, live classes and the course carousel. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { tText } = useI18n();
  const visitor = useAccessLevel().level === 'visitor';
  const dashboard = useTrailDashboard({ enabled: !visitor });
  const passport = usePassportView();
  const video = useVideoCourses();

  const openLesson = (lessonId: string) => navigate(`/lesson/${lessonId}`);
  const openTrail = (trail: Trail) => navigate(trailHref(trail.programSlug, trail.id));
  const describeLesson = (lessonId: string): string | null => {
    for (const trail of dashboard.trails) {
      const day = trail.days.find((d) => d.id === lessonId);
      if (day) return `${tText(trailName(trail.title))} · ${tText(dayName(day.title))}`;
    }
    return null;
  };

  const { trails, featured } = dashboard;

  return (
    <div className="dash-root min-h-screen text-[#F4EDE2]" style={GRID}>
      <AppTopBar />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-12 px-4 pb-14 pt-6 sm:px-8 xl:px-20 xl:pt-10">
        {visitor && <VisitorBanner />}
        {!visitor && dashboard.isPending && <Skeleton />}
        {!visitor && dashboard.isError && <DashboardEmpty kind="error" onAction={() => void dashboard.refetch()} />}
        {!visitor && !dashboard.isPending && !dashboard.isError && trails.length === 0 && (
          <DashboardEmpty kind="empty" onAction={() => navigate('/catalog')} />
        )}
        {!visitor && <WelcomeStrip trail={featured ?? null} />}
        {featured && <FeaturedTrail trail={featured} onOpenLesson={openLesson} />}
        {!visitor && trails.length > 0 && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]" data-testid="dashboard-main">
            <TrailCards trails={trails} pages={passport.pages} finished={trails.filter((t) => t.status === 'done').length} onOpen={openTrail} />
            <div className="flex min-w-0 flex-col gap-5" data-testid="dashboard-side">
              <WeeklyGoal done={dashboard.weekly} />
              <AchievementsPanel
                pages={passport.pages}
                medals={passport.medals}
                stamps={passport.totals.stamps}
                onOpenTrail={(id) => {
                  const trail = trails.find((x) => x.id === id);
                  if (trail) openTrail(trail);
                }}
              />
              <LiveClassesCard describeLesson={describeLesson} />
            </div>
          </div>
        )}
        <CourseCarousel courses={video.courses} />
      </main>
    </div>
  );
}
