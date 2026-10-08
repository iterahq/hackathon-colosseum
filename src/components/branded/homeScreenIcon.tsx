import { createElement, type ReactNode } from 'react';
import { Atom, Brain, Check, Cloud, Crown, Flame, GraduationCap, ListChecks, Lock, Shield, Sparkles, Trophy, Wand2, type LucideIcon } from 'lucide-react';
import type { CatalogIcon, HomeIcon } from '@iterahq/shell-core';
import { catalogScreenIcon } from './catalogScreenIcon';

/** One glyph per earned medal, by its place in the grid, so each reads as distinct. */
const MEDALS: LucideIcon[] = [Sparkles, Shield, Wand2, Atom, Brain, Cloud];
const TILES = { streak: Flame, xp: Sparkles, badges: Trophy, completed: ListChecks } as const;

/** The glyphs of the universal home screen on the web: the lucide icons the old dashboard drew, at the sizes it drew them. */
export function homeScreenIcon(icon: HomeIcon | CatalogIcon): ReactNode {
  switch (icon.kind) {
    case 'hero':
      return <Sparkles className="w-3 h-3" />;
    case 'crown':
      return <Crown className="w-3 h-3" />;
    case 'streak':
    case 'xp':
    case 'badges':
    case 'completed':
      return createElement(TILES[icon.kind], { className: 'w-4 h-4' });
    case 'browse':
      return <GraduationCap className="w-4 h-4" />;
    case 'badge-check':
      return <Check className="h-3 w-3" strokeWidth={3.5} />;
    case 'badge':
      return icon.earned
        ? createElement(MEDALS[icon.index % MEDALS.length], { className: 'relative h-8 w-8 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]', strokeWidth: 1.75 })
        : <Lock className="relative h-6 w-6" strokeWidth={1.5} />;
    default:
      return catalogScreenIcon(icon);
  }
}
