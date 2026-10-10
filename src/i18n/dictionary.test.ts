import { describe, expect, it } from 'vitest';
import { resources } from './index';

const placeholders = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(',');

describe('dictionaries', () => {
  it('have the same keys in pt and en', () => {
    expect(Object.keys(resources.en).sort()).toEqual(Object.keys(resources.pt).sort());
  });

  it('use the same placeholders in pt and en', () => {
    const mismatched = Object.keys(resources.pt).filter((k) => placeholders(resources.pt[k]) !== placeholders(resources.en[k] ?? ''));
    expect(mismatched).toEqual([]);
  });

  it('keep Portuguese out of the English values', () => {
    const leaked = Object.entries(resources.en).filter(([k, v]) => /[áàâãéêíóôõúç]/i.test(v) && k !== 'dash.nav.language' && k !== 'header.id.language');
    expect(leaked).toEqual([]);
  });

  it('never calls the certifications feature a passport in English', () => {
    const named = Object.entries(resources.en).filter(([, v]) => /passport/i.test(v));
    expect(named).toEqual([]);
  });
});
