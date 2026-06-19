/**
 * Gamification stats card — streak / XP / badges / activities — João's
 * dashboard welcome+stats panel, wired to real itera.xp_events / user_badges /
 * progress via useUserStats.
 */
import { motion } from 'framer-motion';
import { Flame, Trophy, Sparkles, ListChecks, Crown } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import type { UserStats } from '@/types/content';

export function StatsCard({ stats, loading }: { stats?: UserStats; loading?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? 'Learner';
  const initials = (user?.email ?? 'IT').slice(0, 2).toUpperCase();

  const tiles = [
    { icon: Flame, n: stats?.streakDays ?? 0, l: t('stats.streak'), c: 'text-orange-400' },
    { icon: Sparkles, n: stats?.totalXp ?? 0, l: t('stats.xp'), c: 'text-menta' },
    { icon: Trophy, n: stats?.badgeCount ?? 0, l: t('stats.badges'), c: 'text-amber-300' },
    { icon: ListChecks, n: stats?.completedActivities ?? 0, l: t('stats.completed'), c: 'text-sky-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl bg-card border border-border p-5 md:p-6 relative overflow-hidden"
      data-testid="stats-card"
    >
      <div className="absolute top-0 right-0 w-40 h-40 bg-verde-tech/20 rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-menta to-verde-tech text-obsidiana font-display font-bold flex items-center justify-center">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold truncate">
              {t('home.welcome')}, {name}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Crown className="w-3 h-3 text-menta" /> Itera
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {tiles.map((s, i) => (
            <div key={i} className="rounded-2xl bg-obsidiana/60 p-3 border border-border">
              <s.icon className={`w-4 h-4 ${s.c}`} />
              <div className="font-display font-bold text-2xl mt-2">{loading ? '–' : s.n}</div>
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
