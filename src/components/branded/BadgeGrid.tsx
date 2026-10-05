/**
 * Badge collection grid — parity with João Oak's "Your badge collection".
 *
 * Flat-top hexagonal medals (clip-path hexagon):
 *   EARNED = sky→indigo gradient hex with an inner bevel/glow rim, white glyph
 *            centered, and a small circular GREEN check overlay (top-right).
 *   LOCKED = dark obsidian hex with a subtle hairline border + muted glyph.
 * Badge name below each (bold/foreground earned, muted locked).
 *
 * Wired to real itera.badges + user_badges via useBadges (Badge type: .id,
 * .title, .earned). Empty-state + loading aware. The card wrapper + section
 * header ("Your badge collection" / subtitle / See all) live in the parent
 * (HomePage <Section>) — this component renders only the grid of medals.
 */
import {
  Award,
  Lock,
  Check,
  Sparkles,
  Shield,
  Wand2,
  Atom,
  Brain,
  Cloud,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Badge } from '@/types/content';

// Pointy-top hexagon (point at top + bottom, flat vertical-ish left/right edges)
// — matches the orientation in João Pedro's badge mock.
const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

// Deterministic glyph per badge so each medal reads as distinct (mirrors the
// mock's varied icons). Falls back to a generic Award/Lock if unmatched.
const GLYPHS: LucideIcon[] = [Sparkles, Shield, Wand2, Atom, Brain, Cloud];

function glyphFor(badge: Badge, index: number): LucideIcon {
  if (!badge.earned) return Lock;
  return GLYPHS[index % GLYPHS.length] ?? Award;
}

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
    <div
      className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 md:grid-cols-6 md:gap-x-6"
      data-testid="badge-grid"
    >
      {badges.map((b, i) => {
        const Glyph = glyphFor(b, i);
        return (
          <div key={b.id} className="flex flex-col items-center gap-3 text-center">
            {/* Hex medal — pointy-top hexagon with a coloured glow halo on
                earned medals (drop-shadow reads through clip-path; box-shadow
                does not, so the halo lives on the wrapper as a blurred clone). */}
            <div className="relative h-21 w-20">
              {/* Glow halo — a blurred, scaled clone of the hex behind the face.
                  Only on earned medals; reads as a soft coloured aura on the
                  dark background. */}
              {b.earned && (
                <div
                  className="pointer-events-none absolute inset-0 scale-110 bg-linear-to-br/srgb from-sky-400 to-indigo-600 opacity-60 blur-md"
                  style={{ clipPath: HEX_CLIP }}
                  aria-hidden
                />
              )}

              {/* Outer rim — a slightly larger clipped layer behind the face that
                  gives both states a clean hex edge (clip-path eats borders). */}
              <div
                className={`absolute inset-0 ${
                  b.earned
                    ? 'bg-linear-to-br/srgb from-sky-300 to-indigo-700'
                    : 'bg-border'
                }`}
                style={{ clipPath: HEX_CLIP }}
                aria-hidden
              />

              {/* Medal face */}
              <div
                className={`absolute inset-[2px] flex items-center justify-center ${
                  b.earned
                    ? 'bg-linear-to-br/srgb from-sky-400 to-indigo-600'
                    : 'bg-obsidiana'
                }`}
                style={{ clipPath: HEX_CLIP }}
              >
                {/* Inner bevel / top-light glow on earned medals */}
                {b.earned && (
                  <span
                    className="pointer-events-none absolute inset-0 bg-linear-to-b/srgb from-white/35 via-transparent to-transparent"
                    style={{ clipPath: HEX_CLIP }}
                    aria-hidden
                  />
                )}
                <Glyph
                  className={`relative ${
                    b.earned
                      ? 'h-8 w-8 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                      : 'h-6 w-6 text-muted-foreground/70'
                  }`}
                  strokeWidth={b.earned ? 1.75 : 1.5}
                />
              </div>

              {/* Earned check overlay (top-right) */}
              {b.earned && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-evergreen text-obsidiana shadow-xs">
                  <Check className="h-3 w-3" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <span
              className={`text-[12px] leading-tight ${
                b.earned ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
            >
              {tText(b.title)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
