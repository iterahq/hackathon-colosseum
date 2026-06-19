/**
 * Badge collection grid — flat brand medal (evergreen-soft tile, no gradient/glow).
 * Wired to real itera.badges + user_badges via useBadges. Empty-state aware.
 */
import { Award, Lock } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Badge } from '@/types/content';

export function BadgeGrid({ badges, loading }: { badges?: Badge[]; loading?: boolean }) {
  const { t, tText } = useI18n();

  if (loading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{t('common.loading')}</div>;
  }
  if (!badges || badges.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center" data-testid="badges-empty">
        {t('badges.empty')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-6" data-testid="badge-grid">
      {badges.map((b) => (
        <div key={b.id} className="flex flex-col items-center gap-2 text-center">
          <div
            className={`relative w-16 h-16 rounded-2xl flex items-center justify-center ${
              b.earned
                ? 'bg-evergreen-soft border border-evergreen/40'
                : 'bg-obsidiana/60 border border-border'
            }`}
          >
            {b.earned ? (
              <Award className="w-7 h-7 text-evergreen-hi" />
            ) : (
              <Lock className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <span
            className={`text-[12px] leading-tight ${b.earned ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {tText(b.title)}
          </span>
        </div>
      ))}
    </div>
  );
}
