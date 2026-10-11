import { Gem, Heart, Infinity as InfinityIcon, Lock } from 'lucide-react';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { loreOf } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { LivesState, ShopItem } from '@/types/shop';
import { avatarOf, avatarState } from '@/utils/avatarShop';
import { isOffSeason } from '../avatarRows';
import { ShopArt } from '../ShopArt';
import { FOCUS, HEART, RARITY_EDGE } from '../shopStyles';
import { SwatchPreview } from '../SwatchTile';
import { tileLine, type TileTone } from './arcadeModel';

const TONE: Record<TileTone, string> = { price: 'text-[#F4EDE2]', mine: 'text-[#3FD17F]', equipped: 'text-[#0A0908] bg-[#3FD17F] px-1.5 rounded-full', free: 'text-[#3FD17F]', muted: 'text-[#8A8175]' };

/** The picture of an item at tile size; the inspector draws the same thing larger. */
export function ArcadeArt({ item, avatar, lives, large = false }: { item: ShopItem; avatar: Avatar; lives: LivesState | null; large?: boolean }) {
  const face = avatarOf(item);
  if (face) return <LearnerAvatar avatar={face} size="lg" thumb className={large ? '!h-40 !w-40' : '!h-[60px] !w-[60px]'} />;
  if (item.kind === 'life') {
    const pack = item.lifePack;
    return (
      <span className={`flex items-center gap-1 [font:700_26px/1_'Barlow_Condensed'] text-[#F4EDE2] ${large ? 'scale-[2]' : ''}`}>
        <Heart size={20} fill={HEART} stroke={HEART} aria-hidden />
        {pack?.unlimitedDays ? <InfinityIcon size={24} aria-hidden /> : pack?.addLives ? `+${pack.addLives}` : '+1'}
      </span>
    );
  }
  if (item.kind === 'border' || item.kind === 'background' || item.kind === 'app_icon') {
    return (
      <span className={large ? 'scale-[2.4]' : ''}>
        <SwatchPreview item={item} avatar={avatar} />
      </span>
    );
  }
  return (
    <span className={`flex items-center justify-center ${large ? 'scale-[1.8]' : 'scale-[0.8]'}`}>
      <ShopArt item={item} lives={lives} />
    </span>
  );
}

interface Props {
  item: ShopItem;
  selected: boolean;
  avatar: Avatar;
  lives: LivesState | null;
  onSelect: (item: ShopItem) => void;
  className?: string;
}

/** One slot of the grid: art on a rarity glow, the name, and one short line. Selecting it puts it on the inspector. */
export function ArcadeTile({ item, selected, avatar, lives, onSelect, className = '' }: Props) {
  const { t, locale } = useI18n();
  const from = item.forSale === false && !item.owned && item.includedWith ? loreOf(item.includedWith, locale)?.name : null;
  const line = from ? { text: from, tone: 'muted' as const, crystal: false } : tileLine(item, t);
  const name = (item.avatar ? loreOf(item.key, locale)?.name : null) ?? item.title;
  const edge = item.avatar && !item.avatar.free ? RARITY_EDGE[item.avatar.rarity] : '#2E2A25';
  const dim = item.kind === 'avatar' && (avatarState(item) === 'soldout' || isOffSeason(item));
  const locked = item.forSale === false && !item.owned;
  const state = item.equipped && item.owned ? 'equipped' : item.owned ? 'owned' : 'buy';

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      aria-label={`${name} · ${line.text}`}
      data-testid="shop-item"
      data-item={item.key}
      data-kind={item.kind}
      data-state={state}
      data-selected={selected || undefined}
      className={`group relative flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-[12px] border bg-[#141210] px-1 pb-1.5 pt-2 transition-[transform,border-color] duration-100 motion-reduce:transition-none ${className} ${selected ? 'z-[1] -translate-y-0.5 border-[#3FD17F] shadow-[0_0_0_1px_#3FD17F,0_8px_20px_-8px_#3FD17F80]' : 'border-[#262320] hover:-translate-y-0.5 hover:border-[#5E574E]'} ${FOCUS}`}
      style={{ borderBottomWidth: 3, borderBottomColor: selected ? '#3FD17F' : edge }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[72px]" style={{ background: `radial-gradient(60% 70% at 50% 45%, ${edge}33, transparent 70%)` }} />
      <span className={`relative flex h-[64px] w-full items-center justify-center ${dim ? 'opacity-45 grayscale' : locked ? 'opacity-60' : ''}`}>
        <ArcadeArt item={item} avatar={avatar} lives={lives} />
      </span>
      <span className="line-clamp-1 w-full text-center [font:700_15px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{name}</span>
      <span className={`flex max-w-full items-center gap-1 truncate [font:700_10px/1.5_JetBrains_Mono] uppercase tracking-[.04em] ${TONE[line.tone]}`} data-testid="tile-line" data-tone={line.tone}>
        {line.crystal && <Gem size={10} className="flex-none text-[#3FD17F]" aria-hidden />}
        {from && <Lock size={9} className="flex-none" aria-hidden />}
        <span className="truncate">{line.text}</span>
      </span>
    </button>
  );
}
