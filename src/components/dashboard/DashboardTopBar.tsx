import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CrystalChip } from '@/components/crystals/CrystalChip';
import { HeaderHud } from '@/components/header/HeaderHud';
import { HeaderIdentity } from '@/components/header/HeaderIdentity';
import { HeaderLocale } from '@/components/header/HeaderLocale';
import { HeaderLocaleCompact } from '@/components/header/HeaderLocaleCompact';
import { HeaderNav } from '@/components/header/HeaderNav';
import { HeaderSearch } from '@/components/header/HeaderSearch';
import { HeaderTabBar } from '@/components/header/HeaderTabBar';
import '@/components/header/header.css';
import { activeNavOf } from '@/utils/headerHud';

interface Props {
  xp: number | null;
  achievements: number | null;
  activities: number | null;
  /** Days in a row with XP, from `useUserStats`; omitted callers show a dimmed flame. */
  streak?: number | null;
}

/** The learner's top bar: wordmark, route tabs, search, the lives chip and the identity pill; a bottom tab bar on phones. Callers may still pass their numbers: they live in the welcome strip and the account menu now. */
export function DashboardTopBar(_props: Props) {
  const { pathname } = useLocation();
  const active = activeNavOf(pathname);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        data-scrolled={scrolled}
        className={`hd-root sticky top-0 z-30 border-b ${
          scrolled ? 'border-[#2E2A25] bg-[#0A0908]/80 shadow-[0_12px_30px_rgba(0,0,0,.35)] backdrop-blur-md' : 'border-[#262320] bg-[#0A0908]'
        }`}
      >
        <div className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-8 xl:px-20">
          <div className="flex h-full min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/" className="hd-focus flex shrink-0 items-center rounded-sm [font:700_28px_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2]" aria-label="Itera">
              ITERA<span className="text-[#3FD17F]">/</span>
            </Link>
            <HeaderNav active={active} />
          </div>
          <div className="flex min-w-0 flex-1 justify-end">
            {/* From 1440 px the field sits on the middle of the page, not of the free space between the two groups. */}
            <HeaderSearch className="max-sm:hidden min-[1440px]:absolute min-[1440px]:left-[calc(50%-120px)] min-[1440px]:top-3 min-[1440px]:w-[240px]" />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <HeaderLocale className="max-sm:hidden" />
            <HeaderLocaleCompact className="sm:hidden" />
            <HeaderHud />
            <CrystalChip />
            <HeaderIdentity />
          </div>
        </div>
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-[#3FD17F] via-[#F2C66D]/60 to-transparent transition-opacity duration-300 ${
            scrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </header>
      <HeaderTabBar active={active} />
    </>
  );
}
