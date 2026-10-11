import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INPUT, LABEL, Notice, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useTalentListing, useTalentStatus } from '@/hooks/useTalent';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { HEADLINE_MAX, optInErrorKey } from '@/utils/talent';

/** The learner's own control over the talent board. Never listed by default; a refusal says why in plain words. */
export function TalentOptIn() {
  const { t } = useI18n();
  const status = useTalentStatus();
  const { list, unlist } = useTalentListing();
  const [draft, setDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (status.isPending && status.fetchStatus !== 'idle') return <Skeleton className="h-40" />;
  if (!status.data) return null;
  const state = status.data;
  const headline = draft ?? state.headline ?? '';
  const busy = list.isPending || unlist.isPending;
  const save = () => {
    setFailure(null);
    list.mutate(headline, { onError: (error) => setFailure(optInErrorKey(bountyErrorCode(error))) });
  };
  const remove = () => {
    setFailure(null);
    unlist.mutate(undefined, { onSuccess: () => setDraft(null), onError: (error) => setFailure(optInErrorKey(bountyErrorCode(error))) });
  };
  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-3 p-4 sm:p-5`} aria-labelledby="talent-optin-title" data-testid="talent-optin">
      <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('talent.pageTitle')}</span>
      <h2 id="talent-optin-title" className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('talent.optin.title')}</h2>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('talent.optin.body')}</p>
      <p className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="talent-optin-state">{t(state.listed ? 'talent.optin.state.listed' : 'talent.optin.state.unlisted')}</p>
      {!state.mayList && state.reason && !state.listed && <Notice tone="info" testId="talent-optin-reason">{t(`talent.optin.reason.${state.reason}`)}</Notice>}
      {(state.mayList || state.listed) && (
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>{t('talent.optin.headline')}</span>
          <input
            className={INPUT}
            value={headline}
            maxLength={HEADLINE_MAX}
            placeholder={t('talent.optin.headline.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
            data-testid="talent-optin-headline"
          />
          <span className="flex flex-wrap justify-between gap-2 [font:500_12px_JetBrains_Mono] text-[#A0978A]">
            <span>{t('talent.optin.hint')}</span>
            <span data-testid="talent-optin-counter">{t('talent.optin.counter', { n: [...headline].length })}</span>
          </span>
        </label>
      )}
      {failure && <Notice tone="error" testId="talent-optin-error">{t(failure)}</Notice>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {(state.mayList || state.listed) && (
          <button type="button" className={`${BTN_PRIMARY} ${BTN_SMALL}`} disabled={busy} onClick={save} data-testid="talent-optin-save">
            {busy && list.isPending ? t('talent.optin.saving') : t(state.listed ? 'talent.optin.update' : 'talent.optin.list')}
          </button>
        )}
        {state.listed && (
          <button type="button" className={`${BTN_SECONDARY} ${BTN_SMALL}`} disabled={busy} onClick={remove} data-testid="talent-optin-remove">
            {t('talent.optin.remove')}
          </button>
        )}
        <Link to="/talent" className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="talent-optin-board">
          {t('talent.optin.board')}
        </Link>
      </div>
    </section>
  );
}
