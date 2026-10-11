/**
 * The HTML a link-preview crawler gets for /c/<asset>, /u/<wallet> and /gift/<wallet>. The SPA cannot give
 * each page its own Open Graph tags, so nginx hands crawlers (by user agent) to this function. Public,
 * read-only, no user id in the output; the page itself stays the SPA for every browser.
 */
import { isSolanaAddress } from '../_shared/address.ts';
import { APP_URL, pickText } from '../_shared/credential.ts';
import { serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, json, pathAfter } from '../_shared/http.ts';
import { RateLimiter, callerAddress, tooMany } from '../_shared/ratelimit.ts';

const IMAGE = `${APP_URL}/og/itera.png`;
/** A crawler fetches a link once; a script hammering previews is throttled, best effort, per isolate. */
const limiter = new RateLimiter({ limit: 60, windowMs: 60_000 });
const CACHE = 'public, max-age=300';
const DEFAULT = { title: 'Itera | Proof of learning that lives in your wallet', description: 'Train. Prove it on Solana. Earn. Every finished day stamps a soulbound credential anyone can verify.' };

interface Share {
  title: string;
  description: string;
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function page(share: Share, url: string): string {
  const title = escapeHtml(share.title);
  const description = escapeHtml(share.description);
  const href = escapeHtml(url);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${href}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Itera">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${href}">
<meta property="og:image" content="${IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@DevFellowship">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${IMAGE}">
<meta http-equiv="refresh" content="0;url=${href}">
</head><body><p><a href="${href}">${title}</a></p></body></html>`;
}

/** A certification or a Tera companion, by the address of its asset. */
async function credentialShare(db: IteraClient, asset: string): Promise<Share> {
  // Day stamps share the asset of their certification: the certification row is the one to describe.
  const { data: rows, error } = await db.from('user_achievements').select('achievement_key,state').eq('asset_address', asset).limit(20);
  if (error) throw new Error(`user_achievements: ${error.message}`);
  const found = (rows ?? []) as Array<{ achievement_key: string; state: Record<string, unknown> }>;
  const row = found.find((entry) => entry.achievement_key === 'trail_pass') ?? found[0];
  if (row) {
    const state = row.state ?? {};
    const trail = typeof state.trail_title === 'object' && state.trail_title ? pickText(state.trail_title as Record<string, string>, 'en') : null;
    const days = typeof state.days_done === 'number' && typeof state.total_days === 'number' ? `${state.days_done}/${state.total_days} days stamped` : null;
    const tier = typeof state.tier === 'string' ? state.tier : null;
    if (row.achievement_key === 'trail_pass') {
      return {
        title: `${trail ?? 'Certification'} · ${tier ? `${tier} ` : ''}certification | Itera`,
        description: `${days ? `${days}, ` : ''}verified on Solana devnet: a soulbound Metaplex Core asset the server stamps for every finished day. Open to verify it on chain.`,
      };
    }
    return { title: `${trail ?? 'Achievement'} · medal | Itera`, description: 'An achievement written on Solana devnet, verifiable by anyone without a login.' };
  }
  const { data: companions, error: companionError } = await db.from('companions').select('avatar,outfit').eq('asset_address', asset).limit(1);
  if (companionError) throw new Error(`companions: ${companionError.message}`);
  if (companions?.[0]) return { title: 'Tera Companion | Itera', description: 'A learner’s soulbound Tera on Solana devnet: lives, level and outfit mirrored on chain. Open to verify it.' };
  return DEFAULT;
}

/** The public profile of a wallet: how much of the capability graph it has proven. */
async function profileShare(db: IteraClient, wallet: string): Promise<Share> {
  const [certifications, companions] = await Promise.all([
    db.from('user_achievements').select('achievement_key', { count: 'exact', head: true }).eq('wallet_address', wallet).eq('mint_status', 'minted').eq('achievement_key', 'trail_pass'),
    db.from('companions').select('asset_address', { count: 'exact', head: true }).eq('wallet_address', wallet).eq('mint_status', 'minted'),
  ]);
  if (certifications.error) throw new Error(`user_achievements: ${certifications.error.message}`);
  if (companions.error) throw new Error(`companions: ${companions.error.message}`);
  const n = certifications.count ?? 0;
  const hasCompanion = (companions.count ?? 0) > 0;
  const label = n === 1 ? '1 certification' : n > 1 ? `${n} certifications` : hasCompanion ? 'a Tera companion' : 'a learner profile';
  return {
    title: `${short(wallet)} · ${label} on Solana | Itera`,
    description: n > 0 && hasCompanion ? `This wallet’s verifiable capability graph: ${label}, a Tera companion, every proof read back from Solana devnet.` : `This wallet’s verifiable capability graph on Solana devnet: ${label}, every proof read back from chain.`,
  };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405, cors);
  const verdict = limiter.take(callerAddress(request));
  if (!verdict.allowed) return tooMany(verdict, cors);

  try {
    const [kind, id, ...rest] = pathAfter(request, 'share-meta');
    let share = DEFAULT;
    let url = APP_URL;
    if (rest.length === 0 && id && isSolanaAddress(id)) {
      const db = serviceClient();
      if (kind === 'c') {
        share = await credentialShare(db, id);
        url = `${APP_URL}/c/${id}`;
      } else if (kind === 'u') {
        share = await profileShare(db, id);
        url = `${APP_URL}/u/${id}`;
      } else if (kind === 'gift') {
        share = { title: `Gift a life to ${short(id)} | Itera`, description: 'One devnet SOL transfer, signed by your wallet, gives this learner’s Tera a life, written on chain.' };
        url = `${APP_URL}/gift/${id}`;
      }
    }
    return new Response(page(share, url), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE, 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
    });
  } catch (error) {
    console.error('share-meta failed', error);
    return new Response(page(DEFAULT, APP_URL), { status: 200, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
});
