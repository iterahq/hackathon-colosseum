import { useRef, type KeyboardEvent } from 'react';
import { useI18n } from '@/i18n';
import type { LookTab } from '@/utils/profileLook';

const LOOK_TABS: LookTab[] = ['faces', 'looks', 'gear'];

interface Props {
  tab: LookTab;
  counts: Record<LookTab, number>;
  onTab: (tab: LookTab) => void;
}

/** Segmented tablist with roving tabindex: arrows, Home and End move and select. */
export function LookTabs({ tab, counts, onTab }: Props) {
  const { t } = useI18n();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const i = LOOK_TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
    if (next < 0) return;
    e.preventDefault();
    onTab(LOOK_TABS[next]);
    refs.current[LOOK_TABS[next]]?.focus();
  };
  return (
    <div role="tablist" aria-label={t('avatar.look.tabs')} onKeyDown={onKey} className="flex gap-1 rounded-[14px] border border-[#262320] bg-[#0F0D0B] p-1" data-testid="look-tabs">
      {LOOK_TABS.map((id) => (
        <button
          key={id}
          ref={(el) => { refs.current[id] = el; }}
          type="button"
          role="tab"
          id={`look-tab-${id}`}
          aria-selected={tab === id}
          aria-controls="look-panel"
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onTab(id)}
          data-testid={`look-tab-${id}`}
          className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 font-sans text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F] ${tab === id ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}
        >
          {t(`avatar.look.tab.${id}`)}
          <span className="font-mono text-[11px] text-[#A0978A]">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}
