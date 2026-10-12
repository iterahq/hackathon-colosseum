import { AskingForPreview } from '@/components/bounty/MissionSkills';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { INPUT, LABEL, Notice, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { BTN_PRIMARY, CARD } from '@/components/shop/shopStyles';
import { useCreateBounty } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { bountyErrorCode } from '@/services/bounty.service';
import { createErrorField, isCreateErrorCode, isRewardInRange, isValidSlug, slugify, solToLamports, type CreateField } from '@/utils/bounty';
import type { SponsorTrail } from '@/types/bounty';

type Lang = 'pt' | 'en';
type TextKey = 'title' | 'summary' | 'brief' | 'deliverable';
const TEXT_KEYS: readonly TextKey[] = ['title', 'summary', 'brief', 'deliverable'];
const LANGS: readonly Lang[] = ['pt', 'en'];

interface FormState {
  slug: string;
  slugTouched: boolean;
  sponsor: string;
  text: Record<TextKey, Record<Lang, string>>;
  unitId: string;
  minDays: string;
  reward: string;
  expiresInDays: string;
  claimHours: string;
  refundAddress: string;
}

const blankText = (): FormState['text'] => ({
  title: { pt: '', en: '' },
  summary: { pt: '', en: '' },
  brief: { pt: '', en: '' },
  deliverable: { pt: '', en: '' },
});

const initial = (trails: SponsorTrail[]): FormState => ({
  slug: '',
  slugTouched: false,
  sponsor: '',
  text: blankText(),
  unitId: trails[0]?.unitId ?? '',
  minDays: '1',
  reward: '',
  expiresInDays: '14',
  claimHours: '72',
  refundAddress: '',
});

const wholeNumber = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v) : null);

export function Field({ label, error, children, id }: { label: string; error?: string | null; children: ReactNode; id: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      {error && (
        <span id={`${id}-error`} role="alert" className="[font:500_13px_Inter] text-[#E0655A]">
          {error}
        </span>
      )}
    </div>
  );
}

export function CreateBountyForm({ trails }: { trails: SponsorTrail[] }) {
  const { t, locale } = useI18n();
  const create = useCreateBounty();
  const [form, setForm] = useState<FormState>(() => initial(trails));
  const [errors, setErrors] = useState<Partial<Record<CreateField, string>>>({});
  const [created, setCreated] = useState<string | null>(null);
  const trail = trails.find((x) => x.unitId === form.unitId) ?? trails[0];
  const patch = (next: Partial<FormState>) => setForm((f) => ({ ...f, ...next }));
  const setText = (key: TextKey, lang: Lang, value: string) =>
    setForm((f) => {
      const text = { ...f.text, [key]: { ...f.text[key], [lang]: value } };
      const slug = key === 'title' && lang === 'en' && !f.slugTouched ? slugify(value) : f.slug;
      return { ...f, text, slug };
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next: Partial<Record<CreateField, string>> = {};
    const lamports = solToLamports(form.reward);
    const minDays = wholeNumber(form.minDays);
    const expires = wholeNumber(form.expiresInDays);
    const hours = wholeNumber(form.claimHours);
    if (!isValidSlug(form.slug)) next.slug = t('bounty.err.invalid_slug');
    if (!form.sponsor.trim()) next.sponsor = t('bounty.err.invalid_sponsor');
    if (TEXT_KEYS.some((k) => LANGS.some((l) => !form.text[k][l].trim()))) next.text = t('bounty.err.invalid_text');
    if (lamports === null || !isRewardInRange(lamports)) next.reward = t('bounty.err.invalid_reward');
    if (!trail || minDays === null || minDays < 1 || minDays > trail.totalDays) next.requirement = t('bounty.err.invalid_requirement');
    if (expires === null || expires < 1 || hours === null || hours < 1) next.deadline = t('bounty.err.invalid_deadline');
    setErrors(next);
    if (Object.keys(next).length > 0 || lamports === null || minDays === null || expires === null || hours === null) return;
    create.mutate(
      {
        slug: form.slug,
        sponsorName: form.sponsor.trim(),
        title: form.text.title,
        summary: form.text.summary,
        brief: form.text.brief,
        deliverable: form.text.deliverable,
        rewardLamports: lamports,
        unitId: form.unitId,
        minDays,
        expiresInDays: expires,
        claimHours: hours,
        refundAddress: form.refundAddress,
      },
      {
        onSuccess: ({ slug }) => {
          setCreated(slug);
          setForm(initial(trails));
        },
        onError: (error) => {
          const code = bountyErrorCode(error);
          const field = createErrorField(code);
          if (field && isCreateErrorCode(code)) setErrors({ [field]: t(`bounty.err.${code}`) });
          else setErrors({});
        },
      },
    );
  };

  const failedGeneric = create.isError && !createErrorField(bountyErrorCode(create.error));

  return (
    <section className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="bounty-create" data-testid="bounty-create">
      <h2 id="bounty-create" className={SECTION_TITLE}>{t('bounty.form.heading')}</h2>
      {created && (
        <Notice tone="good" testId="bounty-created">
          {t('bounty.form.created')} <Link to={`/bounties/${created}`} className="text-[#3FD17F] underline">/{created}</Link>
        </Notice>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bounty-f-slug" label={t('bounty.form.slug')} error={errors.slug}>
            <input id="bounty-f-slug" value={form.slug} onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })} className={INPUT} autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(errors.slug)} aria-describedby={errors.slug ? 'bounty-f-slug-error' : undefined} />
          </Field>
          <Field id="bounty-f-sponsor" label={t('bounty.form.sponsor')} error={errors.sponsor}>
            <input id="bounty-f-sponsor" value={form.sponsor} onChange={(e) => patch({ sponsor: e.target.value })} className={INPUT} aria-invalid={Boolean(errors.sponsor)} aria-describedby={errors.sponsor ? 'bounty-f-sponsor-error' : undefined} />
          </Field>
        </div>
        <div className="flex flex-col gap-4">
          {TEXT_KEYS.map((key) => (
            <div key={key} className="grid gap-4 sm:grid-cols-2">
              {LANGS.map((lang) => {
                const id = `bounty-f-${key}-${lang}`;
                const long = key === 'brief';
                return (
                  <Field key={lang} id={id} label={`${t(`bounty.form.${key}`)} (${lang.toUpperCase()})`}>
                    {key === 'title' ? (
                      <input id={id} value={form.text[key][lang]} onChange={(e) => setText(key, lang, e.target.value)} className={INPUT} />
                    ) : (
                      <textarea id={id} value={form.text[key][lang]} onChange={(e) => setText(key, lang, e.target.value)} rows={long ? 7 : 3} className={INPUT} />
                    )}
                  </Field>
                );
              })}
            </div>
          ))}
          {errors.text && <span role="alert" className="[font:500_13px_Inter] text-[#E0655A]">{errors.text}</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="bounty-f-trail" label={t('bounty.form.trail')} error={errors.requirement}>
            <select id="bounty-f-trail" value={form.unitId} onChange={(e) => patch({ unitId: e.target.value })} className={INPUT}>
              {trails.map((x) => (
                <option key={x.unitId} value={x.unitId}>
                  {x.title[locale] || x.title.pt}
                </option>
              ))}
            </select>
          </Field>
          <Field id="bounty-f-days" label={t('bounty.form.minDays', { max: trail?.totalDays ?? 0 })}>
            <input id="bounty-f-days" inputMode="numeric" value={form.minDays} onChange={(e) => patch({ minDays: e.target.value })} className={INPUT} />
          </Field>
          <Field id="bounty-f-reward" label={t('bounty.form.reward')} error={errors.reward}>
            <input id="bounty-f-reward" inputMode="decimal" placeholder="0.05" value={form.reward} onChange={(e) => patch({ reward: e.target.value })} className={INPUT} aria-invalid={Boolean(errors.reward)} aria-describedby={errors.reward ? 'bounty-f-reward-error' : undefined} />
          </Field>
        </div>
        <AskingForPreview trail={trail} minDays={wholeNumber(form.minDays)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bounty-f-expires" label={t('bounty.form.expires')} error={errors.deadline}>
            <input id="bounty-f-expires" inputMode="numeric" value={form.expiresInDays} onChange={(e) => patch({ expiresInDays: e.target.value })} className={INPUT} />
          </Field>
          <Field id="bounty-f-hours" label={t('bounty.form.claimHours')}>
            <input id="bounty-f-hours" inputMode="numeric" value={form.claimHours} onChange={(e) => patch({ claimHours: e.target.value })} className={INPUT} />
          </Field>
        </div>
        <Field id="bounty-f-refund" label={t('bounty.form.refund')} error={errors.refund}>
          <input id="bounty-f-refund" value={form.refundAddress} onChange={(e) => patch({ refundAddress: e.target.value })} className={INPUT} spellCheck={false} aria-invalid={Boolean(errors.refund)} aria-describedby={errors.refund ? 'bounty-f-refund-error' : undefined} />
          <span className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('bounty.form.refundHint')}</span>
        </Field>
        {failedGeneric && <Notice tone="error">{t('bounty.err.generic')}</Notice>}
        <button type="submit" disabled={create.isPending || trails.length === 0} className={`${BTN_PRIMARY} w-full sm:w-auto sm:self-start`} data-testid="bounty-create-submit">
          {create.isPending ? t('bounty.working') : t('bounty.form.submit')}
        </button>
      </form>
    </section>
  );
}
