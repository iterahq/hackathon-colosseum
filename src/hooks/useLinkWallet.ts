/** The "Vincular carteira" flow: connect -> challenge -> signature -> verify -> mint what was waiting -> caches. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { mintPendingRows, requestChallenge, verifyChallenge } from '@/services/linkWallet.service';
import { getCompanion } from '@/services/companion.service';
import { ShopCallError } from '@/services/shopTransport';
import { WalletSignError, connectWallet, signTextMessage } from '@/services/walletSign';

export type LinkPhase = 'idle' | 'connecting' | 'signing' | 'verifying' | 'minting' | 'done' | 'no_wallet' | 'error';
export interface LinkState {
  phase: LinkPhase;
  wallet: string | null;
  remaining: number | null;
  code: string | null;
}

const IDLE: LinkState = { phase: 'idle', wallet: null, remaining: null, code: null };
export const isLinkBusy = (s: LinkState) => s.phase === 'connecting' || s.phase === 'signing' || s.phase === 'verifying' || s.phase === 'minting';

export function useLinkWallet() {
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [state, setState] = useState<LinkState>(IDLE);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const set = useCallback((next: Partial<LinkState>) => alive.current && setState((s) => ({ ...s, ...next })), []);

  const refresh = useCallback(() => {
    for (const key of [['wallet-link'], ['companion'], ['shop'], ['achievements']]) void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient]);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState({ ...IDLE, phase: 'connecting' });
    try {
      const address = await connectWallet();
      if (!address) throw new WalletSignError('failed', 'The wallet did not share its address.');
      const challenge = await requestChallenge(address);
      set({ phase: 'signing' });
      const signature = await signTextMessage(challenge.message);
      set({ phase: 'verifying' });
      const linked = await verifyChallenge(challenge.challengeId, signature);
      set({ wallet: linked.wallet || address });
      if (linked.pendingMints > 0) {
        set({ phase: 'minting', remaining: linked.pendingMints });
        await mintPendingRows(locale, (remaining) => set({ remaining }), linked.pendingMints);
      }
      // The companion mints on its first call; a failure here only delays it.
      await getCompanion(locale).catch(() => null);
      refresh();
      set({ phase: 'done', remaining: 0 });
    } catch (e) {
      if (e instanceof WalletSignError) {
        if (e.reason === 'cancelled') return void set(IDLE);
        if (e.reason === 'no_wallet') return void set({ phase: 'no_wallet' });
        return void set({ phase: 'error', code: 'generic' });
      }
      const code = e instanceof ShopCallError ? e.code : null;
      if (code === 'already_linked') refresh();
      set({ phase: 'error', code: code ?? 'generic' });
    } finally {
      running.current = false;
    }
  }, [locale, refresh, set]);

  return { state, start, reset: useCallback(() => (running.current ? undefined : setState(IDLE)), []) };
}
