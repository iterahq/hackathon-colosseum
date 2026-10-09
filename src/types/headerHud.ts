import type { HeaderIconName } from '@/consts/headerIconPaths';

export type NavId = 'trails' | 'courses' | 'passport' | 'files' | 'shop';

export interface HeaderNavItem {
  id: NavId;
  to: string;
  key: string;
  icon: HeaderIconName;
}

export interface LevelView {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** 0–1 share of the current level already earned. */
  ratio: number;
}

export interface WalletIdentity {
  address: string;
  chain: string;
  network: string | null;
}
