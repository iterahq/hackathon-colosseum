import { isSolanaAddress } from '../_shared/address.ts';
import { readAssets } from '../_shared/chain-read.ts';
import { walletCircuit } from '../_shared/circuit-store.ts';
import { loadStats } from '../_shared/companion-store.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import type { AchievementRow, CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, json, langOf, pathAfter } from '../_shared/http.ts';
import { regenerate } from '../_shared/lives.ts';
import { PROFILE_ASSET_LIMIT, buildProfile, type OnchainAsset, type ProfileCompanion } from '../_shared/profile.ts';
import { RpcError } from '../_shared/rpc.ts';

const COMPANION_COLUMNS = 'id,user_id,asset_address,lives,max_lives,last_regen_at,outfit,version,mirrored_at';

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const [wallet, ...rest] = pathAfter(request, 'learner-profile');
    if (!isSolanaAddress(wallet) || rest.length > 0) return json({ error: 'invalid_address' }, 400, cors);

    const db = serviceClient();
    const [config, achievements, companions, catalogRows] = await Promise.all([
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
    const assets = [...(achievements.data ?? []).map((row) => row.asset_address as string), ...(companionRow ? [companionRow.asset_address as string] : [])];
    const collections = [config.collection_passports, config.collection_medals, config.collection_companions].filter(Boolean);
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
    return json({ ...profile, circuit: await walletCircuit(db, wallet) }, 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
  } catch (error) {
    console.error('learner-profile failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
