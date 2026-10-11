import { isSolanaAddress } from '../_shared/address.ts';
import { AVATAR_ASSET_COLUMNS, avatarBlock, loadAvatarCatalog, supabaseUrl } from '../_shared/avatar-store.ts';
import { fallbackAvatarView, type AvatarAssetRow, type AvatarCatalog } from '../_shared/avatars.ts';
import { ITERA_V2_GRAPH } from '../_shared/capability-graph.ts';
import { readAssets } from '../_shared/chain-read.ts';
import { walletCircuit } from '../_shared/circuit-store.ts';
import { buildGraph, graphProofs } from '../_shared/claims.ts';
import { loadEvidence, loadGraphData } from '../_shared/claims-store.ts';
import { loadStats } from '../_shared/companion-store.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import { explorerUrl, pickText, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, json, langOf, pathAfter } from '../_shared/http.ts';
import { regenerate } from '../_shared/lives.ts';
import { PROFILE_ASSET_LIMIT, buildProfile, isVerified, profileAvatars, type OnchainAsset, type ProfileCompanion } from '../_shared/profile.ts';
import { RpcError } from '../_shared/rpc.ts';

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

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const [wallet, ...rest] = pathAfter(request, 'learner-profile');
    const evidenceOf = rest.length === 2 && rest[0] === 'evidence' && /^[a-z0-9-]{1,24}$/.test(rest[1]) ? rest[1] : null;
    if (!isSolanaAddress(wallet) || (rest.length > 0 && !evidenceOf)) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    // The document whose SHA-256 is on the asset: public, so anyone can hash it and compare.
    if (evidenceOf) {
      const evidence = await loadEvidence(db, wallet, evidenceOf);
      if (!evidence) return json({ error: 'not_found' }, 404, cors);
      return json({ wallet, ...evidence, tx_explorer_url: explorerUrl('tx', evidence.tx_signature) }, 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
    }
    const [walletAvatars, config, achievements, companions, catalogRows] = await Promise.all([
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
    ];
    const collections = [config.collection_passports, config.collection_medals, config.collection_companions, config.collection_avatars].filter(Boolean);
    const now = new Date();

    let onchain: Map<string, OnchainAsset>;
    let rows: AchievementRow[];
    let companion: ProfileCompanion | null = null;
    try {
      const [read, restored, stats] = await Promise.all([
        readAssets(assets, collections),
        restoreCosmetics(db, (achievements.data ?? []) as AchievementRow[]),
        companionRow ? loadStats(db, companionRow.user_id, now) : null,
      ]);
      onchain = read;
      rows = restored;
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
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      console.error('learner-profile rpc failed', error.message);
      return json({ error: 'upstream_unavailable' }, 502, cors);
    }

    const profile = buildProfile({
      wallet,
      lang: langOf(request, 'pt'),
      functionsBase: functionsBase(),
      config,
      rows,
      catalog: new Map((catalogRows.data as CatalogEntry[]).map((entry) => [entry.key, entry])),
      companion,
      onchain,
    });
    // What this wallet's own purchases sent to the key that pays for stamps (the Circuito).
    // The picture this learner wears (the default for a wallet with no companion) and the collectibles minted to the wallet.
    const lang = langOf(request, 'pt');
    const [avatar, circuit, graphData] = await Promise.all([
      companionRow ? avatarBlock(db, companionRow.user_id, companionRow.avatar, lang) : avatarBlock(db, '00000000-0000-0000-0000-000000000000', null, lang).catch(() => fallbackAvatarView(supabaseUrl())),
      walletCircuit(db, wallet),
      loadGraphData(db, ITERA_V2_GRAPH.program, rows.filter((row) => row.achievement_key === 'trail_pass').map((row) => row.id)),
    ]);
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
    const avatars = walletAvatars ? profileAvatars({ wallet, lang, supabaseUrl: supabaseUrl(), config, catalog: walletAvatars.catalog, rows: walletAvatars.rows, onchain }) : [];
    return json({ ...profile, capabilities, avatar, avatars, circuit }, 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
  } catch (error) {
    console.error('learner-profile failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
