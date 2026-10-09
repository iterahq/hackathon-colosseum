import { Link } from 'react-router-dom';
import { HEADER_NAV } from '@/consts/headerNav';
import { useI18n } from '@/i18n';
import type { NavId } from '@/types/headerHud';
import { HeaderIcon } from './HeaderIcon';

interface Props {
  active: NavId | null;
}

/** Phone navigation: a fixed bottom tab bar with four 44px+ targets, the active one lit green with a top notch. */
export function HeaderTabBar({ active }: Props) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t('header.nav.aria')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#262320] bg-[#0A0908]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      data-testid="header-tab-bar"
    >
      <ul className="grid h-[60px] grid-cols-4">
        {HEADER_NAV.map(({ id, to, key, icon }) => {
          const on = id === active;
          return (
            <li key={id} className="relative">
              {on && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-sm bg-[#3FD17F]" />}
              <Link
                to={to}
                aria-current={on ? 'page' : undefined}
                className={`hd-focus flex h-full min-h-11 flex-col items-center justify-center gap-1 ${on ? 'text-[#3FD17F]' : 'text-[#A0978A]'}`}
              >
                <HeaderIcon name={icon} size={22} />
                <span className="[font:600_10px_JetBrains_Mono] uppercase tracking-[.06em]">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
