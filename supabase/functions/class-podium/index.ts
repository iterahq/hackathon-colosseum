import { callerFailureStatus, resolveCaller } from '../_shared/caller.ts';
import { earnCrystals, earningsOfPodium } from '../_shared/crystals-store.ts';
import { explorerUrl, imageUrl, pickText, type AchievementRow, type CatalogEntry } from '../_shared/credential.ts';
import { CATALOG_COLUMNS, ROW_COLUMNS, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, isUuid, json, readJsonObject } from '../_shared/http.ts';
import { PODIUM_KEYS, podiumKey, podiumOf, podiumState, type PodiumPlace, type PodiumPosition } from '../_shared/podium.ts';
import { isStaffOf, staffTenantIds } from '../_shared/staff.ts';
import { loadMemberships } from '../_shared/staff-store.ts';

const TIME_ZONE = 'America/Sao_Paulo';
const MINT_JOBS = 10;

type Lang = 'pt' | 'en';
type StoredPlace = Pick<PodiumPlace, 'position' | 'correct' | 'answered'> & { user_id: string };

interface Session {
  id: string;
  tenant_id: string;
  lesson_id: string;
  instructor_id: string;
  status: string;
  ended_at: string | null;
}

async function rowsOf<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return (data ?? []) as T[];
}

/** The podium of a session from its durable rows, by the rule of the instructor report. */
async function computePlaces(db: IteraClient, session: Session): Promise<StoredPlace[]> {
  const [attendance, answers, guests] = await Promise.all([
    rowsOf<{ user_id: string }>(db.from('class_attendance').select('user_id').eq('session_id', session.id), 'class_attendance'),
    rowsOf<{ user_id: string; correct: boolean; elapsed_ms: number | null }>(db.from('class_answers').select('user_id,correct,elapsed_ms').eq('session_id', session.id), 'class_answers'),
    rowsOf<{ user_id: string }>(db.from('class_guests').select('user_id').eq('session_id', session.id), 'class_guests'),
  ]);
  const ids = [...new Set([...attendance, ...answers].map((row) => row.user_id))];
  const users = ids.length === 0 ? [] : await rowsOf<{ id: string; display_name: string | null; email: string | null; is_guest: boolean }>(db.from('users').select('id,display_name,email,is_guest').in('id', ids), 'users');
  const names = Object.fromEntries(users.map((user) => [user.id, user.display_name || user.email || user.id.slice(0, 8)]));
  const guestIds = [...guests.map((guest) => guest.user_id), ...users.filter((user) => user.is_guest).map((user) => user.id)];
  return podiumOf({ attendance, answers, names, guestIds, excludedIds: [session.instructor_id] }).map((place) => ({
    position: place.position,
    user_id: place.userId,
    correct: place.correct,
    answered: place.answered,
  }));
}

async function loadMedals(db: IteraClient, sessionId: string): Promise<AchievementRow[]> {
  return rowsOf<AchievementRow>(db.from('user_achievements').select(ROW_COLUMNS).eq('ref_id', sessionId).in('achievement_key', [...PODIUM_KEYS]), 'user_achievements');
}

/** Mints a learner's pending rows through `passport`, the one mint path, as the operator. True when it answered. */
async function syncLearner(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${functionsBase()}/passport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, max_jobs: MINT_JOBS }),
    });
    await response.body?.cancel();
    return response.ok;
  } catch (error) {
    console.error('class-podium: passport sync failed', error);
    return false;
  }
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
    const sessionId = body?.session_id;
    const view = body?.view === true;
    if (!body || typeof sessionId !== 'string' || !isUuid(sessionId)) return json({ error: 'invalid_body' }, 400, cors);
    const lang: Lang = body.lang === 'en' ? 'en' : 'pt';

    // Rights come from the caller's memberships in the database, joined to the tenant of the session.
    const memberships = await loadMemberships(db, caller.iteraUserId);
    if (!view && staffTenantIds(memberships).length === 0) return json({ error: 'forbidden' }, 403, cors);
    const { data: found, error: sessionError } = await db.from('class_sessions').select('id,tenant_id,lesson_id,instructor_id,status,ended_at').eq('id', sessionId).maybeSingle();
    if (sessionError) throw new Error(`class_sessions: ${sessionError.message}`);
    const session = found as Session | null;

    if (view) {
      // A participant's read: which places of this class are on chain. The ids are the ones the class ranking already shares; no name, no wallet.
      const attended = session ? (await rowsOf<{ user_id: string }>(db.from('class_attendance').select('user_id').eq('session_id', sessionId).eq('user_id', caller.iteraUserId), 'class_attendance')).length > 0 : false;
      if (!session || !(attended || memberships.some((membership) => membership.tenant_id === session.tenant_id))) return json({ error: 'forbidden' }, 403, cors);
      const medals = await loadMedals(db, sessionId);
      return json(
        {
          session_id: sessionId,
          recorded: medals.length > 0,
          places: medals
            .map((row) => ({ position: PODIUM_KEYS.indexOf(row.achievement_key as (typeof PODIUM_KEYS)[number]) + 1, user_id: row.user_id, mint_status: row.mint_status, asset_address: row.asset_address, explorer_url: explorerUrl('address', row.asset_address), mine: row.user_id === caller.iteraUserId }))
            .sort((a, b) => a.position - b.position),
        },
        200,
        cors,
      );
    }

    if (!session) return json({ error: 'session_not_found' }, 404, cors);
    if (!isStaffOf(memberships, session.tenant_id)) return json({ error: 'forbidden' }, 403, cors);
    if (session.status !== 'ended') return json({ error: 'session_not_ended' }, 409, cors);

    // The first call fixes the podium; every later call reads that row.
    const { data: before, error: beforeError } = await db.from('class_podiums').select('places,recorded_at').eq('session_id', sessionId).maybeSingle();
    if (beforeError) throw new Error(`class_podiums: ${beforeError.message}`);
    if (!before) {
      const places = await computePlaces(db, session);
      const { error } = await db
        .from('class_podiums')
        .upsert({ session_id: sessionId, tenant_id: session.tenant_id, recorded_by: caller.iteraUserId, places }, { onConflict: 'session_id', ignoreDuplicates: true });
      if (error) throw new Error(`class_podiums insert: ${error.message}`);
    }
    const { data: podium, error: podiumError } = await db.from('class_podiums').select('places,recorded_at').eq('session_id', sessionId).single();
    if (podiumError) throw new Error(`class_podiums: ${podiumError.message}`);
    const places = podium.places as StoredPlace[];

    const { data: lesson } = await db.from('lessons').select('title_i18n').eq('id', session.lesson_id).maybeSingle();
    const classTitle = (lesson?.title_i18n ?? {}) as Record<string, string>;
    const endedAt = session.ended_at ?? podium.recorded_at;
    if (places.length > 0) {
      const { error } = await db.from('user_achievements').upsert(
        places.map((place) => ({
          user_id: place.user_id,
          achievement_key: podiumKey(place.position as PodiumPosition),
          ref_id: sessionId,
          earned_at: endedAt,
          state: podiumState({ ...place, userId: place.user_id, totalMs: 0, position: place.position as PodiumPosition }, { title: classTitle, endedAt }, TIME_ZONE),
        })),
        { onConflict: 'user_id,achievement_key,ref_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(`user_achievements podium: ${error.message}`);
      // Phoenix Crystals for the three places, once per class. Never fails the call.
      await earnCrystals(db, earningsOfPodium(sessionId, places));
    }

    // One learner at a time: the public devnet node throttles bursts. Only rows still off chain are tried.
    let medals = await loadMedals(db, sessionId);
    const due = places.filter((place) => medals.find((row) => row.user_id === place.user_id)?.mint_status !== 'minted');
    for (const place of due) await syncLearner(place.user_id);
    if (due.length > 0) medals = await loadMedals(db, sessionId);

    const [catalog, users] = await Promise.all([
      rowsOf<CatalogEntry>(db.from('achievements').select(CATALOG_COLUMNS).in('key', [...PODIUM_KEYS]), 'achievements'),
      places.length === 0 ? [] : rowsOf<{ id: string; display_name: string | null }>(db.from('users').select('id,display_name').in('id', places.map((place) => place.user_id)), 'users'),
    ]);
    const base = functionsBase();
    return json(
      {
        session_id: sessionId,
        recorded_at: podium.recorded_at,
        already_recorded: Boolean(before),
        class: { title: pickText(classTitle, lang), date: podiumState({ position: 1, userId: '', correct: 0, answered: 0, totalMs: 0 }, { title: classTitle, endedAt }, TIME_ZONE).class_date },
        places: places.map((place) => {
          const key = podiumKey(place.position as PodiumPosition);
          const row = medals.find((medal) => medal.user_id === place.user_id && medal.achievement_key === key);
          return {
            position: place.position,
            key,
            title: pickText(catalog.find((entry) => entry.key === key)?.title_i18n, lang),
            user_id: place.user_id,
            name: users.find((user) => user.id === place.user_id)?.display_name ?? null,
            correct: place.correct,
            answered: place.answered,
            wallet: row?.wallet_address ?? null,
            mint_status: row?.mint_status ?? 'unclaimed',
            asset_address: row?.asset_address ?? null,
            explorer_url: explorerUrl('address', row?.asset_address ?? null),
            tx_explorer_url: explorerUrl('tx', row?.tx_signature ?? null),
            image_url: row ? `${imageUrl(base, row.id)}?lang=${lang}` : null,
          };
        }),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('class-podium failed', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
});
