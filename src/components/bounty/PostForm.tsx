import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '@/components/bounty/CreateBountyForm';
import { ExplorerAnchor, INPUT, Notice, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { SponsorFaucet } from '@/components/bounty/SponsorFaucet';
import { TxErrorNotice, TxPhaseNotice } from '@/components/bounty/TxStatus';
import { BTN_PRIMARY, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useCreatePostedBounty, useWalletBountyTx } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { bountyErrorCode } from '@/services/bounty.service';
import { lamportsToSol, POST_TEXT_LIMITS, validatePostForm, type PostField, type PostFormValues, type PostTextField } from '@/utils/bounty';
import type { BountyLang, CreatedBounty, PostOptions, TxPhase } from '@/types/bounty';

const CREATE_CODES = ['invalid_sponsor', 'invalid_text', 'invalid_reward', 'invalid_requirement', 'invalid_deadline', 'too_many_today', 'too_many_live'];
const LANG_NAMES: Record<BountyLang, string> = { pt: 'Português', en: 'English' };

function Counter({ field, value }: { field: PostTextField; value: string }) {
  const { t } = useI18n();
  const { min, max } = POST_TEXT_LIMITS[field];
  const length = value.trim().length;
  const bad = length > 0 && (length < min || length > max);
  return <span className={`self-end [font:500_11px_JetBrains_Mono] ${bad ? 'text-[#E0655A]' : 'text-[#5E574E]'}`}>{t('bounty.post.counter', { n: length, max })}</span>;
}

export function PostForm({ options, balanceLamports }: { options: PostOptions; balanceLamports: number | null }) {
  const { t, locale } = useI18n();
  const { limits, trails } = options;
  const create = useCreatePostedBounty();
  const fund = useWalletBountyTx('fund');
  const [lang, setLang] = useState<BountyLang>(locale === 'pt' ? 'pt' : 'en');
  const [values, setValues] = useState<PostFormValues>({
    sponsor: '',
    title: '',
    summary: '',
    brief: '',
    deliverable: '',
    reward: '',
    minDays: '1',
    expires: String(Math.min(7, limits.maxExpiryDays)),
    claimHours: String(Math.min(24, limits.maxClaimHours)),
  });
  const [unitId, setUnitId] = useState(trails[0]?.unitId ?? '');
  const [attempted, setAttempted] = useState(false);
  const [created, setCreated] = useState<CreatedBounty | null>(null);
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const trail = trails.find((x) => x.unitId === unitId) ?? trails[0];
  const patch = (next: Partial<PostFormValues>) => setValues((v) => ({ ...v, ...next }));

  const check = validatePostForm(values, {
    minRewardLamports: limits.minRewardLamports,
    maxRewardLamports: limits.maxRewardLamports,
    maxExpiryDays: limits.maxExpiryDays,
    maxClaimHours: limits.maxClaimHours,
    totalDays: trail?.totalDays ?? null,
  });
  const shown = attempted ? check.errors : {};
  const message = (field: PostField): string | null => {
    const kind = shown[field];
    if (!kind) return null;
    if (kind === 'short' || kind === 'long') {
      const bounds = POST_TEXT_LIMITS[field as PostTextField];
      return t(`bounty.post.err.${kind}`, { min: bounds.min, max: bounds.max });
    }
    if (field === 'reward') return t('bounty.post.err.reward', { min: lamportsToSol(limits.minRewardLamports), max: lamportsToSol(limits.maxRewardLamports) });
    if (field === 'requirement') return t('bounty.post.err.requirement');
    return t(`bounty.post.err.${field}`, { max: field === 'expires' ? limits.maxExpiryDays : limits.maxClaimHours });
  };

  const startFunding = (bounty: CreatedBounty) => fund.mutate({ bounty: bounty.id, onPhase: setPhase });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const { rewardLamports, minDays, expiresInDays, claimHours } = check;
    if (Object.keys(check.errors).length > 0 || rewardLamports === null || minDays === null || expiresInDays === null || claimHours === null) return;
    create.mutate(
      {
        sponsorName: values.sponsor,
        title: { [lang]: values.title },
        summary: { [lang]: values.summary },
        brief: { [lang]: values.brief },
        deliverable: { [lang]: values.deliverable },
        rewardLamports,
        unitId,
        minDays,
        expiresInDays,
        claimHours,
      },
      {
        onSuccess: (bounty) => {
          setCreated(bounty);
          startFunding(bounty);
        },
      },
    );
  };

  if (fund.isSuccess && created) {
    const signature = fund.data.fundingSignature;
    return (
      <section className="flex flex-col gap-3 rounded-[14px] border-2 border-[#3FD17F] bg-[#3FD17F]/10 p-4 sm:p-5" data-testid="bounty-post-done">
        <p className="[font:700_32px/1.05_'Barlow_Condensed'] text-[#3FD17F]">{t('bounty.post.state.done')}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link to={`/bounties/${created.slug}`} className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline" data-testid="bounty-post-open">
            {t('bounty.post.done.page')} →
          </Link>
          {signature && <ExplorerAnchor href={txUrl(signature)} label={t('bounty.post.done.tx')} />}
          <Link to="/bounties/mine" className="inline-flex min-h-11 items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline">
            {t('bounty.post.done.mine')} →
          </Link>
        </div>
      </section>
    );
  }

  if (created && fund.isError) {
    return (
      <section className={`${CARD} flex flex-col gap-3 !border-[#E0655A] p-4 sm:p-5`} data-testid="bounty-post-failed">
        <p className="[font:700_24px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('bounty.post.failed.title')}</p>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.post.failed.body')}</p>
        <TxErrorNotice error={fund.error} />
        <Link to="/bounties/mine" className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-post-retry">
          {t('bounty.post.failed.retry')}
        </Link>
      </section>
    );
  }

  const busy = create.isPending || fund.isPending;
  const createCode = create.isError ? bountyErrorCode(create.error) : null;
  const rent = limits.escrowRentLamports;
  const reward = check.rewardLamports;
  const total = reward !== null && rent !== null ? reward + rent + limits.feeLamports : null;

  return (
    <form onSubmit={onSubmit} className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} noValidate aria-labelledby="bounty-post-form" data-testid="bounty-post-form">
      <h2 id="bounty-post-form" className={SECTION_TITLE}>{t('bounty.post.form')}</h2>
      <Field id="bounty-p-lang" label={t('bounty.post.lang')}>
        <select id="bounty-p-lang" value={lang} onChange={(e) => setLang(e.target.value === 'pt' ? 'pt' : 'en')} className={INPUT} data-testid="bounty-post-lang">
          {(['pt', 'en'] as const).map((l) => (
            <option key={l} value={l}>{LANG_NAMES[l]}</option>
          ))}
        </select>
        <span className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.post.langHint')}</span>
      </Field>
      <Field id="bounty-p-sponsor" label={t('bounty.post.sponsor')} error={message('sponsor')}>
        <input id="bounty-p-sponsor" value={values.sponsor} onChange={(e) => patch({ sponsor: e.target.value })} placeholder={t('bounty.post.sponsorPlaceholder')} className={INPUT} aria-invalid={Boolean(message('sponsor'))} data-testid="bounty-post-sponsor" />
        <Counter field="sponsor" value={values.sponsor} />
      </Field>
      <Field id="bounty-p-title" label={t('bounty.post.titleField')} error={message('title')}>
        <input id="bounty-p-title" value={values.title} onChange={(e) => patch({ title: e.target.value })} className={INPUT} aria-invalid={Boolean(message('title'))} data-testid="bounty-post-title" />
        <Counter field="title" value={values.title} />
      </Field>
      <Field id="bounty-p-summary" label={t('bounty.post.summary')} error={message('summary')}>
        <input id="bounty-p-summary" value={values.summary} onChange={(e) => patch({ summary: e.target.value })} className={INPUT} aria-invalid={Boolean(message('summary'))} data-testid="bounty-post-summary" />
        <Counter field="summary" value={values.summary} />
      </Field>
      <Field id="bounty-p-brief" label={t('bounty.post.brief')} error={message('brief')}>
        <textarea id="bounty-p-brief" value={values.brief} onChange={(e) => patch({ brief: e.target.value })} rows={8} className={INPUT} aria-invalid={Boolean(message('brief'))} data-testid="bounty-post-brief" />
        <span className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.post.briefHint')}</span>
        <Counter field="brief" value={values.brief} />
      </Field>
      <Field id="bounty-p-deliverable" label={t('bounty.post.deliverable')} error={message('deliverable')}>
        <textarea id="bounty-p-deliverable" value={values.deliverable} onChange={(e) => patch({ deliverable: e.target.value })} rows={3} className={INPUT} aria-invalid={Boolean(message('deliverable'))} data-testid="bounty-post-deliverable" />
        <Counter field="deliverable" value={values.deliverable} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bounty-p-reward" label={t('bounty.post.reward')} error={message('reward')}>
          <input id="bounty-p-reward" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.05" value={values.reward} onChange={(e) => patch({ reward: e.target.value })} className={INPUT} aria-invalid={Boolean(message('reward'))} data-testid="bounty-post-reward" />
        </Field>
        <Field id="bounty-p-trail" label={t('bounty.post.trail')}>
          <select id="bounty-p-trail" value={unitId} onChange={(e) => setUnitId(e.target.value)} className={INPUT} data-testid="bounty-post-trail">
            {trails.map((x) => (
              <option key={x.unitId} value={x.unitId}>{x.title[locale] || x.title.pt}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="bounty-p-days" label={t('bounty.post.minDays', { max: trail?.totalDays ?? 0 })} error={message('requirement')}>
          <input id="bounty-p-days" type="number" inputMode="numeric" min="1" value={values.minDays} onChange={(e) => patch({ minDays: e.target.value })} className={INPUT} aria-invalid={Boolean(message('requirement'))} data-testid="bounty-post-days" />
        </Field>
        <Field id="bounty-p-expires" label={t('bounty.post.expires', { max: limits.maxExpiryDays })} error={message('expires')}>
          <input id="bounty-p-expires" type="number" inputMode="numeric" min="1" value={values.expires} onChange={(e) => patch({ expires: e.target.value })} className={INPUT} aria-invalid={Boolean(message('expires'))} data-testid="bounty-post-expires" />
        </Field>
        <Field id="bounty-p-hours" label={t('bounty.post.claimHours', { max: limits.maxClaimHours })} error={message('claimHours')}>
          <input id="bounty-p-hours" type="number" inputMode="numeric" min="1" value={values.claimHours} onChange={(e) => patch({ claimHours: e.target.value })} className={INPUT} aria-invalid={Boolean(message('claimHours'))} data-testid="bounty-post-hours" />
        </Field>
      </div>
      <dl className="flex flex-col gap-1.5 rounded-[12px] border border-[#2E2A25] bg-[#0A0908] p-3.5" data-testid="bounty-post-cost">
        <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.post.cost')}</dt>
        <dd className="flex justify-between gap-3 [font:500_14px_JetBrains_Mono] text-[#C9BFB0]">
          <span>{t('bounty.post.cost.reward')}</span>
          <span>{reward === null ? '—' : `${lamportsToSol(reward)} SOL`}</span>
        </dd>
        {rent !== null && (
          <dd className="flex justify-between gap-3 [font:500_14px_JetBrains_Mono] text-[#C9BFB0]">
            <span>{t('bounty.post.cost.rent')}</span>
            <span>{lamportsToSol(rent)} SOL</span>
          </dd>
        )}
        <dd className="flex justify-between gap-3 [font:500_14px_JetBrains_Mono] text-[#C9BFB0]">
          <span>{t('bounty.post.cost.fee')}</span>
          <span>{lamportsToSol(limits.feeLamports)} SOL</span>
        </dd>
        {total !== null ? (
          <dd className="flex justify-between gap-3 border-t border-[#262320] pt-1.5 [font:700_15px_JetBrains_Mono] text-[#F4EDE2]" data-testid="bounty-post-total">
            <span>{t('bounty.post.cost.total')}</span>
            <span>{lamportsToSol(total)} SOL</span>
          </dd>
        ) : (
          rent === null && <dd className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.post.cost.rentUnknown')}</dd>
        )}
        <dd className="[font:400_12px/1.4_Inter] text-[#A0978A]" data-testid="bounty-post-balance">
          {balanceLamports === null ? t('bounty.post.cost.balanceUnknown') : t('bounty.post.cost.balance', { sol: lamportsToSol(balanceLamports) })}
        </dd>
      </dl>
      <SponsorFaucet />
      {attempted && Object.keys(check.errors).length > 0 && <Notice tone="error">{t('bounty.post.err.fix')}</Notice>}
      {create.isError && <Notice tone="error" testId="bounty-post-error">{createCode && CREATE_CODES.includes(createCode) ? t(`bounty.post.err.${createCode}`) : t('bounty.err.generic')}</Notice>}
      {phase !== null && fund.isPending && <TxPhaseNotice phase={phase} />}
      {create.isPending && <Notice testId="bounty-post-creating">{t('bounty.post.state.creating')}</Notice>}
      {fund.isError && <TxErrorNotice error={fund.error} />}
      <button type="submit" disabled={busy || trails.length === 0} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-post-submit">
        {busy ? t('bounty.working') : t('bounty.post.submit')}
      </button>
    </form>
  );
}
