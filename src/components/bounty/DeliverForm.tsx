import { useRef, useState, type FormEvent } from 'react';
import { INPUT, LABEL, Notice } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY } from '@/components/shop/shopStyles';
import { useSubmitBounty } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { checkDeliveryUrl, type DeliveryUrlProblem } from '@/utils/bounty';

const SERVER_ERRORS = ['invalid_submission', 'not_active'];

export function DeliverForm({ bountyId }: { bountyId: string }) {
  const { t } = useI18n();
  const submit = useSubmitBounty();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<DeliveryUrlProblem | null>(null);
  const [validated, setValidated] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const serverCode = submit.isError ? bountyErrorCode(submit.error) : null;
  const serverMessage = submit.isError ? (serverCode && SERVER_ERRORS.includes(serverCode) ? t(`bounty.err.submit.${serverCode}`) : t('bounty.err.generic')) : null;
  const message = problem ? t(`bounty.deliver.err.${problem}`) : serverMessage;

  const onChange = (value: string) => {
    setUrl(value);
    if (validated) setProblem(checkDeliveryUrl(value));
    if (submit.isError) submit.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = checkDeliveryUrl(url);
    setValidated(true);
    setProblem(found);
    if (found) {
      input.current?.focus();
      return;
    }
    const clean = url.trim();
    submit.mutate(
      { bounty: bountyId, url: clean, note },
      {
        onSuccess: () => setSent(clean),
        onError: () => input.current?.focus(),
      },
    );
  };

  if (sent) {
    return (
      <Notice tone="good" testId="bounty-delivered">
        <strong className="text-[#F4EDE2]">{t('bounty.deliver.done')}</strong>
        <span className="mt-1 block break-all [font:500_12px_JetBrains_Mono] text-[#A0978A]">
          {t('bounty.deliver.sentLink')}: {sent}
        </span>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate data-testid="bounty-deliver-form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bounty-url" className={LABEL}>{t('bounty.active.url')}</label>
        <input
          ref={input}
          id="bounty-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://"
          className={`${INPUT} ${message ? '!border-[#E0655A]' : ''}`}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? 'bounty-url-error' : undefined}
          data-testid="bounty-url"
        />
        {message && (
          <div id="bounty-url-error">
            <Notice tone="error" testId="bounty-url-error">{message}</Notice>
          </div>
        )}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t('bounty.active.note')}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className={INPUT} data-testid="bounty-note" />
        <span className="self-end [font:500_11px_JetBrains_Mono] text-[#5E574E]">{note.length}/1000</span>
      </label>
      <button type="submit" disabled={submit.isPending} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-submit">
        {submit.isPending ? t('bounty.working') : t('bounty.active.submit')}
      </button>
    </form>
  );
}
