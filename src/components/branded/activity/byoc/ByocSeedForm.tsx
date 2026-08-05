/**
 * BYOC step 1 — collect the learner's own context in their own words.
 *
 * A refused seed is shown as the server's welcoming "pick another theme" text,
 * never as an accusation: the learner is a beginner teenager and the refusal
 * says nothing about what tripped the filter.
 */
import { useState } from 'react';
import type { Locale } from '@iterahq/activity-spec/runtime';
import { localizedText as localized } from '@/utils/localizedText';
import type { SeedCollection } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import { ActivityTextarea } from '@/components/branded/activity/ActivityTextarea';

/** Matches itera-api's own `MAX_SEED_CHARS`, so the server never truncates. */
const MAX_SEED_CHARS = 500;

export function ByocSeedForm({
  seed,
  error,
  disabled = false,
  onSubmit,
}: {
  seed: SeedCollection;
  error?: string | null;
  disabled?: boolean;
  onSubmit: (value: string) => void;
}) {
  const { t, locale } = useI18n();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const example = seed.example ? localized(seed.example, locale as Locale) : '';

  return (
    <div data-testid="byoc-seed-form">
      <p className="text-lg font-medium text-foreground">
        {localized(seed.prompt, locale as Locale)}
      </p>
      {example && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('byoc.example')} {example}
        </p>
      )}

      <ActivityTextarea
        value={value}
        onChange={setValue}
        maxLength={MAX_SEED_CHARS}
        disabled={disabled}
        rows={3}
        data-testid="byoc-seed-input"
        placeholder={seed.placeholder ? localized(seed.placeholder, locale as Locale) : ''}
        className="mt-4 bg-card px-4 py-3"
      />

      {error && (
        <p className="mt-2 text-sm text-clay" data-testid="byoc-seed-error" role="status">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => onSubmit(trimmed)}
        disabled={disabled || trimmed.length === 0}
        data-testid="byoc-seed-submit"
        className="mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full font-medium bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('byoc.start')}
      </button>
    </div>
  );
}
