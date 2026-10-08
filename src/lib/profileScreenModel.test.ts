import { describe, expect, it } from 'vitest';
import type { ProfileFormView } from '@iterahq/shell-core';
import { formStateOf, personalizationDraftWith, personalizationViewOf } from './profileScreenModel';

const FORM = { name: 'Ana' } as ProfileFormView;
const t = (key: string) => `[${key}]`;

describe('formStateOf', () => {
  it('is loading while the profile is pending, an error when the read failed, the form otherwise', () => {
    expect(formStateOf({ isPending: true, isError: false }, FORM)).toEqual({ kind: 'loading' });
    expect(formStateOf({ isPending: false, isError: true }, FORM)).toEqual({ kind: 'error' });
    expect(formStateOf({ isPending: false, isError: false }, FORM)).toEqual({ kind: 'ready', form: FORM });
  });
});

describe('personalizationViewOf', () => {
  it('lists the eleven fields with their label, example and value', () => {
    const view = personalizationViewOf({ 'eu.nome': 'Bia' }, { ready: true, saving: false, saved: false }, t);
    expect(view.fields).toHaveLength(11);
    expect(view.fields[0]).toEqual({ id: 'eu.nome', label: '[personalization.field.euNome]', placeholder: 'Alex', value: 'Bia', numeric: false });
    expect(view.fields[1]).toEqual({ id: 'eu.idade', label: '[personalization.field.euIdade]', placeholder: '15', value: '', numeric: true });
  });

  it('cannot save before the cast arrived nor while saving, and hides the saved mark while saving', () => {
    expect(personalizationViewOf({}, { ready: false, saving: false, saved: false }, t).canSave).toBe(false);
    expect(personalizationViewOf({}, { ready: true, saving: true, saved: true }, t)).toMatchObject({ canSave: false, saving: true, saved: false });
    expect(personalizationViewOf({}, { ready: true, saving: false, saved: true }, t)).toMatchObject({ canSave: true, saved: true });
  });
});

describe('personalizationDraftWith', () => {
  it('cleans the typed value by the kind of the field', () => {
    expect(personalizationDraftWith({}, 'eu.idade', '1a7 anos')).toEqual({ 'eu.idade': '17' });
    expect(personalizationDraftWith({ 'eu.idade': '17' }, 'eu.nome', '**Bia**')).toEqual({ 'eu.idade': '17', 'eu.nome': 'Bia' });
  });

  it('ignores a field that does not exist', () => {
    const draft = { 'eu.nome': 'Bia' };
    expect(personalizationDraftWith(draft, 'nope', 'x')).toBe(draft);
  });
});
