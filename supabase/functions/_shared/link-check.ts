/**
 * Whether a delivery link answers, asked once by the server for the sponsor about to pay. Only the status
 * class leaves this module: never a header, never a byte of the page.
 */
export type LinkVerdict = 'opens' | 'not_found' | 'unconfirmed';

export interface LinkCheck {
  verdict: LinkVerdict;
  /** The HTTP status the address answered with; `null` when it did not answer in time. */
  status: number | null;
}

const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.arpa', '.test', '.invalid'];

/** The address when it is one the server may ask: public-looking https host, default port, no credentials. */
export function checkableUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!host.includes('.') || host.startsWith('[') || host.includes(':')) return null;
  // A name made only of digits and dots is an address, not a site.
  if (/^[0-9.]+$/.test(host) || host === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  return url;
}

/** 2xx and 3xx open; 404 and 410 are gone; anything else (a site that refuses robots, an error, no answer) proves nothing. */
export function linkVerdict(status: number | null): LinkVerdict {
  if (status !== null && status >= 200 && status < 400) return 'opens';
  return status === 404 || status === 410 ? 'not_found' : 'unconfirmed';
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** `null`: an address the server does not ask (not https, a private name). Redirects are not followed. */
export async function checkLink(raw: string | null | undefined, budgetMs: number, fetcher: Fetcher = fetch): Promise<LinkCheck | null> {
  const url = checkableUrl(raw);
  if (!url) return null;
  try {
    const response = await fetcher(url.toString(), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(budgetMs), headers: { 'User-Agent': 'itera-link-check/1', Accept: 'text/html,*/*' } });
    await response.body?.cancel().catch(() => undefined);
    return { verdict: linkVerdict(response.status), status: response.status };
  } catch {
    return { verdict: 'unconfirmed', status: null };
  }
}
