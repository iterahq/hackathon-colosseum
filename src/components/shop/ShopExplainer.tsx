import { useI18n } from '@/i18n';
import type { ShopItem } from '@/types/shop';
import { MONO_LABEL } from './shopStyles';

const HOW: Record<string, readonly string[]> = {
  avatar: ['explain.pay', 'explain.avatar.chain', 'explain.avatar.soulbound', 'explain.circuit'],
  avatarFree: ['explain.avatarFree.chain'],
  avatarEarn: ['explain.avatarEarn.chest', 'explain.avatarEarn.bound', 'explain.avatarEarn.verify'],
  outfit: ['explain.pay', 'explain.outfit.chain', 'explain.outfit.note', 'explain.circuit'],
  ink: ['explain.pay', 'explain.ink.chain', 'explain.ink.note', 'explain.circuit'],
  frame: ['explain.pay', 'explain.frame.chain', 'explain.frame.note', 'explain.circuit'],
  life: ['explain.life.chain', 'explain.pay', 'explain.life.note', 'explain.circuit'],
};

const explainerKind = (item: ShopItem): string => (item.kind !== 'avatar' ? item.kind : item.avatar?.free ? 'avatarFree' : item.avatar?.earnOnly ? 'avatarEarn' : 'avatar');

/** "What changes" and "how it works" for one kind of item, in short concrete sentences. */
export function ShopExplainer({ item, className = '' }: { item: ShopItem; className?: string }) {
  const { t } = useI18n();
  const kind = explainerKind(item);
  const royalty = kind === 'avatar' ? (item.avatar?.royaltyBps ?? 0) : 0;
  return (
    <div className={`flex flex-col gap-3 rounded-[12px] border border-[#262320] bg-[#0F0D0B] p-3.5 text-left ${className}`} data-testid="shop-explainer" data-kind={kind}>
      <div>
        <p className={`${MONO_LABEL} text-[#3FD17F]`}>{t('explain.changes')}</p>
        <p className="mt-1 [font:500_14px/1.45_Inter] text-[#F4EDE2]">{t(`explain.${kind}.changes`)}</p>
      </div>
      <div>
        <p className={`${MONO_LABEL} text-[#A0978A]`}>{t('explain.how')}</p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {HOW[kind].map((key) => (
            <li key={key} className="flex gap-2 [font:400_13px/1.45_Inter] text-[#C9BFB0]">
              <span aria-hidden className="mt-[7px] h-1 w-1 flex-none rounded-full bg-[#5E574E]" />
              {t(key)}
            </li>
          ))}
          {royalty > 0 && (
            <li className="flex gap-2 [font:400_13px/1.45_Inter] text-[#C9BFB0]" data-testid="explain-resale-fee">
              <span aria-hidden className="mt-[7px] h-1 w-1 flex-none rounded-full bg-[#5E574E]" />
              {t('shelf.card.fee', { pct: String(Math.round(royalty / 10) / 10) })}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
