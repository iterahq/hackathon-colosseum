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

  // Welcome-card stat tiles — João Pedro's design gives each signal its OWN
  // accent (more colorful than the all-evergreen version). We stay on the
  // brand's sanctioned gamification tokens: streak = clay flame (--streak),
  // XP = evergreen-hi (--xp), badges = clay/gold trophy, completed = menta.
  // Each tile gets a faint tinted icon-chip + matching glyph + matching number.
  const tiles = [
    {
      icon: Flame,
      n: stats?.streakDays ?? 0,
      l: t('stats.streak'),
      ic: 'text-streak',
      chip: 'bg-streak/10 border-streak/25',
    },
    {
      icon: Sparkles,
      n: stats?.totalXp ?? 0,
      l: t('stats.xp'),
      ic: 'text-evergreen-hi',
      chip: 'bg-evergreen/10 border-evergreen/30',
    },
    {
      icon: Trophy,
      n: stats?.badgeCount ?? 0,
      l: t('stats.badges'),
      ic: 'text-warning',
      chip: 'bg-warning/10 border-warning/25',
    },
    {
      icon: ListChecks,
      n: stats?.completedActivities ?? 0,
      l: t('stats.completed'),
      ic: 'text-menta',
      chip: 'bg-menta/10 border-menta/25',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl bg-card border border-border p-5 md:p-6 relative overflow-hidden"
      data-testid="stats-card"
    >
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-evergreen-soft border border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold truncate">
              {t('home.welcome')}, {name}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Crown className="w-3 h-3 text-evergreen-hi" /> Itera
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {tiles.map((s, i) => (
            <div key={i} className="rounded-2xl bg-obsidiana/60 p-3 border border-border">
              <div
                className={`w-8 h-8 rounded-xl border flex items-center justify-center ${s.chip}`}
              >
                <s.icon className={`w-4 h-4 ${s.ic}`} />
              </div>
              <div className={`font-display font-bold text-2xl mt-2.5 ${s.ic}`}>
                {loading ? '–' : s.n}
              </div>
              <div className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground mt-0.5">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
