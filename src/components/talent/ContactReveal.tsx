import { useState } from 'react';
import { CopyButton } from '@/components/passport/CopyButton';
import { BTN_SECONDARY, BTN_SMALL, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { revealContact } from '@/services/talent.service';
import { CONTACT_FIELDS, type RevealedContact } from '@/types/privacy';

const KNOWN = ['reveal_limit', 'not_listed', 'no_contact', 'not_a_company', 'own_listing'];

interface Props {
  wallet: string;
  /** False for a listing made before contacts existed: there is nothing to ask for. */
  hasContact: boolean;
  revealsPerDay: number;
  onRevealed?: (left: number) => void;
}

/**
 * The one place a contact is ever drawn: a company asks, the server checks and records it, and the answer lives in
 * this component's state until the card goes away. Plain text with a copy button: never a link, never a URL.
 */
export function ContactReveal({ wallet, hasContact, revealsPerDay, onRevealed }: Props) {
  const { t } = useI18n();
  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!hasContact) return <p className="[font:400_13px/1.4_Inter] text-[#A0978A]" data-testid="contact-none">{t('privacy.reveal.none')}</p>;
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const answer = await revealContact(wallet);
      setContact(answer.contact);
      setLeft(answer.revealsLeftToday);
      onRevealed?.(answer.revealsLeftToday);
    } catch (failure) {
      const code = bountyErrorCode(failure) ?? '';
      setError(t(KNOWN.includes(code) ? `privacy.reveal.err.${code}` : 'privacy.reveal.err.generic', { max: revealsPerDay }));
    } finally {
      setBusy(false);
    }
  };
  if (!contact) {
    return (
      <div className="flex flex-col gap-1.5" data-testid="contact-reveal" data-state="hidden">
        <button type="button" className={`${BTN_SECONDARY} ${BTN_SMALL}`} disabled={busy} onClick={() => void ask()} data-testid="contact-show">
          {t(busy ? 'privacy.reveal.loading' : 'privacy.reveal.show')}
        </button>
        {error && <p role="alert" className="[font:500_13px/1.4_Inter] text-[#F2C66D]" data-testid="contact-error">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-[#3FD17F] bg-[#0A0908] p-3" data-testid="contact-reveal" data-state="shown">
      <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('privacy.reveal.title')}</span>
      <dl className="flex min-w-0 flex-col gap-1.5">
        {CONTACT_FIELDS.filter((field) => contact[field]).map((field) => (
          <div key={field} className="flex min-w-0 items-center gap-2" data-testid="contact-row" data-field={field}>
            <dt className="w-[72px] flex-none [font:600_11px_JetBrains_Mono] uppercase tracking-[.06em] text-[#A0978A]">{t(`privacy.contact.kind.${field}`)}</dt>
            <dd className="min-w-0 flex-1 select-all break-all [font:500_13px/1.4_JetBrains_Mono] text-[#F4EDE2]">{contact[field]}</dd>
            <CopyButton value={contact[field] ?? ''} label={t('privacy.reveal.copy')} doneLabel={t('passport.copied')} display="" />
          </div>
        ))}
      </dl>
      <p className="[font:400_12px/1.4_Inter] text-[#A0978A]" data-testid="contact-recorded">{t('privacy.reveal.recorded', { left: left ?? 0 })}</p>
      <button type="button" className="self-start [font:600_12px_JetBrains_Mono] text-[#A0978A] underline-offset-2 hover:underline" onClick={() => setContact(null)} data-testid="contact-hide">
        {t('privacy.reveal.hide')}
      </button>
    </div>
  );
}
