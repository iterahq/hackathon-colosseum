import type { ReactNode } from 'react';

export const MENU_ITEM = 'hd-focus flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-3 text-left [font:500_13px_JetBrains_Mono] text-[#F4EDE2] hover:bg-[#1C1916]';

/** A mono section label over a group of items, with a hairline above it. */
export function MenuSection({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div role="group" aria-label={label} className={first ? 'p-1.5' : 'border-t border-[#262320] p-1.5'}>
      <span className="block px-3 pb-1 pt-1.5 [font:600_9px_JetBrains_Mono] uppercase tracking-[.12em] text-[#A0978A]" aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

/** The small muted row at the foot of the help group: legal pages side by side. */
export function MenuLegalRow({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 flex items-center gap-1 px-1">{children}</div>;
}

export const MENU_LEGAL = 'hd-focus flex min-h-11 flex-1 items-center rounded-[8px] px-2 [font:500_11px_JetBrains_Mono] text-[#A0978A] hover:bg-[#1C1916] hover:text-[#F4EDE2]';
