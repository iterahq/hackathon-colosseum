import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INPUT, LABEL, Notice, Skeleton } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useSetProfilePublic } from '@/hooks/usePrivacy';
import { useTalentListing, useTalentStatus } from '@/hooks/useTalent';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { CONTACT_FIELDS, EMPTY_CONTACT, type ContactDraft, type ContactField } from '@/types/privacy';
import { CONTACT_MAX, checkContact } from '@/utils/contact';
import { HEADLINE_MAX, optInErrorKey } from '@/utils/talent';

const INPUT_TYPE: Record<ContactField, string> = { email: 'email', telegram: 'text', linkedin: 'url', link: 'url' };

/**
 * The learner's own control over the talent board. Never listed by default. At the moment of choice it says what
 * becomes visible, to whom, and how to leave; the contact is typed here, sent, and never drawn again.
 */
export function TalentOptIn() {
  const { t } = useI18n();
  const status = useTalentStatus();
  const { list, unlist } = useTalentListing();
  const setProfile = useSetProfilePublic();
  const [draft, setDraft] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [changing, setChanging] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (status.isPending && status.fetchStatus !== 'idle') return <Skeleton className="h-40" />;
  if (!status.data) return null;
  const state = status.data;
  const headline = draft ?? state.headline ?? '';
  const busy = list.isPending || unlist.isPending || setProfile.isPending;
  // `publicProfile` null: a backend from before the switch, where a listing never needed it.
  const profilePrivate = state.publicProfile === false;
  const saved = state.contactKinds ?? [];
  const contactKnown = state.publicProfile != null;
  const asking = contactKnown && (!state.listed || changing || saved.length === 0);
  const check = checkContact(contact);
  const forget = () => {
    setContact(EMPTY_CONTACT);
    setChanging(false);
    setAttempted(false);
    list.reset();
  };
  const fail = (error: unknown) => setFailure(optInErrorKey(bountyErrorCode(error)));
  const send = () => list.mutate({ headline, contact: asking ? check.payload : undefined }, { onSuccess: forget, onError: fail });
  const save = () => {
    setFailure(null);
    setAttempted(true);
    if (asking && (check.empty || check.invalid.length > 0)) return;
    // The profile is switched on by this click and no other: the sentence above the button says so.
    if (profilePrivate) setProfile.mutate({ isPublic: true }, { onSuccess: send, onError: fail });
    else send();
  };
  const remove = () => {
    setFailure(null);
    unlist.mutate(undefined, { onSuccess: () => (setDraft(null), forget()), onError: fail });
  };
  const looked = state.companiesLooked ?? 0;
  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-3 p-4 sm:p-5`} aria-labelledby="talent-optin-title" data-testid="talent-optin">
      <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('talent.pageTitle')}</span>
      <h2 id="talent-optin-title" className="[font:700_28px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{t('talent.optin.title')}</h2>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]" data-testid="talent-optin-body">{t(contactKnown ? 'privacy.talent.body' : 'talent.optin.body')}</p>
      <p className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="talent-optin-state">{t(state.listed ? 'talent.optin.state.listed' : 'talent.optin.state.unlisted')}</p>
      {state.listed && contactKnown && saved.length > 0 && (
        <p className="[font:500_14px/1.4_Inter] text-[#C9BFB0]" data-testid="talent-optin-looked">{looked === 0 ? t('privacy.looked.none') : looked === 1 ? t('privacy.looked.one') : t('privacy.looked.other', { n: looked })}</p>
      )}
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
      {(state.mayList || state.listed) && contactKnown && (
        <fieldset className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[#2E2A25] p-3.5" data-testid="talent-contact" data-asking={asking}>
          <legend className={`${LABEL} px-1`}>{t('privacy.contact.legend')}</legend>
          <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#3FD17F]/40 bg-[#3FD17F]/5 p-3" data-testid="talent-contact-notice">
            <p className="[font:600_14px/1.45_Inter] text-[#F4EDE2]">{t('privacy.contact.notice')}</p>
            <p className="[font:400_13px/1.45_Inter] text-[#A0978A]">{t('privacy.contact.company')}</p>
          </div>
          {!asking ? (
            <div className="flex flex-col items-start gap-2">
              <p className="[font:500_14px/1.4_Inter] text-[#C9BFB0]" data-testid="talent-contact-saved">{t('privacy.contact.saved', { kinds: saved.map((kind) => t(`privacy.contact.kind.${kind}`)).join(', ') })}</p>
              <button type="button" className={`${BTN_SECONDARY} ${BTN_SMALL}`} onClick={() => setChanging(true)} data-testid="talent-contact-change">{t('privacy.contact.change')}</button>
            </div>
          ) : (
            <>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {CONTACT_FIELDS.map((field) => {
                  const bad = check.invalid.includes(field) && (attempted || contact[field].trim().length > 3);
                  return (
                    <label key={field} className="flex min-w-0 flex-col gap-1.5">
                      <span className={LABEL}>{t(`privacy.contact.${field}`)}</span>
                      <input
                        className={INPUT}
                        type={INPUT_TYPE[field]}
                        value={contact[field]}
                        maxLength={CONTACT_MAX[field]}
                        placeholder={t(`privacy.contact.placeholder.${field}`)}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-invalid={bad}
                        onChange={(event) => setContact((current) => ({ ...current, [field]: event.target.value }))}
                        data-testid={`talent-contact-${field}`}
                      />
                      {bad && <span role="alert" className="[font:500_13px_Inter] text-[#E0655A]" data-testid={`talent-contact-${field}-error`}>{t(`privacy.contact.err.${field}`)}</span>}
                    </label>
                  );
                })}
              </div>
              {attempted && check.empty && <span role="alert" className="[font:500_13px_Inter] text-[#E0655A]" data-testid="talent-contact-required">{t('privacy.contact.err.required')}</span>}
              {state.listed && saved.length > 0 && (
                <button type="button" className="self-start [font:600_12px_JetBrains_Mono] text-[#A0978A] underline-offset-2 hover:underline" onClick={forget} data-testid="talent-contact-keep">{t('privacy.contact.keep')}</button>
              )}
            </>
          )}
        </fieldset>
      )}
      {profilePrivate && !state.listed && state.mayList && <Notice tone="info" testId="talent-optin-needs-public">{t('privacy.talent.needsPublic')}</Notice>}
      {failure && <Notice tone="error" testId="talent-optin-error">{t(failure)}</Notice>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {(state.mayList || state.listed) && (
          <button type="button" className={`${BTN_PRIMARY} ${BTN_SMALL}`} disabled={busy} onClick={save} data-testid="talent-optin-save">
            {busy && (list.isPending || setProfile.isPending) ? t('talent.optin.saving') : t(state.listed ? 'talent.optin.update' : profilePrivate ? 'privacy.talent.listPublic' : 'talent.optin.list')}
          </button>
        )}
        {state.listed && (
          <button type="button" className={`${BTN_SECONDARY} ${BTN_SMALL}`} disabled={busy} onClick={remove} data-testid="talent-optin-remove">
            {t(contactKnown ? 'privacy.talent.leave' : 'talent.optin.remove')}
          </button>
        )}
        <Link to="/talent" className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="talent-optin-board">
          {t('talent.optin.board')}
        </Link>
      </div>
    </section>
  );
}
