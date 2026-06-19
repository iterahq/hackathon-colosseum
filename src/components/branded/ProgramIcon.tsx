/**
 * The colored "face" of a program card — a rounded gradient tile with a lucide
 * icon, mirroring João's CourseIcon visual.
 */
import { Code, Layers, Rocket, Cpu, Sparkles, BookOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  code: Code,
  layers: Layers,
  rocket: Rocket,
  cpu: Cpu,
  sparkles: Sparkles,
  book: BookOpen,
};

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
}: {
  icon?: string;
  /** Legacy gradient-class prop — ignored under the flat brand (kept for callers). */
  color?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = ICON_MAP[icon] ?? Code;
  // Flat brand: evergreen-soft tile + evergreen-hi glyph (no gradient/glow).
  return (
    <div
      className={`relative flex items-center justify-center bg-evergreen-soft border border-evergreen/30 ${SIZES[size]} ${className}`}
    >
      <Icon className={`${ICON_SIZES[size]} text-evergreen-hi`} />
    </div>
  );
}
