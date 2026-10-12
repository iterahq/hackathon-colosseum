import { isSolanaAddress } from '../_shared/address.ts';
import { AVATAR_ASSET_COLUMNS, avatarBlock, loadAvatarCatalog, supabaseUrl } from '../_shared/avatar-store.ts';
import { fallbackAvatarView, type AvatarAssetRow, type AvatarCatalog } from '../_shared/avatars.ts';
import { ITERA_V2_GRAPH } from '../_shared/capability-graph.ts';
import { readAssets } from '../_shared/chain-read.ts';
import { walletCircuit } from '../_shared/circuit-store.ts';
import { buildGraph, graphProofs } from '../_shared/claims.ts';
import { loadEvidence, loadGraphData, loadJourney } from '../_shared/claims-store.ts';
import { loadStats } from '../_shared/companion-store.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import { explorerUrl, pickText, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, json, langOf, pathAfter } from '../_shared/http.ts';
import { regenerate } from '../_shared/lives.ts';
import { bountiesOf, sponsorProfileEntry, sponsorTerasOfWallet } from '../_shared/sponsor-tera-store.ts';
import { privateProfile } from '../_shared/privacy.ts';
import { walletView } from '../_shared/privacy-store.ts';
import { earnedBlocks } from '../_shared/tera-chest-store.ts';
import { PROFILE_ASSET_LIMIT, buildProfile, isVerified, profileAvatars, type OnchainAsset, type ProfileCompanion } from '../_shared/profile.ts';
import { RpcError } from '../_shared/rpc.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { cachedRead, chainVersion, loadCacheRow, wantsFresh } from '../_shared/read-cache.ts';

const COMPANION_COLUMNS = 'id,user_id,asset_address,lives,max_lives,last_regen_at,outfit,avatar,version,mirrored_at';
const AVATAR_LIMIT = 30;

/** The collectibles minted to this wallet and the catalog they belong to. Never fatal: the rest of the profile does not depend on it. */
async function loadWalletAvatars(db: ReturnType<typeof serviceClient>, wallet: string): Promise<{ catalog: AvatarCatalog; rows: AvatarAssetRow[] } | null> {
  try {
    const [catalog, rows] = await Promise.all([
      loadAvatarCatalog(db),
      db.from('avatar_assets').select(AVATAR_ASSET_COLUMNS).eq('wallet', wallet).eq('mint_status', 'minted').not('asset_address', 'is', null).order('minted_at').limit(AVATAR_LIMIT),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    return { catalog, rows: (rows.data ?? []) as AvatarAssetRow[] };
  } catch (error) {
    console.error('learner-profile: avatars unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

const RATE: RateLimit = { limit: 120, windowMs: 60_000 };
const JOURNEY_RATE: RateLimit = { limit: 60, windowMs: 60_000 };

/** Everything a wallet earned, with its assets read from the chain now. Throws `RpcError` when the node did not answer. */
async function build(db: ReturnType<typeof serviceClient>, wallet: string, lang: 'pt' | 'en') {
  const [sponsorRows, walletAvatars, config, achievements, companions, catalogRows] = await Promise.all([
    sponsorTerasOfWallet(db, wallet),
    loadWalletAvatars(db, wallet),
    loadConfig(db),
    // Stamps and completions live inside their certification's asset: they own none.
    db
      .from('user_achievements')
      .select(ROW_COLUMNS)
      .eq('wallet_address', wallet)
      .eq('mint_status', 'minted')
      .not('asset_address', 'is', null)
      .not('achievement_key', 'in', '(day_stamp,trail_complete)')
      .order('earned_at')
      .order('id')
      .limit(PROFILE_ASSET_LIMIT),
    db
      .from('companions')
      .select(COMPANION_COLUMNS)
      .eq('wallet_address', wallet)
      .eq('mint_status', 'minted')
      .not('asset_address', 'is', null)
      .order('minted_at')
      .limit(1),
    db.from('achievements').select(CATALOG_COLUMNS),
  ]);
  if (achievements.error) throw new Error(`user_achievements: ${achievements.error.message}`);
  if (companions.error) throw new Error(`companions: ${companions.error.message}`);
  if (catalogRows.error) throw new Error(`achievements: ${catalogRows.error.message}`);

  const companionRow = companions.data?.[0] ?? null;
  const assets = [
    ...(achievements.data ?? []).map((row) => row.asset_address as string),
    ...(companionRow ? [companionRow.asset_address as string] : []),
    ...(walletAvatars?.rows ?? []).map((row) => row.asset_address as string),
    ...sponsorRows.map((row) => row.asset_address as string),
  ];
  const collections = [config.collection_passports, config.collection_medals, config.collection_companions, config.collection_avatars].filter(Boolean);
  const now = new Date();
  const trailRowIds = ((achievements.data ?? []) as AchievementRow[]).filter((row) => row.achievement_key === 'trail_pass').map((row) => row.id);

  // The chain, the cosmetics, the stats, the circuit, the worn picture and the recorded claims: one wave, nothing waits on the node but the node.
  const [onchain, rows, stats, avatar, circuit, graphData] = await Promise.all([
    readAssets(assets, collections),
    restoreCosmetics(db, (achievements.data ?? []) as AchievementRow[]),
    companionRow ? loadStats(db, companionRow.user_id, now) : null,
    companionRow ? avatarBlock(db, companionRow.user_id, companionRow.avatar, lang) : avatarBlock(db, '00000000-0000-0000-0000-000000000000', null, lang).catch(() => fallbackAvatarView(supabaseUrl())),
    walletCircuit(db, wallet),
    loadGraphData(db, ITERA_V2_GRAPH.program, trailRowIds),
  ]);
  let companion: ProfileCompanion | null = null;
  if (companionRow && stats) {
    const lives = regenerate({ lives: companionRow.lives, maxLives: companionRow.max_lives, lastRegenAt: companionRow.last_regen_at }, now);
    companion = {
      id: companionRow.id,
      asset_address: companionRow.asset_address,
      version: companionRow.version,
      mirrored_at: companionRow.mirrored_at,
      stored: { lives: lives.lives, max_lives: companionRow.max_lives, outfit: companionRow.outfit, ...stats },
    };
  }

  const profile = buildProfile({
    wallet,
    lang,
    functionsBase: functionsBase(),
    config,
    rows,
    catalog: new Map((catalogRows.data as CatalogEntry[]).map((entry) => [entry.key, entry])),
    companion,
    onchain,
  });
  // What the wallet can do: lit only by claims read from its own verified assets in this request.
  const capabilities = buildGraph({
    graph: ITERA_V2_GRAPH,
    lang,
    trails: graphData.trails.map(({ trail, title }) => ({ trail, title: pickText(title, lang) })),
    proofs: graphProofs({
      rows,
      proofs: graphData.proofs,
      attributesOf: (asset) => onchain.get(asset)?.attributes ?? null,
      isVerified: (asset) => isVerified(onchain.get(asset), { wallet, collection: config.collection_passports, authority: config.authority }),
    }),
    explorer: explorerUrl,
  });
  const avatars = walletAvatars
    ? profileAvatars({ wallet, lang, supabaseUrl: supabaseUrl(), config, catalog: walletAvatars.catalog, rows: walletAvatars.rows, onchain, earned: await earnedBlocks(db, walletAvatars.rows, lang) })
    : [];
  // The prize Teras of bounties this wallet was paid for: listed with the others, told apart by `origin: "sponsor"`.
  const sponsorBounties = sponsorRows.length > 0 ? await bountiesOf(db, sponsorRows).catch(() => new Map()) : new Map();
  const sponsored = sponsorRows.map((row) => sponsorProfileEntry(row, sponsorBounties.get(row.bounty_id), onchain.get(row.asset_address as string), config, lang));
  return { ...profile, capabilities, avatar, avatars: [...avatars, ...sponsored], circuit };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
  const started = Date.now();

  try {
    const [wallet, ...rest] = pathAfter(request, 'learner-profile');
    const claimOf = (route: string) => (rest.length === 2 && rest[0] === route && /^[a-z0-9-]{1,24}$/.test(rest[1]) ? rest[1] : null);
    const evidenceOf = claimOf('evidence');
    const journeyFor = claimOf('journey');
    if (!isSolanaAddress(wallet) || (rest.length > 0 && !evidenceOf && !journeyFor)) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    const verdict = journeyFor
      ? await takeRate(db, 'learner-profile-journey', callerAddress(request), JOURNEY_RATE)
      : await takeRate(db, 'learner-profile', callerAddress(request), RATE);
    if (!verdict.allowed) return tooMany(verdict, cors);
    // The attempt track is ours, not the chain's: it is part of the page, so a private wallet answers a stranger nothing of it.
    if (journeyFor) {
      const view = await walletView(db, request, wallet);
      if (!view.visible) return json({ ...privateProfile(wallet), claim: journeyFor }, 200, { ...cors, 'Cache-Control': 'no-store' });
      const journey = await loadJourney(db, wallet, journeyFor);
      if (!journey) return json({ error: 'not_found' }, 404, cors);
      return json({ wallet, claim: journeyFor, source: 'itera', ...journey }, 200, { ...cors, 'Cache-Control': view.public && !view.owner ? 'public, max-age=20' : 'no-store' });
    }
    // The document whose SHA-256 is on the asset: public, so anyone can hash it and compare.
    if (evidenceOf) {
      const evidence = await loadEvidence(db, wallet, evidenceOf);
      if (!evidence) return json({ error: 'not_found' }, 404, cors);
      return json({ wallet, ...evidence, tx_explorer_url: explorerUrl('tx', evidence.tx_signature) }, 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
    }
    const lang = langOf(request, 'pt');
    const fresh = wantsFresh(request);
    const key = `learner-profile:${wallet}:${lang}`;
    const [version, row, view] = await Promise.all([chainVersion(db, wallet), loadCacheRow(db, key), walletView(db, request, wallet)]);
    // The profile page is a choice. A private wallet answers a stranger its own address and one flag: none of what our
    // tables aggregate about it. Its owner, signed in, gets the whole page. Decided before the cache is even looked at.
    if (!view.visible) return json(privateProfile(wallet), 200, { ...cors, 'Cache-Control': 'no-store' });
    try {
      const { body, read } = await cachedRead(db, { key, version, fresh, row }, () => build(db, wallet, lang));
      return json({ ...body, private: !view.public, viewer: view.owner ? 'owner' : 'public', read }, 200, {
        ...cors,
        // An answer given to the owner of a private page, or to any signed request, is never stored by a shared cache.
        'Cache-Control': fresh || view.owner || !view.public ? 'no-store' : 'public, max-age=20',
        'Server-Timing': `${read.source};dur=${read.ms}, edge;dur=${Date.now() - started}`,
      });
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      console.error('learner-profile rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }
  } catch (error) {
    console.error('learner-profile failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
