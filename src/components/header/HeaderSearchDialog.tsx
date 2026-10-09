import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { SearchIndex } from '@/types/headerSearch';
import { flatten, search } from '@/utils/globalSearch';
import { HeaderSearchRow } from './HeaderSearchRow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: SearchIndex;
}

const KBD = 'rounded border border-[#2E2A25] px-1.5 py-0.5 [font:600_10px_JetBrains_Mono] text-[#A0978A]';

/** Command palette over the page: type to filter, arrows move, Enter opens, Esc closes; focus stays trapped inside. */
export function HeaderSearchDialog({ open, onOpenChange, index }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => search(index, query), [index, query]);
  const flat = useMemo(() => flatten(groups), [groups]);
  const enabled = useMemo(() => flat.map((e, i) => (e.disabled ? -1 : i)).filter((i) => i >= 0), [flat]);
  const active = enabled.includes(cursor) ? cursor : (enabled[0] ?? -1);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (i: number) => {
    const entry = flat[i];
    if (!entry || entry.disabled) return;
    onOpenChange(false);
    navigate(entry.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (enabled.length === 0) return;
      const at = enabled.indexOf(active);
      setCursor(enabled[(at + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
    }
  };

  let row = -1;
  const empty = flat.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="hd-fade fixed inset-0 z-50 bg-[#0A0908]/75 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="search-dialog"
          className="hd-fade fixed left-1/2 top-[max(12px,8vh)] z-50 flex max-h-[calc(100dvh-24px)] w-[min(620px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] border border-[#2E2A25] border-b-[5px] border-b-[#262320] bg-[#141210] text-[#F4EDE2] shadow-[0_24px_60px_rgba(0,0,0,.6)]"
        >
          <Dialog.Title className="sr-only">{t('search.title')}</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-[#262320] px-4">
            <span aria-hidden className="[font:700_16px_JetBrains_Mono] text-[#3FD17F]">{'>'}</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('search.placeholder')}
              role="combobox"
              aria-expanded="true"
              aria-controls="header-search-list"
              aria-activedescendant={active >= 0 ? `header-search-${active}` : undefined}
              aria-label={t('search.title')}
              data-testid="search-input"
              autoComplete="off"
              spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent [font:500_15px_JetBrains_Mono] text-[#F4EDE2] outline-none placeholder:text-[#A0978A]/70"
            />
            <Dialog.Close className={`hd-focus ${KBD} min-h-8`} aria-label={t('search.close')}>
              ESC
            </Dialog.Close>
          </div>
          <ul ref={list} id="header-search-list" role="listbox" aria-label={t('search.title')} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {empty && (
              <li role="presentation" data-testid="search-empty" className="px-3 py-8 text-center">
                <span className="block [font:700_22px_'Barlow_Condensed'] uppercase tracking-[.04em]">{t('search.empty.title', { q: query.trim() })}</span>
                <span className="mt-1 block [font:500_12px_JetBrains_Mono] text-[#A0978A]">{`> ${t('search.empty.hint')}`}</span>
              </li>
            )}
            {groups.map((g) => (
              <li key={g.id} role="presentation" className="mb-1">
                <span className="block px-3 pb-1 pt-2 [font:600_10px_JetBrains_Mono] uppercase tracking-[.12em] text-[#A0978A]">{g.label}</span>
                <ul role="group" aria-label={g.label}>
                  {g.entries.map((entry) => {
                    row += 1;
                    const i = row;
                    return <HeaderSearchRow key={entry.id} entry={entry} id={`header-search-${i}`} active={i === active} lockedLabel={t('search.locked')} onHover={() => setCursor(i)} onPick={() => pick(i)} />;
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-4 border-t border-[#262320] px-4 py-2.5 [font:500_10px_JetBrains_Mono] text-[#A0978A] sm:flex">
            <span className="flex items-center gap-1.5"><kbd className={KBD}>↑↓</kbd>{t('search.hint.move')}</span>
            <span className="flex items-center gap-1.5"><kbd className={KBD}>↵</kbd>{t('search.hint.open')}</span>
            <span className="flex items-center gap-1.5"><kbd className={KBD}>esc</kbd>{t('search.hint.close')}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
