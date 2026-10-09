import { Award, CircleDot, Lock } from 'lucide-react';
import type { SearchEntry } from '@/types/headerSearch';
import { HeaderIcon } from './HeaderIcon';

interface Props {
  entry: SearchEntry;
  id: string;
  active: boolean;
  lockedLabel: string;
  onHover: () => void;
  onPick: () => void;
}

function Glyph({ entry }: { entry: SearchEntry }) {
  if (entry.disabled) return <Lock className="h-4 w-4" aria-hidden />;
  if (entry.icon === 'day') return <CircleDot className="h-4 w-4" aria-hidden />;
  if (entry.icon === 'medal') return <Award className="h-4 w-4" aria-hidden />;
  return <HeaderIcon name={entry.icon && entry.icon !== 'lock' ? entry.icon : 'chevron'} size={16} />;
}

/** One result: icon tile, title, mono subtitle; the active row gets the green notch and an Enter hint. */
export function HeaderSearchRow({ entry, id, active, lockedLabel, onHover, onPick }: Props) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-disabled={entry.disabled || undefined}
      data-testid="search-result"
      onMouseMove={entry.disabled ? undefined : onHover}
      onClick={entry.disabled ? undefined : onPick}
      className={`relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-1.5 ${
        entry.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${active ? 'bg-[#1C1916]' : ''}`}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-sm bg-[#3FD17F]" />}
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#0F0D0B] ${active ? 'text-[#3FD17F]' : 'text-[#A0978A]'}`}>
        <Glyph entry={entry} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate [font:500_14px_Inter] text-[#F4EDE2]">{entry.title}</span>
        {(entry.subtitle || entry.disabled) && (
          <span className="block truncate [font:500_11px_JetBrains_Mono] text-[#A0978A]">
            {entry.disabled ? `${lockedLabel}${entry.subtitle ? ` · ${entry.subtitle}` : ''}` : entry.subtitle}
          </span>
        )}
      </span>
      {active && !entry.disabled && <span className="hidden shrink-0 rounded border border-[#2E2A25] px-1.5 py-0.5 [font:600_10px_JetBrains_Mono] text-[#A0978A] sm:block">↵</span>}
    </li>
  );
}
