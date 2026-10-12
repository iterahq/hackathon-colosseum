import { describe, expect, it } from 'vitest';
import { EMPTY_CONTACT } from '@/types/privacy';
import { checkContact, contactFieldValid, tidyContact } from './contact';

describe('contact fields', () => {
  it('accepts one address, a Telegram handle, a LinkedIn profile and an https link', () => {
    expect(contactFieldValid('email', 'ana@example.com')).toBe(true);
    expect(contactFieldValid('telegram', '@ana_dev')).toBe(true);
    expect(contactFieldValid('linkedin', 'https://www.linkedin.com/in/ana-dev')).toBe(true);
    expect(contactFieldValid('link', 'https://ana.dev/contato')).toBe(true);
    expect(tidyContact('telegram', ' @ana_dev ')).toBe('ana_dev');
  });

  it('refuses markup, quotes, spaces, another host, http, credentials in a link and anything too long', () => {
    for (const bad of ['ana@example', 'a b@example.com', '<b>@x.com', 'ana@example.com,bob@example.com']) expect(contactFieldValid('email', bad), bad).toBe(false);
    for (const bad of ['ana', 'ana dev', 'a'.repeat(33), 'ana-dev']) expect(contactFieldValid('telegram', bad), bad).toBe(false);
    for (const bad of ['https://linkedin.com/in/ana', 'http://www.linkedin.com/in/ana', 'https://www.linkedin.com/company/x', 'https://evil.example/in/ana']) expect(contactFieldValid('linkedin', bad), bad).toBe(false);
    for (const bad of ['http://ana.dev', 'https://localhost/x', 'https://user:pw@ana.dev', 'javascript:alert(1)', 'https://ana.dev/"x', `https://ana.dev/${'a'.repeat(200)}`]) expect(contactFieldValid('link', bad), bad).toBe(false);
  });
});

describe('checkContact', () => {
  it('needs at least one way to be reached', () => {
    expect(checkContact(EMPTY_CONTACT)).toEqual({ invalid: [], empty: true, payload: {} });
    expect(checkContact({ ...EMPTY_CONTACT, telegram: '   ' }).empty).toBe(true);
  });

  it('sends only the fields that were filled, tidied', () => {
    expect(checkContact({ ...EMPTY_CONTACT, email: ' ana@example.com ', telegram: '@ana_dev' })).toEqual({ invalid: [], empty: false, payload: { email: 'ana@example.com', telegram: 'ana_dev' } });
  });

  it('names the fields the server would refuse and does not count them as a contact', () => {
    const check = checkContact({ ...EMPTY_CONTACT, email: 'not an address', link: 'http://x.dev' });
    expect(check.invalid).toEqual(['email', 'link']);
    expect(check.empty).toBe(false);
    expect(check.payload).toEqual({});
  });
});
