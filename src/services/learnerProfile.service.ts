/** Public read of a wallet's Itera credentials through the `learner-profile` edge function. Anon key only. */
import { toCircuitShare } from '@/services/circuit.service';
import { toAvatar } from '@/services/shopNormalize';
import { toTeraOrigin } from '@/services/teraOrigin';
import { ITERA_V2_GRAPH } from '../../supabase/functions/_shared/capability-graph';
import { parseChainRead } from '@/types/chainRead';
import type { Capabilities, CapabilityNode, CapabilityProof, CapabilityStatus, ClaimEvidence, LearnerProfile, ProfileLookup } from '@/types/learnerProfile';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

function parseProof(v: unknown): CapabilityProof | null {
  const p = row(v);
  const asset = text(p.asset);
  const attribute = text(p.attribute);
  const evidenceHash = text(p.evidence_hash);
  if (!asset || !attribute || !evidenceHash) return null;
  return {
    asset,
    attribute,
    onchainValue: text(p.onchain_value),
    evidenceHash,
    txSignature: text(p.tx_signature),
    provenAt: text(p.proven_at),
    assetExplorerUrl: text(p.asset_explorer_url),
    txExplorerUrl: text(p.tx_explorer_url),
  };
}

export function parseCapabilities(v: unknown): Capabilities | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = row(v);
  const nodes: CapabilityNode[] = rows(c.nodes)
    .filter((r) => text(r.id) && text(r.title))
    .map((r) => {
      const status: CapabilityStatus = r.status === 'verified' || r.status === 'recorded' ? r.status : 'open';
      return {
        id: String(r.id),
        trail: int(r.trail) ?? 0,
        day: int(r.day) ?? 1,
        title: String(r.title),
        requires: strings(r.requires),
        status,
        proof: status === 'open' ? null : parseProof(r.proof),
      };
    });
  if (nodes.length === 0) return null;
  return {
    program: text(c.program) ?? '',
    version: int(c.version) ?? 1,
    total: int(c.total) ?? nodes.length,
    verifiedCount: int(c.verified_count) ?? nodes.filter((n) => n.status === 'verified').length,
    next: text(c.next),
    trails: rows(c.trails).map((r) => ({ trail: int(r.trail) ?? 0, title: text(r.title) ?? '' })),
    nodes,
  };
}

export function parseEvidence(body: unknown): ClaimEvidence | null {
  const b = row(body);
  const evidence = text(b.evidence);
  const evidenceHash = text(b.evidence_hash);
  if (!evidence || !evidenceHash) return null;
  return {
    wallet: text(b.wallet) ?? '',
    claim: text(b.claim) ?? '',
    lessonId: text(b.lesson_id),
    evidence,
    evidenceHash,
    txSignature: text(b.tx_signature),
    txExplorerUrl: text(b.tx_explorer_url),
  };
}

export function parseProfile(body: unknown, wallet: string, lang: 'pt' | 'en'): LearnerProfile {
  const b = row(body);
  const c = b.companion && typeof b.companion === 'object' ? row(b.companion) : null;
  return {
    wallet: text(b.wallet) ?? wallet,
    avatar: toAvatar(b.avatar),
    avatars: rows(b.avatars)
      .filter((r) => text(r.key) && text(r.image_url))
      .map((r) => ({
        key: String(r.key),
        title: text(r.title) ?? String(r.key),
        tierName: text(r.tier_name) ?? '',
        serial: int(r.serial),
        verified: r.verified === true,
        imageUrl: String(r.image_url),
        explorerUrl: text(r.explorer_url),
        rarity: text(r.rarity),
        asset: text(r.asset),
        origin: toTeraOrigin(r),
      })),
    verifiedCount: int(b.verified_count) ?? 0,
    companion:
      c && text(c.asset)
        ? {
            asset: String(c.asset),
            verified: c.verified === true,
            lives: int(c.lives),
            maxLives: int(c.max_lives) ?? 5,
            outfit: text(c.outfit) && c.outfit !== 'none' ? String(c.outfit) : null,
            level: int(c.level),
            xp: int(c.xp),
            streak: int(c.streak),
            imageUrl: text(c.image_url),
            explorerUrl: text(c.explorer_url),
            mirroredAt: text(c.mirrored_at),
          }
        : null,
    certifications: rows(b.certifications)
      .filter((r) => text(r.asset))
      .map((r) => {
        const title = row(r.trail_title);
        return {
          asset: String(r.asset),
          verified: r.verified === true,
          trail: text(title[lang]) ?? text(r.trail) ?? '',
          daysDone: int(r.days_done) ?? 0,
          totalDays: int(r.total_days) ?? 0,
          tier: text(r.tier),
          ink: text(r.ink),
          frame: text(r.frame),
          completedAt: text(r.completed_at),
          earnedAt: text(r.earned_at),
          imageUrl: text(r.image_url),
          pageUrl: text(r.page_url),
          explorerUrl: text(r.explorer_url),
        };
      }),
    medals: rows(b.medals)
      .filter((r) => text(r.asset))
      .map((r) => ({
        asset: String(r.asset),
        verified: r.verified === true,
        key: text(r.key) ?? '',
        title: text(r.title) ?? text(r.key) ?? '',
        tier: text(r.tier),
        earnedAt: text(r.earned_at),
        imageUrl: text(r.image_url),
        explorerUrl: text(r.explorer_url),
      })),
    circuit: toCircuitShare(b.circuit),
    capabilities: parseCapabilities(b.capabilities),
  };
}

/** `fresh` asks the function to read the chain now instead of serving its cached answer. */
export async function getLearnerProfile(wallet: string, lang: 'pt' | 'en', { fresh = false }: { fresh?: boolean } = {}): Promise<ProfileLookup> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const started = Date.now();
  const live = () =>
    fetch(`${url}/functions/v1/learner-profile/${encodeURIComponent(wallet)}?lang=${lang}${fresh ? '&fresh=1' : ''}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: 'no-store',
    });
  const res = await ((fresh ? null : takePreload('__iteraProfile', wallet, lang)) ?? live()).catch(live);
  if (res.status === 400 || res.status === 404) return { status: 'invalid' };
  if (!res.ok) throw new Error(`learner-profile failed (${res.status})`);
  const body: unknown = await res.json();
  return { status: 'ok', profile: parseProfile(body, wallet, lang), read: parseChainRead((body as { read?: unknown })?.read, Date.now() - started) };
}

export async function getClaimEvidence(wallet: string, claimId: string): Promise<ClaimEvidence> {
  if (!url || !anonKey) throw new Error('Supabase not configured.');
  const res = await fetch(`${url}/functions/v1/learner-profile/${encodeURIComponent(wallet)}/evidence/${encodeURIComponent(claimId)}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`evidence failed (${res.status})`);
  const parsed = parseEvidence(await res.json());
  if (!parsed) throw new Error('evidence malformed');
  return parsed;
}

/** The graph with nothing proven, from the model the app ships with: drawn before any answer arrives. */
export function staticCapabilities(lang: 'pt' | 'en'): Capabilities {
  return {
    source: 'static',
    program: ITERA_V2_GRAPH.program,
    version: ITERA_V2_GRAPH.version,
    total: ITERA_V2_GRAPH.claims.length,
    verifiedCount: 0,
    next: null,
    trails: ITERA_V2_GRAPH.trails.map((title, trail) => ({ trail, title: title[lang] ?? title.en })),
    nodes: ITERA_V2_GRAPH.claims.map((c) => ({ id: c.id, trail: c.trail, day: c.day, title: c.title[lang] ?? c.title.en, requires: c.requires, status: 'open', proof: null })),
  };
}

interface Preload {
  wallet?: string;
  asset?: string;
  key?: string;
  lang: string;
  response: Promise<Response>;
}

/** `index.html` starts these requests for `/u/<wallet>` and `/c/<asset>` before the bundle loads; each is used once. */
export function takePreload(name: '__iteraGraph' | '__iteraProfile' | '__iteraCredential' | '__iteraBoard' | '__iteraBounty' | '__iteraCircuit', key: string, lang: string): Promise<Response> | null {
  if (typeof window === 'undefined') return null;
  const holder = window as unknown as Record<string, Preload | null | undefined>;
  const preload = holder[name];
  holder[name] = null;
  return preload && (preload.wallet ?? preload.asset ?? preload.key) === key && (lang === '*' || preload.lang === lang) ? preload.response : null;
}

/** What our tables hold for a wallet, with no chain read: fast, and never `verified` by itself. */
export async function getWalletGraph(wallet: string, lang: 'pt' | 'en'): Promise<Capabilities | null> {
  if (!url) throw new Error('Supabase not configured.');
  const fresh = () => fetch(`${url}/functions/v1/capability-graph/${encodeURIComponent(wallet)}?lang=${lang}`);
  const res = await (takePreload('__iteraGraph', wallet, lang) ?? fresh()).catch(fresh);
  if (res.status === 400) return null;
  if (!res.ok) throw new Error(`capability-graph failed (${res.status})`);
  const parsed = parseCapabilities(row(await res.json()).capabilities);
  return parsed && { ...parsed, source: 'database' };
}
