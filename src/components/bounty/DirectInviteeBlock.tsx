import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INPUT, LABEL, Notice } from '@/components/bounty/bountyUi';
import { BTN_SECONDARY, BTN_SMALL, CARD } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { bountyErrorCode } from '@/services/bounty.service';
import { INVITEE_ERROR_CODES, inviteeVerdict } from '@/utils/directBounty';
import { looksLikeAddress } from '@/utils/credential';
import type { InviteeCheck } from '@/types/bounty';

export interface InviteeCheckState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: InviteeCheck | undefined;
}

/** The refusal code that makes posting pointless (the server will refuse the same wallet), or null. */
export function blockingInviteeCode(state: InviteeCheckState): string | null {
  if (state.isError) {
    const code = bountyErrorCode(state.error);
    if (code && (INVITEE_ERROR_CODES as readonly string[]).includes(code)) return code;
  }
  return state.data && !state.data.directAvailable ? 'direct_unavailable' : null;
}

function Verdict({ state, trail }: { state: InviteeCheckState; trail: string }) {
  const { t } = useI18n();
  const blocked = blockingInviteeCode(state);
  if (blocked) return <Notice tone="error" testId="invitee-blocked">{t(`bounty.post.err.${blocked}`)}</Notice>;
  if (state.isPending) return <Notice testId="invitee-checking">{t('bounty.post.direct.checking')}</Notice>;
  if (state.isError || !state.data) return <Notice tone="error" testId="invitee-check-failed">{t('bounty.post.direct.checkFailed')}</Notice>;
  const verdict = inviteeVerdict(state.data);
  const min = state.data.requirement.minDays;
  if (verdict.kind === 'eligible') return <Notice tone="good" testId="invitee-eligible">{t('bounty.post.direct.eligible', { n: verdict.daysDone, trail, min })}</Notice>;
  if (verdict.kind === 'unknown_learner') return <Notice tone="error" testId="invitee-not-eligible">{t('bounty.post.direct.unknown', { trail, min })}</Notice>;
  const key = verdict.reason === 'not_enough_days' ? 'bounty.post.direct.notEnough' : 'bounty.post.direct.noCert';
  return <Notice tone="error" testId="invitee-not-eligible">{t(key, { n: verdict.daysDone, trail, min })}</Notice>;
}

function WalletInput({ onSet }: { onSet: (wallet: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const value = draft.trim();
  const bad = value !== '' && !looksLikeAddress(value);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>{t('bounty.post.direct.inputLabel')}</span>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" className={`${INPUT} [font-family:JetBrains_Mono]`} aria-invalid={bad} data-testid="invitee-input" />
      </label>
      {bad && <span className="[font:500_12px/1.4_Inter] text-[#E0655A]" data-testid="invitee-input-bad">{t('bounty.post.direct.badWallet')}</span>}
      <button type="button" disabled={value === '' || bad} onClick={() => onSet(value)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="invitee-apply">
        {t('bounty.post.direct.apply')}
      </button>
    </div>
  );
}

/** The top of the post form: who the bounty is for (or a way to name someone), and whether that wallet can accept. */
export function DirectInviteeBlock({ invitee, onSet, onRemove, check, trail }: { invitee: string | null; onSet: (wallet: string) => void; onRemove: () => void; check: InviteeCheckState; trail: string }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!invitee) {
    return (
      <section className={`${CARD} order-[-1] flex flex-col gap-3 p-4 sm:p-5`} data-testid="bounty-post-direct-add">
        {asking ? (
          <WalletInput onSet={(wallet) => { setAsking(false); onSet(wallet); }} />
        ) : (
          <button type="button" onClick={() => setAsking(true)} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="invitee-add">
            {t('bounty.post.direct.add')}
          </button>
        )}
      </section>
    );
  }
  return (
    <section className={`${CARD} order-[-1] flex flex-col gap-3 !border-[#F2C66D]/60 p-4 sm:p-5`} data-testid="bounty-post-direct">
      <h2 className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2] [overflow-wrap:anywhere]" data-testid="bounty-post-direct-title">
        {t('bounty.post.direct.title', { wallet: shortAddress(invitee) })}
      </h2>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.post.direct.body')}</p>
      <p className="[font:500_12px/1.4_JetBrains_Mono] text-[#A0978A] [overflow-wrap:anywhere]" data-testid="bounty-post-direct-wallet">{invitee}</p>
      <Verdict state={check} trail={trail} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link to={`/u/${invitee}`} className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline" data-testid="bounty-post-direct-profile">
          {t('bounty.post.direct.profile')} →
        </Link>
        <button type="button" onClick={onRemove} className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] hover:underline" data-testid="bounty-post-direct-remove">
          {t('bounty.post.direct.remove')}
        </button>
      </div>
    </section>
  );
}

