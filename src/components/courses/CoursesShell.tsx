import type { ReactNode } from 'react';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import '@/components/dashboard/dashboard.css';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { useUserStats } from '@/hooks/useContent';

const GRID = {
  backgroundColor: '#0A0908',
  backgroundImage: 'linear-gradient(#15130F 1px,transparent 1px),linear-gradient(90deg,#15130F 1px,transparent 1px)',
  backgroundSize: '26px 26px',
} as const;

/** Page chrome of the Courses area: the dashboard's grid background, its top bar and its content column. */
export function CoursesShell({ children }: { children: ReactNode }) {
  const visitor = useAccessLevel().level === 'visitor';
  const stats = useUserStats({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });

  return (
    <div className="dash-root min-h-screen overflow-x-clip text-[#F4EDE2]" style={GRID}>
      <DashboardTopBar
        xp={stats.data?.totalXp ?? null}
        achievements={visitor ? 0 : achievements.isPending ? null : achievements.earnedCount}
        activities={stats.data?.completedActivities ?? null}
        streak={stats.data?.streakDays ?? null}
      />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pb-14 pt-6 sm:px-8 xl:px-20 xl:pt-10">{children}</main>
    </div>
  );
}
