import { Handshake, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { Bounty, PrizeTera } from '@/types/bounty';

const OPEN: ReadonlySet<Bounty['status']> = new Set(['open', 'claimed', 'submitted']);

/** What may be said about the prize of a bounty right now. `unfunded`: the reward was locked by a transaction that left the Tera out. */
export function prizeState(bounty: Pick<Bounty, 'status' | 'prizeTera'>): 'none' | 'offered' | 'unfunded' | 'minting' | 'delivered' {
  const prize = bounty.prizeTera;
  if (!prize) return 'none';
  if (prize.asset) return 'delivered';
  if (bounty.status === 'paid') return prize.funded ? 'minting' : 'unfunded';
  if (OPEN.has(bounty.status) && !prize.funded) return 'unfunded';
  return 'offered';
}

/**
 * The brand Tera a sponsor added to a bounty, shown beside the SOL reward: the composed art, the brand, and that it is
 * a prize bound to the wallet that gets paid. It never promises a Tera whose cost was not paid.
 */
export function PrizeTeraTag({ bounty, size = 'md', link = true }: { bounty: Pick<Bounty, 'status' | 'prizeTera'>; size?: 'md' | 'lg'; link?: boolean }) {
  const { t } = useI18n();
  const prize = bounty.prizeTera;
  const state = prizeState(bounty);
  if (!prize || state === 'none') return null;
  const art = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';
  const line = state === 'unfunded' ? t('prize.unfunded') : state === 'delivered' ? t('prize.delivered') : state === 'minting' ? t('prize.minting') : t('prize.bound');
  const body = (
    <>
      {prize.imageUrl ? <img src={prize.imageUrl} alt="" loading="lazy" className={`${art} shrink-0 rounded-[10px] bg-[#0A0908] object-cover ${state === 'unfunded' ? 'opacity-40 grayscale' : ''}`} /> : <span className={`${art} shrink-0 rounded-[10px] border border-dashed`} style={{ borderColor: prize.accent }} />}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.08em]" style={{ color: prize.accent }}>
          <Handshake size={11} aria-hidden />
          {t('prize.tag')}
        </span>
        <span className="truncate [font:700_18px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('prize.name', { brand: prize.brand })}</span>
        <span className={`inline-flex items-center gap-1 [font:500_11px/1.2_JetBrains_Mono] ${state === 'unfunded' ? 'text-[#F2C66D]' : 'text-[#A0978A]'}`}>
          {state !== 'unfunded' && <Lock size={10} aria-hidden />}
          {line}
        </span>
      </span>
    </>
  );
  const box = 'inline-flex min-w-0 max-w-full items-center gap-2.5 rounded-[12px] border border-dashed bg-[#141210] py-1.5 pl-1.5 pr-3';
  if (link && prize.asset) {
    return (
      <Link to={`/c/${prize.asset}`} className={`${box} hover:bg-[#1C1916] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]`} style={{ borderColor: prize.accent }} data-testid="prize-tera" data-state={state} onClick={(event) => event.stopPropagation()}>
        {body}
      </Link>
    );
  }
  return (
    <span className={box} style={{ borderColor: prize.accent }} data-testid="prize-tera" data-state={state}>
      {body}
    </span>
  );
}

/** The cost lines of the prize, for the sponsor, before any wallet signs. */
export function prizeLamports(prize: Pick<PrizeTera, 'mintLamports' | 'feeLamports' | 'totalLamports'> | null | undefined): number {
  return prize ? prize.totalLamports || prize.mintLamports + prize.feeLamports : 0;
}
