import type { ReactNode } from 'react';

const RARITY_DOT: Record<string, string> = { common: '#A0978A', rare: '#5AA9E6', epic: '#B07CE8', legendary: '#E8B84A', mythic: '#E8604A' };
const NEUTRAL_DOT = '#5E574E';

interface Props {
  label: string;
  title?: string;
  on: boolean;
  disabled?: boolean;
  rarity?: string;
  testId?: string;
  onPick: () => void;
  children: ReactNode;
}

/** One round chip: the picture, a small name under it, a check badge and a highlighted tile when worn. */
export function LookChip({ label, title, on, disabled, rarity, testId, onPick, children }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={title ?? label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => !on && onPick()}
      className={`flex min-h-11 w-full flex-col items-center gap-1 rounded-xl border p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#3FD17F] disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-[#3FD17F] bg-[#3FD17F]/10' : 'border-transparent hover:border-[#3A352F] hover:bg-[#1B1815]'}`}
    >
      <span className="relative flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
        {children}
        {on && (
          <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#141210] bg-[#3FD17F] text-[#0A0908]">
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.2 2.2 4.8-5" /></svg>
          </span>
        )}
        {rarity && rarity !== 'common' && !on && <span aria-hidden className="absolute right-0 top-0 h-2 w-2 rounded-full" style={{ background: RARITY_DOT[rarity] ?? NEUTRAL_DOT }} />}
      </span>
      <span className="max-w-full truncate font-mono text-[10px] text-[#C9BFB0] sm:text-[11px]">{label}</span>
    </button>
  );
}
