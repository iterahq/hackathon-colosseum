/**
 * The lives layer of the lesson, mounted BESIDE the player and behind an error boundary: if anything
 * here throws (no auth, no query client, a broken backend) the boundary renders nothing, the view
 * stays null and the lesson is exactly what it was before lives existed.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { LinkWalletDialog } from '@/components/wallet/LinkWalletDialog';
import { useCrystals, useSpendCrystals } from '@/hooks/useCrystals';
import { useLives } from '@/hooks/useLives';
import { LIFE_CRYSTALS } from '@/types/crystals';
import { usePurchase } from '@/hooks/usePurchase';
import { useShop } from '@/hooks/useShop';
import { showLivesGate } from '@/utils/lives';
import { LivesBoundary } from './LivesBoundary';
import { OutOfLivesGate } from './OutOfLivesGate';

export interface LessonLivesHandle {
  /** A wrong answer settled: costs one life, once per attempt id. */
  lose: (attemptId: string, activityId: string) => void;
  /** The lesson was finished just now. */
  endLesson: () => void;
}

export interface LessonLivesView {
  current: number;
  max: number;
  /** Lives granted for a zero-mistake day, once the server said so. */
  bonus: number;
  /** Crystals credited since the lesson ended (the difference of the balance, read from `GET /crystals`). */
  crystals: number;
  outfit: string | null;
  /** The out-of-lives pause (or its purchase) is covering the lesson. */
  gateOpen: boolean;
}

interface Props {
  ref?: Ref<LessonLivesHandle>;
  lessonId: string | undefined;
  /** The verdict footer is up. */
  reviewingVerdict: boolean;
  lessonCompleted: boolean;
  onChange: (view: LessonLivesView | null) => void;
  onLeave: () => void;
}

const REFILL = 'life_refill';
const SHOP_PREFETCH_DELAY_MS = 6000;

function RefillPrice({ children }: { children: (label: string | null, title: string, pending: boolean) => ReactNode }) {
  const shop = useShop();
  const item = shop.data?.find((i) => i.key === REFILL);
  return <>{children(item?.priceLabel ?? null, item?.title ?? '', shop.isPending)}</>;
}

/** Reads the shop list while the lesson runs, so the gate's button already has its price when it opens; it waits a few seconds so the lesson reads go first. */
function ShopPrefetch() {
  const [released, setReleased] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReleased(true), SHOP_PREFETCH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);
  useShop({ enabled: released });
  return null;
}

function Layer({ ref, lessonId, reviewingVerdict, lessonCompleted, onChange, onLeave }: Props) {
  const { active, lives, secondsToNext, lose, endLesson, wallet, outfit, chain, assetUrl, refetch } = useLives();
  const purchase = usePurchase();
  const crystals = useCrystals();
  const spendCrystals = useSpendCrystals();
  const refetchCrystals = crystals.refetch;
  const [bonus, setBonus] = useState(0);
  const [earned, setEarned] = useState(0);
  const balance = useRef<number | null>(null);
  balance.current = crystals.data?.balance ?? balance.current;
  const [linking, setLinking] = useState(false);
  const visit = useRef(Date.now().toString(36));
  useEffect(() => (setBonus(0), setEarned(0)), [lessonId]);

  useImperativeHandle(
    ref,
    () => ({
      // The player's attempt counter restarts with the page, so the visit is part of the id:
      // without it a retry after a reload would repeat an id the server already charged.
      lose: (attemptId, activityId) => lose(`${attemptId}:${visit.current}`, activityId, lessonId),
      endLesson: () => {
        if (!lessonId) return;
        const before = balance.current;
        void endLesson(lessonId).then(async (granted) => {
          setBonus(granted);
          // The lesson-end answer carries no crystal credit: re-read the balance and show the difference.
          // A second read catches what the day stamp credits a moment later.
          for (const wait of [0, 2500]) {
            if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
            const after = (await refetchCrystals()).data?.balance;
            if (before !== null && typeof after === 'number' && after > before) setEarned(after - before);
          }
        });
      },
    }),
    [lose, endLesson, lessonId, refetchCrystals]
  );

  const out = showLivesGate({ active, lives: lives?.current ?? null, reviewingVerdict, lessonCompleted });
  // The purchase outlives the empty bar: its success moment stays up after the lives came back.
  const gateOpen = out || (active && purchase.state.phase !== 'idle');
  const current = lives?.current ?? null;
  const max = lives?.max ?? null;

  useEffect(() => {
    onChange(active && current !== null && max !== null ? { current, max, bonus, crystals: earned, outfit, gateOpen } : null);
  }, [active, current, max, bonus, earned, outfit, gateOpen, onChange]);
  useEffect(() => () => onChange(null), [onChange]);


  if (!gateOpen || !lives) return active ? <ShopPrefetch /> : null;
  return (
    <RefillPrice>
      {(priceLabel, title, pricePending) => (
        <>
          {out && (
            <OutOfLivesGate
              lives={lives}
              secondsToNext={secondsToNext}
              priceLabel={priceLabel}
              pricePending={pricePending}
              hasWallet={Boolean(wallet)}
              outfit={outfit}
              chainUrl={chain?.explorerUrl ?? assetUrl}
              busy={purchase.busy || linking}
              onRefill={() => void purchase.buy(REFILL)}
              onConnect={() => setLinking(true)}
              onLeave={onLeave}
              crystals={
                crystals.data
                  ? { price: crystals.data.prices.life ?? LIFE_CRYSTALS, balance: crystals.data.balance, busy: spendCrystals.isPending, failed: spendCrystals.isError, onBuy: () => spendCrystals.mutate({ itemKey: 'life', qty: 1 }, { onSuccess: () => void refetch() }) }
                  : null
              }
            />
          )}
          {linking && <LinkWalletDialog onClose={() => setLinking(false)} />}
          <PurchaseDialog state={purchase.state} itemTitle={title} itemKind="life" outfit={outfit} onRetry={purchase.retry} onFund={() => void purchase.fund()} onClose={purchase.reset} />
        </>
      )}
    </RefillPrice>
  );
}

export function LessonLives(props: Props) {
  return (
    <LivesBoundary>
      <Layer {...props} />
    </LivesBoundary>
  );
}
