import { describe, expect, it, vi } from 'vitest';
import { LEGAL_AND_HELP_URLS, LEGAL_HELP_LINK_IDS, LEGAL_HELP_PAGES_LIVE, legalHelpLinks } from './legalHelpUrls';

describe('LEGAL_AND_HELP_URLS', () => {
  it('names the three public pages', () => {
    expect(LEGAL_AND_HELP_URLS).toEqual({
      privacy: 'https://iterahq.dev/privacidade',
      terms: 'https://iterahq.dev/termos',
      support: 'https://iterahq.dev/suporte',
    });
    expect(LEGAL_HELP_LINK_IDS).toEqual(['privacy', 'terms', 'support']);
  });
});

describe('legalHelpLinks', () => {
  it('gives the web plain anchors', () => {
    expect(legalHelpLinks()).toEqual({
      privacy: { href: LEGAL_AND_HELP_URLS.privacy },
      terms: { href: LEGAL_AND_HELP_URLS.terms },
      support: { href: LEGAL_AND_HELP_URLS.support },
    });
  });

  it('gives a host without anchors a way to open each page', () => {
    const open = vi.fn();
    const links = legalHelpLinks(open);
    links.terms.go?.();
    links.support.go?.();
    expect(open.mock.calls).toEqual([[LEGAL_AND_HELP_URLS.terms], [LEGAL_AND_HELP_URLS.support]]);
    expect(links.privacy.href).toBe(LEGAL_AND_HELP_URLS.privacy);
  });
});

describe('LEGAL_HELP_PAGES_LIVE', () => {
  it('is off: the three pages do not exist yet, so no host draws the rows', () => {
    expect(LEGAL_HELP_PAGES_LIVE).toBe(false);
  });
});
