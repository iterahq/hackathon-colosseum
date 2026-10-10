/** Live-class podium medals: the instructor records the top three on Solana; participants read which places are on chain. */
import { callShop } from '@/services/shopTransport';
import type { PodiumChainPlace, PodiumPlaceResult, PodiumRecord } from '@/types/classPodium';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function toPodiumRecord(v: unknown): PodiumRecord {
  const r = row(v);
  const places: PodiumPlaceResult[] = rows(r.places).map((p) => ({
    position: num(p.position),
    key: str(p.key),
    title: str(p.title),
    userId: str(p.user_id),
    name: orNull(p.name),
    correct: num(p.correct),
    answered: num(p.answered),
    wallet: orNull(p.wallet),
    mintStatus: str(p.mint_status) || 'unclaimed',
    assetAddress: orNull(p.asset_address),
    explorerUrl: orNull(p.explorer_url),
    imageUrl: orNull(p.image_url),
  }));
  return { sessionId: str(r.session_id), alreadyRecorded: r.already_recorded === true, places: places.filter((p) => p.position >= 1 && p.position <= 3) };
}

export function toPodiumChain(v: unknown): PodiumChainPlace[] {
  return rows(row(v).places)
    .map((p) => ({ position: num(p.position), userId: str(p.user_id), minted: p.mint_status === 'minted', explorerUrl: orNull(p.explorer_url) }))
    .filter((p) => p.userId);
}

/** Instructor/owner of the session's tenant only (checked by the backend). Safe to repeat: a session is recorded once. */
export async function recordClassPodium(sessionId: string, lang: string): Promise<PodiumRecord> {
  const { data } = await callShop('class-podium', { body: { session_id: sessionId, lang } });
  return toPodiumRecord(data);
}

export async function getClassPodiumChain(sessionId: string): Promise<PodiumChainPlace[]> {
  const { data } = await callShop('class-podium', { body: { session_id: sessionId, view: true } });
  return toPodiumChain(data);
}
