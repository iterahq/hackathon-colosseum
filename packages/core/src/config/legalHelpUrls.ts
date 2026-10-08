import type { NavigationIntent } from '../ports/navigation';

/**
 * The public pages the profile screen links to, the one place their addresses are written.
 * Both hosts (the web and the shell) read them from here.
 */
export const LEGAL_AND_HELP_URLS = {
  privacy: 'https://iterahq.dev/privacidade',
  terms: 'https://iterahq.dev/termos',
  support: 'https://iterahq.dev/suporte',
} as const;

/**
 * Whether the three pages answer. They do not yet: every path of `iterahq.dev` serves its landing page, so
 * a row would open the sales page under the name of a privacy policy. While this is false no host draws
 * the rows (the screen leaves the card out). Turning it on is this one line, once the pages are live.
 */
export const LEGAL_HELP_PAGES_LIVE: boolean = false;

export type LegalHelpLinkId = keyof typeof LEGAL_AND_HELP_URLS;

export const LEGAL_HELP_LINK_IDS: readonly LegalHelpLinkId[] = ['privacy', 'terms', 'support'];

/** One intent per page. A host without anchors (the shell) passes `open`; the web leaves the anchor to the browser. */
export function legalHelpLinks(open?: (url: string) => void): Record<LegalHelpLinkId, NavigationIntent> {
  const intent = (url: string): NavigationIntent => (open ? { href: url, go: () => open(url) } : { href: url });
  return {
    privacy: intent(LEGAL_AND_HELP_URLS.privacy),
    terms: intent(LEGAL_AND_HELP_URLS.terms),
    support: intent(LEGAL_AND_HELP_URLS.support),
  };
}
