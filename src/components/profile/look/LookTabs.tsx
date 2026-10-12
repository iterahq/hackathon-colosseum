import { useRef, type KeyboardEvent } from 'react';
import { useI18n } from '@/i18n';
import { ALL_LOOK_TABS, type LookTab } from '@/utils/profileLook';

interface Props {
  tab: LookTab;
  /** The tabs on show, in order. */
  tabs?: readonly LookTab[];
  counts: Record<LookTab, number>;
  onTab: (tab: LookTab) => void;
}

/** Segmented tablist with roving tabindex: arrows, Home and End move and select. */
export function LookTabs({ tab, tabs: LOOK_TABS = ALL_LOOK_TABS, counts, onTab }: Props) {
  const { t } = useI18n();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const i = LOOK_TABS.indexOf(tab);
    const n = LOOK_TABS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onTab(LOOK_TABS[next]);
    refs.current[LOOK_TABS[next]]?.focus();
  };
  return (
    <div role="tablist" aria-label={t('avatar.look.tabs')} onKeyDown={onKey} className="flex w-full min-w-0 gap-1 rounded-[14px] border border-[#262320] bg-[#0F0D0B] p-1" data-testid="look-tabs">
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
          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1.5 font-sans text-[13px] font-semibold sm:gap-1.5 sm:px-2 sm:text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F] ${tab === id ? 'bg-[#262320] text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'}`}
        >
          <span className="min-w-0 truncate">{t(`avatar.look.tab.${id}`)}</span>
          <span className="shrink-0 font-mono text-[11px] text-[#A0978A]">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}
