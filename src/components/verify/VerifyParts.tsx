import { ChevronDown } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { RawAccount } from '@/components/chain/RawAccount';
import { INPUT, LABEL } from '@/components/bounty/bountyUi';
import { BTN_SECONDARY, BTN_SMALL, CARD, FOCUS } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { looksLikeAddress } from '@/lib/chain/base58';

export const P = '[font:400_14px/1.6_Inter] text-[#C9BFB0]';
export const MONO_TEXT = 'break-all [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]';

export type SectionTone = 'default' | 'gold';

interface SectionChrome {
  sections: Record<string, { icon?: ReactNode; tone?: SectionTone }>;
  onOpen?: (id: string) => void;
}

const NO_CHROME: SectionChrome = { sections: {} };

/** Gives each VerifySection its icon, tone and open callback by id, so the section files stay untouched. */
export const VerifySectionChrome = createContext<SectionChrome>(NO_CHROME);

/** A long-form section, folded under its title; a link to its hash (from the quest cards) opens it. */
export function VerifySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { hash } = useLocation();
  const { sections, onOpen } = useContext(VerifySectionChrome);
  const { icon, tone = 'default' } = sections[id] ?? {};
  const gold = tone === 'gold';
  const targeted = hash === `#${id}`;
  const [open, setOpen] = useState(targeted);
  useEffect(() => {
    if (targeted) setOpen(true);
  }, [targeted]);
  useEffect(() => {
    if (open) onOpen?.(id);
  }, [open, id, onOpen]);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className={`${CARD} group flex min-w-0 scroll-mt-4 flex-col ${gold ? 'border-l-[3px] border-l-[#F2C66D]' : ''}`}
      data-testid={`verify-${id}`}
    >
      <summary className={`flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[14px] px-4 py-2 hover:bg-[#1C1916] ${FOCUS} [&::-webkit-details-marker]:hidden`} data-testid={`verify-${id}-summary`}>
        {icon && <span aria-hidden className={`shrink-0 ${gold ? 'text-[#F2C66D]' : 'text-[#3FD17F]'}`}>{icon}</span>}
        <h2 id={`${id}-title`} className="min-w-0 flex-1 [font:700_20px/1.15_'Barlow_Condensed'] text-[#F4EDE2]">{title}</h2>
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-[#A0978A] transition-transform group-open:rotate-180" />
        <span className="sr-only">{open ? t('verify.fold.close') : t('verify.fold.open')}</span>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 [font:400_14px/1.55_Inter] text-[#C9BFB0] marker:text-[#3FD17F]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 [font:400_14px/1.55_Inter] text-[#C9BFB0] marker:text-[#5E574E]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={`${LABEL}`}>{label}</span>
      <div className={MONO_TEXT}>{children}</div>
    </div>
  );
}

export function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" className={`${INPUT} [font:500_13px_JetBrains_Mono]`} />
    </label>
  );
}

export function RunButton({ label, busyLabel, busy, onClick, disabled }: { label: string; busyLabel: string; busy: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div>
      <button type="button" onClick={onClick} disabled={busy || disabled} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

/** An address box: type or keep the sample, press the button, the account is read by the browser and decoded. */
export function AddressLookup({ initial, label, testId }: { initial: string; label: string; testId: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = looksLikeAddress(trimmed);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <TextInput label={label} value={value} onChange={setValue} />
      {!valid && trimmed.length > 0 && <p role="alert" className="[font:500_12px_Inter] text-[#E0655A]">{t('verify.badAddress')}</p>}
      <RunButton label={t('verify.read')} busyLabel={t('verify.read')} busy={false} disabled={!valid} onClick={() => setSubmitted(trimmed)} />
      {submitted && (
        <RawAccount key={submitted} address={submitted} />
      )}
    </div>
  );
}
