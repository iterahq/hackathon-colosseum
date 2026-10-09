import { useNavigate } from 'react-router-dom';
import { VisitorBanner } from '@/components/branded/VisitorBanner';
import { AchievementsPanel } from '@/components/dashboard/AchievementsPanel';
import { CourseCarousel } from '@/components/dashboard/CourseCarousel';
import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import { FeaturedTrail } from '@/components/dashboard/FeaturedTrail';
import { LiveClassesCard } from '@/components/dashboard/LiveClassesCard';
import { TrailCards } from '@/components/dashboard/TrailCards';
import { WeeklyGoal } from '@/components/dashboard/WeeklyGoal';
import '@/components/dashboard/dashboard.css';
import { useUserStats } from '@/hooks/useContent';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { usePassportView } from '@/hooks/usePassportView';
import { useCatalog } from '@/hooks/useCatalog';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
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
  const stats = useUserStats({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });
  const passport = usePassportView();
  const catalog = useCatalog();

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
  const rest = trails.filter((t) => t.id !== featured?.id);

  return (
    <div className="dash-root min-h-screen text-[#F4EDE2]" style={GRID}>
      <DashboardTopBar
        xp={stats.data?.totalXp ?? null}
        achievements={visitor ? 0 : achievements.isPending ? null : achievements.earnedCount}
        activities={stats.data?.completedActivities ?? null}
        streak={stats.data?.streakDays ?? null}
      />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-12 px-4 pb-14 pt-6 sm:px-8 xl:px-20 xl:pt-10">
        {visitor && <VisitorBanner />}
        {!visitor && dashboard.isPending && <Skeleton />}
        {!visitor && dashboard.isError && <DashboardEmpty kind="error" onAction={() => void dashboard.refetch()} />}
        {!visitor && !dashboard.isPending && !dashboard.isError && trails.length === 0 && (
          <DashboardEmpty kind="empty" onAction={() => navigate('/catalog')} />
        )}
        {featured && <FeaturedTrail trail={featured} onOpenLesson={openLesson} />}
        {rest.length > 0 && (
          <TrailCards trails={rest} total={trails.length} finished={trails.filter((t) => t.status === 'done').length} onOpen={openTrail} />
        )}
        {!visitor && (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <AchievementsPanel
              pages={passport.pages}
              medals={passport.medals}
              stamps={passport.totals.stamps}
              featuredId={passport.featuredId}
              onOpenTrail={(id) => {
                const trail = trails.find((x) => x.id === id);
                if (trail) openTrail(trail);
              }}
            />
            <div className="flex min-w-0 flex-col gap-5">
              <WeeklyGoal done={dashboard.weekly} />
              <LiveClassesCard describeLesson={describeLesson} />
            </div>
          </div>
        )}
        <CourseCarousel
          courses={catalog.data ?? []}
          onOpen={(course) => navigate(course.alreadyEnrolled && !visitor ? `/program/${course.slug}` : '/catalog')}
        />
      </main>
    </div>
  );
}
