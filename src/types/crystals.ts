/** Phoenix Crystals and the learner's theme (background, icon colour, profile border). `crystals` edge function. */
export type BorderStyle = 'solid' | 'gradient' | 'conic' | 'dashed' | 'double';

/** A profile border drawn from data on top of the avatar's own ring. */
export interface AvatarBorder {
  style: BorderStyle;
  colors: string[];
  glow: boolean;
  animated: boolean;
}

export type ThemeSlot = 'background' | 'icon' | 'border';

export interface CrystalEarnRule {
  reason: string;
  crystals: number;
  label: string;
}

export interface CrystalLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

export interface ThemeItem {
  key: string;
  slot: ThemeSlot;
  /** Hex of a background or an icon colour; null for a border. */
  color: string | null;
  title: string;
  description: string;
  priceCrystals: number | null;
  isDefault: boolean;
  owned: boolean;
  equipped: boolean;
  /** False for a signature border: it only comes with its avatar. */
  forSale: boolean;
  /** Key of the avatar this border comes with, when it is a signature border. */
  includedWith: string | null;
  border: AvatarBorder | null;
}

export interface ThemeChoice {
  key: string;
  color: string;
}

export interface Theme {
  background: ThemeChoice;
  icon: ThemeChoice;
  border: { key: string; title: string; border: AvatarBorder | null } | null;
}

export interface CrystalsSnapshot {
  balance: number;
  explorerUrl: string | null;
  prices: Record<string, number>;
  earnRules: CrystalEarnRule[];
  ledger: CrystalLedgerEntry[];
  theme: Theme;
  themeItems: ThemeItem[];
  mocked: boolean;
}

export interface SpendResult {
  balance: number;
  itemKey: string;
  /** Raw `theme` of the answer when a theme item was bought. */
  theme: Theme | null;
}

export const DEFAULT_THEME: Theme = {
  background: { key: 'bg_obsidian', color: '#0A0908' },
  icon: { key: 'icon_green', color: '#3FD17F' },
  border: null,
};

/** The price of one life in crystals when the backend does not say. */
export const LIFE_CRYSTALS = 5;
