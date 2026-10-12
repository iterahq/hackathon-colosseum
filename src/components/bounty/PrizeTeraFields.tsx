import { useState } from 'react';
import { Field } from '@/components/bounty/CreateBountyForm';
import { INPUT } from '@/components/bounty/bountyUi';
import { FOCUS, MONO_LABEL } from '@/components/shop/shopStyles';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n';
import type { PrizeTeraInput, PrizeTeraOptions } from '@/types/bounty';
import { brandError, isAccent, prizePreviewUrl } from '@/utils/prizeTera';

const SWATCHES = ['#3fd17f', '#f2c66d', '#5fb8ff', '#9b8cff', '#ff8a5c', '#f4ede2'] as const;

interface Props {
  options: PrizeTeraOptions;
  /** Null: the sponsor did not add a prize. */
  value: PrizeTeraInput | null;
  onChange: (next: PrizeTeraInput | null) => void;
  /** Show what is wrong with the values (after a submit attempt). */
  strict: boolean;
}

/** The optional prize of a bounty: a brand name, a colour and one of a few base Teras. No file is sent; the art on the right is the server's own composition. */
export function PrizeTeraFields({ options, value, onChange, strict }: Props) {
  const { t } = useI18n();
  const [failed, setFailed] = useState<string | null>(null);
  const settled = useDebouncedValue(value);
  const preview = settled ? prizePreviewUrl(options.previewUrl, settled, options.brandMin, options.brandMax) : null;
  const error = value ? brandError(value.brand, options.brandMin, options.brandMax) : null;
  const showError = Boolean(value && error && (strict || value.brand.trim().length > 0) && !(error === 'short' && !strict));
  const start = () => onChange({ brand: '', accent: SWATCHES[0], base: options.bases[0]?.key ?? '' });

  return (
    <fieldset className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[#2E2A25] p-3.5" data-testid="prize-fields" data-on={value !== null}>
      <legend className="sr-only">{t('prize.form.title')}</legend>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" checked={value !== null} onChange={(event) => (event.target.checked ? start() : onChange(null))} className="mt-0.5 h-5 w-5 shrink-0 accent-[#3FD17F]" data-testid="prize-toggle" />
        <span className="flex flex-col gap-0.5">
          <span className="[font:700_16px/1.3_Inter] text-[#F4EDE2]">{t('prize.form.title')}</span>
          <span className="[font:400_13px/1.45_Inter] text-[#A0978A]">{t('prize.form.hint')}</span>
        </span>
      </label>
      {value && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_176px]">
          <div className="flex min-w-0 flex-col gap-3">
            <Field id="prize-brand" label={t('prize.form.brand')} error={showError && error ? t(`prize.form.err.${error}`, { min: options.brandMin, max: options.brandMax }) : null}>
              <input id="prize-brand" value={value.brand} maxLength={60} onChange={(event) => onChange({ ...value, brand: event.target.value })} placeholder={t('prize.form.brandPlaceholder')} className={INPUT} aria-invalid={showError} data-testid="prize-brand" />
              <span className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t('prize.form.brandHint', { max: options.brandMax })}</span>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('prize.form.accent')}</span>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('prize.form.accent')}>
                {SWATCHES.map((colour) => (
                  <button key={colour} type="button" aria-pressed={value.accent.toLowerCase() === colour} aria-label={colour} onClick={() => onChange({ ...value, accent: colour })} className={`h-11 w-11 rounded-full border-2 ${value.accent.toLowerCase() === colour ? 'border-[#F4EDE2]' : 'border-[#2E2A25]'} ${FOCUS}`} style={{ background: colour }} data-testid="prize-swatch" />
                ))}
                <input type="color" value={isAccent(value.accent) ? value.accent : '#3fd17f'} onChange={(event) => onChange({ ...value, accent: event.target.value })} aria-label={t('prize.form.accentOther')} className="h-11 w-11 cursor-pointer rounded-full border-2 border-[#2E2A25] bg-transparent p-0.5" data-testid="prize-accent" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('prize.form.base')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('prize.form.base')}>
                {options.bases.map((base) => (
                  <button key={base.key} type="button" aria-pressed={value.base === base.key} title={base.title} aria-label={base.title} onClick={() => onChange({ ...value, base: base.key })} className={`rounded-full border-2 p-0.5 ${value.base === base.key ? 'border-[#3FD17F]' : 'border-[#2E2A25]'} ${FOCUS}`} data-testid="prize-base" data-base={base.key}>
                    <img src={base.thumbUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5" data-testid="prize-preview" data-ready={Boolean(preview && failed !== preview)}>
            <span className={`${MONO_LABEL} self-start text-[#A0978A] sm:self-center`}>{t('prize.form.preview')}</span>
            <div className="flex h-[176px] w-[176px] items-center justify-center overflow-hidden rounded-[14px] border border-[#2E2A25] bg-[#0A0908]">
              {preview && failed !== preview ? (
                <img key={preview} src={preview} alt={t('prize.name', { brand: value.brand.trim() })} className="h-full w-full object-cover" onError={() => setFailed(preview)} data-testid="prize-preview-art" />
              ) : (
                <span className="px-3 text-center [font:400_12px/1.4_Inter] text-[#A0978A]">{t(preview ? 'prize.form.previewFailed' : 'prize.form.previewWait')}</span>
              )}
            </div>
            <span className="text-center [font:400_11px/1.4_Inter] text-[#A0978A]">{t('prize.form.previewNote')}</span>
          </div>
          <p className="[font:400_13px/1.5_Inter] text-[#C9BFB0] sm:col-span-2" data-testid="prize-terms">{t('prize.form.terms')}</p>
        </div>
      )}
    </fieldset>
  );
}
