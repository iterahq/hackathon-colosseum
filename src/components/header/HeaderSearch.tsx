import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useAchievements } from '@/hooks/useAchievements';
import { useVideoCourses } from '@/hooks/useVideoCourses';
import { useTrailDashboard } from '@/hooks/useTrailDashboard';
import { useI18n } from '@/i18n';
import { buildIndex } from '@/utils/globalSearch';
import { buildHeaderSources } from '@/utils/headerSearchSources';
import { HeaderSearchDialog } from './HeaderSearchDialog';

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

/** The header's search control and its Cmd/Ctrl+K shortcut; the index is built from data the page already loads. */
export function HeaderSearch({ className = '' }: { className?: string }) {
  const { t, tText } = useI18n();
  const visitor = useAccessLevel().level === 'visitor';
  const dashboard = useTrailDashboard({ enabled: !visitor });
  const achievements = useAchievements({ enabled: !visitor });
  const videos = useVideoCourses().courses;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { trails, featured } = dashboard;
  const items = achievements.items;
  const index = useMemo(() => buildIndex(buildHeaderSources({ t, tText, trails, featured, achievements: items, videoCourses: videos })), [t, tText, trails, featured, items, videos]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('header.search.open')}
        aria-haspopup="dialog"
        title={`${t('header.search.open')} (${isMac() ? '⌘K' : 'Ctrl K'})`}
        data-testid="header-search"
        className={`hd-press hd-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#262320] border-b-[3px] border-b-[#2E2A25] bg-[#141210] text-[#A0978A] hover:text-[#F4EDE2] min-[1536px]:h-10 min-[1536px]:w-[240px] min-[1536px]:justify-start min-[1536px]:gap-2.5 min-[1536px]:px-3.5 ${className}`}
      >
        <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-left [font:500_13px_JetBrains_Mono] min-[1536px]:block">{t('header.search.trigger.wide')}</span>
        <kbd className="hidden shrink-0 whitespace-nowrap rounded border border-[#2E2A25] px-1 py-0.5 [font:600_10px_JetBrains_Mono] min-[1536px]:block">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <HeaderSearchDialog open={open} onOpenChange={setOpen} index={index} />
    </>
  );
}
