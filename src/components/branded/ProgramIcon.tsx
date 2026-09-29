/**
 * The colored "face" of a program card — a rounded gradient tile with a lucide
 * icon, matching João Pedro's "Your in-progress courses" card icons.
 *
 * Each program `icon` maps to a category gradient (green/teal for security &
 * code, purple/magenta for design, magenta/indigo for AI, etc.). The gradient
 * is scoped to THIS card face only (the brand's flat rule still governs panels,
 * headers, CTAs) — the design explicitly uses colorful gradient course icons,
 * which Tainan asked to match 100%.
 */
import {
  Code,
  Layers,
  Rocket,
  Cpu,
  Sparkles,
  BookOpen,
  Shield,
  Wand2,
  Brain,
  Cloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Icon per category key. Exported so other card variants (e.g. the v3
 *  catalog card's flat icon tile) reuse the same icon set instead of
 *  duplicating the literal map. */
export const ICON_MAP: Record<string, LucideIcon> = {
  code: Code,
  layers: Layers,
  rocket: Rocket,
  cpu: Cpu,
  sparkles: Sparkles,
  book: BookOpen,
  shield: Shield,
  wand: Wand2,
  brain: Brain,
  cloud: Cloud,
};

/** Category gradient per icon (mirrors João's course-card palette). */
export const ICON_CATEGORY: Record<string, { gradient: string }> = {
  shield: { gradient: 'from-emerald-400 to-teal-600' },
  code: { gradient: 'from-emerald-400 to-green-700' },
  layers: { gradient: 'from-sky-400 to-indigo-600' },
  cloud: { gradient: 'from-sky-400 to-blue-600' },
  wand: { gradient: 'from-fuchsia-400 to-purple-700' },
  sparkles: { gradient: 'from-fuchsia-500 to-indigo-600' },
  brain: { gradient: 'from-fuchsia-500 to-indigo-600' },
  cpu: { gradient: 'from-violet-400 to-purple-700' },
  rocket: { gradient: 'from-amber-400 to-orange-600' },
  book: { gradient: 'from-emerald-400 to-teal-600' },
};

const DEFAULT_CATEGORY = { gradient: 'from-emerald-400 to-teal-600' };

export function categoryFor(icon = 'code') {
  return ICON_CATEGORY[icon] ?? DEFAULT_CATEGORY;
}

const SIZES = {
  sm: 'w-12 h-12 rounded-xl',
  md: 'w-16 h-16 rounded-2xl',
  lg: 'w-20 h-20 rounded-2xl',
  xl: 'w-24 h-24 rounded-3xl',
} as const;

const ICON_SIZES = { sm: 'w-5 h-5', md: 'w-7 h-7', lg: 'w-9 h-9', xl: 'w-11 h-11' } as const;

export function ProgramIcon({
  icon = 'code',
  size = 'md',
  className = '',
  flat = false,
}: {
  icon?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** Render the flat evergreen tile (legacy look) instead of the gradient. */
  flat?: boolean;
}) {
  const Icon = ICON_MAP[icon] ?? Code;
  if (flat) {
    return (
      <div
        className={`relative flex items-center justify-center bg-evergreen-soft border border-evergreen/30 ${SIZES[size]} ${className}`}
      >
        <Icon className={`${ICON_SIZES[size]} text-evergreen-hi`} />
      </div>
    );
  }
  const { gradient } = categoryFor(icon);
  return (
    <div
      className={`relative flex items-center justify-center bg-gradient-to-br ${gradient} ${SIZES[size]} ${className}`}
    >
      <Icon className={`${ICON_SIZES[size]} text-white`} strokeWidth={2} />
    </div>
  );
}
