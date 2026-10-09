import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { useUserStats } from '@/hooks/useContent';

/** The learner top bar with its numbers wired: every learner page mounts this one component and nothing else. */
export function AppTopBar() {
  const visitor = useAccessLevel().level === 'visitor';
  const stats = useUserStats({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });

  return (
    <DashboardTopBar
      xp={stats.data?.totalXp ?? null}
      achievements={visitor ? 0 : achievements.isPending ? null : achievements.earnedCount}
      activities={stats.data?.completedActivities ?? null}
      streak={stats.data?.streakDays ?? null}
    />
  );
}
