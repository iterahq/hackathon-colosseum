/**
 * Badge collection grid — parity with João Pedro's "Your Badge Collection".
 *
 * Hexagonal medals (clip-path hexagon): EARNED = blue gradient hex + white glyph
 * + green check overlay (top-right); LOCKED = dark hex + muted glyph. Badge name
 * below each. Wired to real itera.badges + user_badges via useBadges.
 * Empty-state aware.
 */
import { Award, Lock, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Badge } from '@/types/content';

const HEX = { clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' };

export function BadgeGrid({ badges, loading }: { badges?: Badge[]; loading?: boolean }) {
  const { t, tText } = useI18n();

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">{t('common.loading')}</div>
    );
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
        <div key={b.id} className="flex flex-col items-center gap-2.5 text-center">
          <div className="relative w-16 h-[4.4rem]">
            {/* Hexagonal medal face */}
            <div
              className={`w-full h-full flex items-center justify-center ${
                b.earned
                  ? 'bg-gradient-to-br from-sky-400 to-indigo-600'
                  : 'bg-obsidiana/70 border border-border'
              }`}
              style={b.earned ? HEX : { ...HEX, border: 'none' }}
            >
              {b.earned ? (
                <Award className="w-7 h-7 text-white" />
              ) : (
                <Lock className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            {/* Locked hex needs its own clipped outline (clip-path eats borders) */}
            {!b.earned && (
              <div
                className="absolute inset-0 bg-border"
                style={{ ...HEX, zIndex: -1, transform: 'scale(1.04)' }}
                aria-hidden
              />
            )}
            {/* Earned check overlay (top-right) */}
            {b.earned && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-evergreen text-obsidiana flex items-center justify-center border-2 border-card">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
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
