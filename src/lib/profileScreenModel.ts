/**
 * The pure mapping of the web host of the profile screen: the query flags to the closed state, and the
 * cast of the exercises to the fields the screen draws. No React, no service.
 */
import type { PersonalizationView, ProfileFormState, ProfileFormView } from '@iterahq/shell-core';
import type { PersonalizationValues } from '@/types/personalization';
import { PERSONALIZATION_FIELDS, sanitizePersonalizationValue } from '@/utils/personalization';

export function formStateOf(query: { isPending: boolean; isError: boolean }, form: ProfileFormView): ProfileFormState {
  if (query.isPending) return { kind: 'loading' };
  if (query.isError) return { kind: 'error' };
  return { kind: 'ready', form };
}

export function personalizationViewOf(
  draft: PersonalizationValues,
  flags: { ready: boolean; saving: boolean; saved: boolean },
  t: (key: string) => string,
): PersonalizationView {
  return {
    fields: PERSONALIZATION_FIELDS.map((field) => ({
      id: field.id,
      label: t(`personalization.field.${field.labelKey}`),
      placeholder: field.fallback,
      value: draft[field.id] ?? '',
      numeric: field.kind === 'age',
    })),
    canSave: flags.ready && !flags.saving,
    saving: flags.saving,
    saved: flags.saved && !flags.saving,
  };
}

/** The draft after the learner typed `text` into a field: the value is cleaned by the field's kind. An unknown field changes nothing. */
export function personalizationDraftWith(draft: PersonalizationValues, fieldId: string, text: string): PersonalizationValues {
  const field = PERSONALIZATION_FIELDS.find((f) => f.id === fieldId);
  return field ? { ...draft, [field.id]: sanitizePersonalizationValue(text, field.kind) } : draft;
}
