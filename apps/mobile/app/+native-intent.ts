/**
 * Expo Router calls `redirectSystemPath` with the raw incoming link, for a cold start and for a warm one, BEFORE it
 * parses it into route params (which decodes them). `intakeLink` (`src/deepLink.ts`) decides here, the one place that sees
 * the link first: a link whose query or fragment carries a `refresh_token` (the implicit-flow returns of Supabase) is
 * stripped of its query and fragment, so neither the router nor `src/rawLink.ts` ever holds that token (ADR-10). Any other
 * link passes unchanged and its raw form is remembered (last one only, in memory) so the route can start the WebView on its
 * query and fragment as written (R-5). Never throws, never logs the link.
 */
import { intakeLink } from '../src/deepLink';
import { forgetLink, rememberLink } from '../src/rawLink';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const { path: out, remember } = intakeLink(path);
  if (remember === null) forgetLink();
  else rememberLink(remember);
  return out;
}
