import type { HeaderNavItem } from '@/types/headerHud';

export const HEADER_NAV: readonly HeaderNavItem[] = [
  { id: 'trails', to: '/', key: 'header.nav.trails', icon: 'trails' },
  { id: 'courses', to: '/catalog', key: 'header.nav.courses', icon: 'courses' },
  { id: 'passport', to: '/passport', key: 'header.nav.passport', icon: 'passport' },
  { id: 'shop', to: '/shop', key: 'header.nav.shop', icon: 'shop' },
  { id: 'bounties', to: '/bounties', key: 'header.nav.bounties', icon: 'solana' },
  { id: 'verify', to: '/verify', key: 'header.nav.verify', icon: 'verify' },
];
