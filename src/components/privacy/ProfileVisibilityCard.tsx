import { useState } from 'react';
import { Notice } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { usePrivacy, useSetProfilePublic } from '@/hooks/usePrivacy';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { PrivateProfile } from './PrivateProfile';

/**
 * The learner's own switch over the profile page: what becomes visible, to whom, and how to undo it, with what a
 * stranger sees right now. Hiding the profile while listed on the talent board asks first: it deletes the contact.
 */
export function ProfileVisibilityCard() {
  const { t } = useI18n();
  const privacy = usePrivacy();
  const set = useSetProfilePublic();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const state = privacy.data;
  if (!state) return null;
  const on = state.publicProfile;
  const change = (isPublic: boolean, leaveBoard = false) => {
    setFailed(false);
    set.mutate(
      { isPublic, leaveBoard },
      {
        onSuccess: () => setConfirming(false),
        onError: (error) => (bountyErrorCode(error) === 'listed_on_talent_board' ? setConfirming(true) : setFailed(true)),
      },
    );
  };
  const toggle = () => (on && state.talentListed ? setConfirming(true) : change(!on));

  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-3 p-4 sm:p-5`} aria-labelledby="privacy-card-title" data-testid="privacy-card" data-public={on}>
      <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('privacy.card.label')}</span>
      <h2 id="privacy-card-title" className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('privacy.card.title')}</h2>
      <p className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="privacy-card-state">{t(on ? 'privacy.card.public' : 'privacy.card.private')}</p>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('privacy.card.body')}</p>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('privacy.card.undo')}</p>
      <button type="button" role="switch" aria-checked={on} disabled={set.isPending} onClick={toggle} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border-2 px-3 py-2 text-left ${on ? 'border-[#3FD17F] bg-[#3FD17F]/10' : 'border-[#2E2A25] bg-[#0A0908]'} ${FOCUS}`} data-testid="privacy-switch">
        <span className="[font:600_15px/1.3_Inter] text-[#F4EDE2]">{t('privacy.card.switch')}</span>
        <span className="flex flex-none items-center gap-2">
          <span className="[font:700_11px_JetBrains_Mono] uppercase tracking-[.08em]" style={{ color: on ? '#3FD17F' : '#A0978A' }}>{set.isPending ? t('privacy.card.saving') : t(on ? 'privacy.card.on' : 'privacy.card.off')}</span>
          <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${on ? 'bg-[#3FD17F]' : 'bg-[#2E2A25]'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-[#F4EDE2] transition-[left] motion-reduce:transition-none ${on ? 'left-6' : 'left-1'}`} />
          </span>
        </span>
      </button>
      {state.source !== 'chosen' && <p className="[font:400_13px/1.45_Inter] text-[#A0978A]" data-testid="privacy-card-source">{t(`privacy.card.source.${state.source}`)}</p>}
      {confirming && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#F2C66D] bg-[#F2C66D]/10 p-3" role="alertdialog" aria-labelledby="privacy-listed-title" data-testid="privacy-listed-confirm">
          <p id="privacy-listed-title" className="[font:700_16px/1.3_Inter] text-[#F4EDE2]">{t('privacy.card.listed.title')}</p>
          <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('privacy.card.listed.body')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={`${BTN_PRIMARY} ${BTN_SMALL}`} disabled={set.isPending} onClick={() => change(false, true)} data-testid="privacy-listed-yes">{t('privacy.card.listed.confirm')}</button>
            <button type="button" className={`${BTN_SECONDARY} ${BTN_SMALL}`} disabled={set.isPending} onClick={() => setConfirming(false)} data-testid="privacy-listed-no">{t('privacy.card.listed.cancel')}</button>
          </div>
        </div>
      )}
      {failed && <Notice tone="error" testId="privacy-card-error">{t('privacy.card.failed')}</Notice>}
      <div className="flex flex-col gap-2">
        <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('privacy.card.preview')}</span>
        {on ? <p className="rounded-[14px] border border-[#262320] bg-[#141210] p-3 [font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="privacy-preview-public">{t('privacy.card.preview.public')}</p> : <PrivateProfile preview />}
      </div>
      <p className="[font:400_13px/1.45_Inter] text-[#A0978A]">{t('privacy.card.certs')}</p>
    </section>
  );
}
