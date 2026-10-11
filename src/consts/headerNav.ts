import { FOCUS_BUILD } from '@/config/focus';
import type { HeaderNavItem } from '@/types/headerHud';

/** Every learner tab the app has; the focus build shows the five of the loop, the full build adds the courses. */
export const FULL_HEADER_NAV: readonly HeaderNavItem[] = [
  { id: 'trails', to: '/', key: 'header.nav.trails', icon: 'trails' },
  { id: 'courses', to: '/catalog', key: 'header.nav.courses', icon: 'courses' },
  { id: 'passport', to: '/passport', key: 'header.nav.passport', icon: 'passport' },
  { id: 'shop', to: '/shop', key: 'header.nav.shop', icon: 'shop' },
  { id: 'bounties', to: '/bounties', key: 'header.nav.bounties', icon: 'solana' },
  { id: 'verify', to: '/verify', key: 'header.nav.verify', icon: 'verify' },
];

/** Trails · Certifications · Bounties · Shop · Verify: the loop in reading order. */
export const FOCUS_HEADER_NAV: readonly HeaderNavItem[] = [
  { id: 'trails', to: '/', key: 'header.nav.trails', icon: 'trails' },
  { id: 'passport', to: '/passport', key: 'header.nav.passport', icon: 'passport' },
  { id: 'bounties', to: '/bounties', key: 'header.nav.bounties', icon: 'solana' },
  { id: 'shop', to: '/shop', key: 'header.nav.shop', icon: 'shop' },
  { id: 'verify', to: '/verify', key: 'header.nav.verify', icon: 'verify' },
];

export const HEADER_NAV: readonly HeaderNavItem[] = FOCUS_BUILD ? FOCUS_HEADER_NAV : FULL_HEADER_NAV;
