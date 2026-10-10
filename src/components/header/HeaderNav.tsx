import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { HEADER_NAV } from '@/consts/headerNav';
import { useI18n } from '@/i18n';
import type { NavId } from '@/types/headerHud';

interface Props {
  active: NavId | null;
}

/** Desktop tabs: condensed uppercase labels on the full bar height, a green bar sliding under the active route. */
export function HeaderNav({ active }: Props) {
  const { t } = useI18n();
  const reduced = !!useReducedMotion();

  return (
    <nav aria-label={t('header.nav.aria')} className="hidden h-full items-stretch lg:flex">
      {HEADER_NAV.map(({ id, to, key }) => {
        const on = id === active;
        return (
          <Link
            key={id}
            to={to}
            aria-current={on ? 'page' : undefined}
            className={`hd-focus relative inline-flex min-h-11 items-center px-2.5 [font:700_16px_'Barlow_Condensed'] uppercase tracking-[.06em] transition-colors ${
              on ? 'text-[#F4EDE2]' : 'text-[#A0978A] hover:text-[#F4EDE2]'
            }`}
          >
            {t(key)}
            {on && (
              <motion.span
                layoutId="hd-nav-indicator"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                className="absolute inset-x-2 -bottom-px h-[3px] rounded-t-sm bg-[#3FD17F]"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
