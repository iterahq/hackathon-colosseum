import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { restoreCosmetics } from '../_shared/cosmetics-store.ts';
import { APP_URL, explorerUrl, imageUrl, onchainAttributes, pickText, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { cleanNote, endorseVerdict, endorsementsOf } from '../_shared/endorsement.ts';
import { corsHeaders, functionsBase, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { canEndorse, staffTenantIds } from '../_shared/staff.ts';
import { loadMemberships } from '../_shared/staff-store.ts';

const UNIQUE_VIOLATION = '23505';
const LIST_LIMIT = 200;

type Lang = 'pt' | 'en';
interface EndorsementRow {
  id: string;
  user_achievement_id: string;
  instructor_user_id: string;
  wallet: string;
  slot: number;
  tx_signature: string | null;
  created_at: string;
}

async function loadEndorsements(db: IteraClient, rowIds: string[]): Promise<EndorsementRow[]> {
  if (rowIds.length === 0) return [];
  const { data, error } = await db.from('endorsements').select('id,user_achievement_id,instructor_user_id,wallet,slot,tx_signature,created_at').in('user_achievement_id', rowIds).order('slot');
  if (error) throw new Error(`endorsements: ${error.message}`);
  return (data ?? []) as EndorsementRow[];
}

const publicView = (entry: EndorsementRow) => ({
  wallet: entry.wallet,
  at: new Date(entry.created_at).toISOString(),
  tx_signature: entry.tx_signature,
  explorer_url: explorerUrl('tx', entry.tx_signature),
});

/** The minted certifications of the learners in the tenants the caller teaches. */
async function listCertifications(db: IteraClient, callerId: string, tenantIds: string[], lang: Lang) {
  const { data: members, error: membersError } = await db.from('memberships').select('user_id').in('tenant_id', tenantIds).neq('user_id', callerId).limit(2000);
  if (membersError) throw new Error(`memberships: ${membersError.message}`);
  const learnerIds = [...new Set((members ?? []).map((member) => member.user_id as string))];
  if (learnerIds.length === 0) return [];
  const { data: rows, error } = await db
    .from('user_achievements')
    .select(ROW_COLUMNS)
    .eq('achievement_key', 'trail_pass')
    .eq('mint_status', 'minted')
    .in('user_id', learnerIds)
    .order('earned_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(`user_achievements: ${error.message}`);
  const certifications = (rows ?? []) as AchievementRow[];
  const [endorsements, users] = await Promise.all([
    loadEndorsements(db, certifications.map((row) => row.id)),
    db.from('users').select('id,display_name').in('id', [...new Set(certifications.map((row) => row.user_id))]),
  ]);
  if (users.error) throw new Error(`users: ${users.error.message}`);
  const names = new Map((users.data ?? []).map((user) => [user.id as string, user.display_name as string | null]));
  return certifications.map((row) => {
    const mine = endorsements.filter((entry) => entry.user_achievement_id === row.id);
    return {
      user_achievement_id: row.id,
      learner_name: names.get(row.user_id) ?? null,
      trail: pickText(row.state.trail_title, lang),
      days_done: typeof row.state.days_done === 'number' ? row.state.days_done : 0,
      total_days: typeof row.state.total_days === 'number' ? row.state.total_days : 0,
      tier: row.state.tier === 'gold' ? 'gold' : 'bronze',
      asset_address: row.asset_address,
      page_url: `${APP_URL}/c/${row.asset_address}`,
      image_url: `${imageUrl(functionsBase(), row.id)}?lang=${lang}&v=e${mine.length}`,
      endorsements: mine.length,
      endorsed_by_me: mine.some((entry) => entry.instructor_user_id === callerId),
    };
  });
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'app');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const db = serviceClient();
    const caller = await resolveCaller(db, request);
    if (typeof caller === 'string') return json({ error: caller }, callerFailureStatus(caller), cors);
    const body = await readJsonObject(request);
    if (!body) return json({ error: 'invalid_body' }, 400, cors);
    const lang: Lang = body.lang === 'en' ? 'en' : 'pt';

    // Rights come from the caller's memberships in the database: a teacher role in a tenant the learner belongs to.
    const callerMemberships = await loadMemberships(db, caller.iteraUserId);
    const staffOf = staffTenantIds(callerMemberships);
    if (staffOf.length === 0) return json({ error: 'forbidden' }, 403, cors);

    if (body.action === 'list') {
      return json({ wallet: caller.wallet, certifications: await listCertifications(db, caller.iteraUserId, staffOf, lang) }, 200, cors);
    }

    const rowId = body.user_achievement_id;
    const note = cleanNote(body.note);
    if (typeof rowId !== 'string' || !isUuid(rowId)) return json({ error: 'invalid_body' }, 400, cors);
    if (note === false) return json({ error: 'invalid_note' }, 400, cors);

    const { data: found, error: rowError } = await db.from('user_achievements').select(ROW_COLUMNS).eq('id', rowId).eq('achievement_key', 'trail_pass').maybeSingle();
    if (rowError) throw new Error(`user_achievements: ${rowError.message}`);
    const certification = found as AchievementRow | null;
    if (!certification) return json({ error: 'certification_not_found' }, 404, cors);

    const allowed = canEndorse({
      callerId: caller.iteraUserId,
      learnerId: certification.user_id,
      callerMemberships,
      learnerMemberships: certification.user_id === caller.iteraUserId ? callerMemberships : await loadMemberships(db, certification.user_id),
    });
    if (!allowed.ok) return json({ error: allowed.error }, 403, cors);
    if (!caller.wallet) return json({ error: 'no_wallet' }, 403, cors);
    if (certification.mint_status !== 'minted' || !certification.asset_address) return json({ error: 'not_minted' }, 409, cors);

    let existing = await loadEndorsements(db, [rowId]);
    let verdict = endorseVerdict(existing, caller.iteraUserId);
    if (verdict.action === 'full') return json({ error: 'endorsements_full' }, 409, cors);

    if (verdict.action === 'endorse') {
      const { error } = await db.from('endorsements').insert({ user_achievement_id: rowId, instructor_user_id: caller.iteraUserId, wallet: caller.wallet, note, slot: verdict.slot });
      if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`endorsements insert: ${error.message}`);
      existing = await loadEndorsements(db, [rowId]);
      // A concurrent endorsement may have taken the slot: the caller is in only if their row exists now.
      if (!existing.some((entry) => entry.instructor_user_id === caller.iteraUserId)) {
        verdict = endorseVerdict(existing, caller.iteraUserId);
        return json({ error: verdict.action === 'full' ? 'endorsements_full' : 'try_again', retryable: verdict.action !== 'full' }, 409, cors);
      }
    }
    let mine = existing.find((entry) => entry.instructor_user_id === caller.iteraUserId) as EndorsementRow;
    const alreadyEndorsed = verdict.action === 'already' && mine.tx_signature !== null;

    if (!mine.tx_signature) {
      try {
        const [[current], { data: catalog, error: catalogError }, config, sdk] = await Promise.all([
          restoreCosmetics(db, [certification]),
          db.from('achievements').select(CATALOG_COLUMNS).eq('key', 'trail_pass').single(),
          loadConfig(db),
          import('../_shared/chain.ts'),
        ]);
        if (catalogError) throw new Error(`achievements: ${catalogError.message}`);
        if (!config.collection_passports) throw new Error('passports collection is not configured');
        const signature = await sdk.updateCredentialAttributes(sdk.loadChain(), {
          asset: certification.asset_address,
          collection: config.collection_passports,
          attributes: onchainAttributes(current, catalog as CatalogEntry),
        });
        // The copy in `state` follows the table; the row is re-read so a stamp that landed meanwhile is kept.
        const { data: fresh } = await db.from('user_achievements').select('state').eq('id', rowId).single();
        await db.from('user_achievements').update({ state: { ...(fresh?.state ?? current.state), endorsements: endorsementsOf(current.state) } }).eq('id', rowId);
        const { error } = await db.from('endorsements').update({ tx_signature: signature }).eq('id', mine.id);
        if (error) throw new Error(`endorsements settle: ${error.message}`);
        mine = { ...mine, tx_signature: signature };
      } catch (failure) {
        // Nothing reached the chain: the endorsement is withdrawn, so no later write carries one that was never confirmed.
        console.error(`endorse ${rowId} chain write failed`, failure);
        await db.from('endorsements').delete().eq('id', mine.id).is('tx_signature', null);
        return json({ error: 'chain_write_failed', retryable: true }, 502, cors);
      }
    }

    const all = (await loadEndorsements(db, [rowId])).filter((entry) => entry.tx_signature !== null);
    return json(
      {
        status: 'endorsed',
        already_endorsed: alreadyEndorsed,
        asset: certification.asset_address,
        endorsement: { ...publicView(mine), slot: mine.slot },
        endorsements: all.map(publicView),
        image_url: `${imageUrl(functionsBase(), rowId)}?lang=${lang}&v=e${all.length}-${Date.now()}`,
        page_url: `${APP_URL}/c/${certification.asset_address}`,
        explorer_url: explorerUrl('address', certification.asset_address),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('endorse failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
