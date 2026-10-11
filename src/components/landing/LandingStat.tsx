import type { ReactNode } from 'react';
import { PANEL } from '@/components/world/worldStyles';

/** One live number; `value` null draws the loading shape so the grid never jumps. */
export function LandingStat({ value, label }: { value: ReactNode | null; label: string }) {
  if (value === null) return <div className={`${PANEL} h-[86px] animate-pulse`} aria-hidden data-testid="landing-stat-loading" />;
  return (
    <div className={`${PANEL} flex min-w-0 flex-col gap-1 px-5 py-4`} data-testid="landing-stat">
      <span className="truncate [font:700_34px/1_'Barlow_Condensed'] text-[#F4EDE2]">{value}</span>
      <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{label}</span>
    </div>
  );
}
