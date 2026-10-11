import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { RawAccount } from '@/components/chain/RawAccount';
import { SECTION_TITLE, INPUT, LABEL } from '@/components/bounty/bountyUi';
import { BTN_SECONDARY, BTN_SMALL, CARD } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { looksLikeAddress } from '@/lib/chain/base58';

export const P = '[font:400_14px/1.6_Inter] text-[#C9BFB0]';
export const MONO_TEXT = 'break-all [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]';

/** A long-form section, folded under its title; a link to its hash (from the summary card or the nav) opens it. */
export function VerifySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { hash } = useLocation();
  const targeted = hash === `#${id}`;
  const [open, setOpen] = useState(targeted);
  useEffect(() => {
    if (targeted) setOpen(true);
  }, [targeted]);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className={`${CARD} group flex min-w-0 scroll-mt-4 flex-col p-4 sm:p-5`}
      data-testid={`verify-${id}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden" data-testid={`verify-${id}-summary`}>
        <h2 id={`${id}-title`} className={SECTION_TITLE}>{title}</h2>
        <span className="shrink-0 [font:600_12px_JetBrains_Mono] text-[#3FD17F]">{open ? t('verify.fold.close') : t('verify.fold.open')}</span>
      </summary>
      <div className="flex min-w-0 flex-col gap-4 pt-4">{children}</div>
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
