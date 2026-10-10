/** Teacher endorsement of a learner's certification: the instructor's list and the on-chain write. */
import { callShop } from '@/services/shopTransport';
import type { EndorseResult, PublicEndorsement, StudentCertifications } from '@/types/endorsement';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const NOTE_MAX = 140;

export function toPublicEndorsements(v: unknown): PublicEndorsement[] {
  return rows(v)
    .map((e) => ({ wallet: str(e.wallet), at: str(e.at), explorerUrl: orNull(e.explorer_url) }))
    .filter((e) => e.wallet);
}

export function toStudentCertifications(v: unknown): StudentCertifications {
  const r = row(v);
  return {
    wallet: orNull(r.wallet),
    certifications: rows(r.certifications)
      .map((c) => ({
        id: str(c.user_achievement_id),
        learnerName: orNull(c.learner_name),
        trail: str(c.trail),
        daysDone: num(c.days_done),
        totalDays: num(c.total_days),
        tier: str(c.tier) || 'bronze',
        assetAddress: str(c.asset_address),
        imageUrl: orNull(c.image_url),
        endorsements: num(c.endorsements),
        endorsedByMe: c.endorsed_by_me === true,
      }))
      .filter((c) => c.id && c.assetAddress),
  };
}

export function toEndorseResult(v: unknown): EndorseResult {
  const r = row(v);
  return { alreadyEndorsed: r.already_endorsed === true, assetAddress: str(r.asset), explorerUrl: orNull(row(r.endorsement).explorer_url), endorsements: toPublicEndorsements(r.endorsements) };
}

/** The minted certifications of the learners the caller teaches. The backend refuses anyone who is not an instructor or owner. */
export async function getStudentCertifications(lang: string): Promise<StudentCertifications> {
  const { data } = await callShop('endorse', { body: { action: 'list', lang } });
  return toStudentCertifications(data);
}

/** Writes the instructor's wallet on the learner's certification asset. Public and permanent; one per instructor. */
export async function endorseCertification(id: string, note: string, lang: string): Promise<EndorseResult> {
  const text = note.trim();
  const { data } = await callShop('endorse', { body: { user_achievement_id: id, lang, ...(text ? { note: text } : {}) } });
  return toEndorseResult(data);
}
