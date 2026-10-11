/** The escrow program refusing (or accepting) a wallet, asked through the public `gate-check` function. Anon key only. */
import type { GateCheck, GateVerdict } from '@/types/gateCheck';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export class GateCheckError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function toVerdict(v: unknown): GateVerdict | null {
  if (!v || typeof v !== 'object') return null;
  const r = row(v);
  return { refused: r.refused === true, errorCode: typeof r.error_code === 'number' ? r.error_code : null, errorHex: text(r.error_hex), errorName: text(r.error_name) };
}

export function toGateCheck(v: unknown): GateCheck {
  const r = row(v);
  const bounty = row(r.bounty);
  const claimant = row(r.claimant);
  const certification = row(r.certification);
  const kind = text(certification.kind);
  return {
    mode: r.mode === 'sent' ? 'sent' : 'simulated',
    programId: text(r.program_id) ?? '',
    bounty: { slug: text(bounty.slug) ?? '', title: text(bounty.title) ?? '', trail: text(bounty.trail) ?? '', minDays: typeof bounty.min_days === 'number' ? bounty.min_days : 0 },
    escrow: text(r.escrow) ?? '',
    claimant: { address: text(claimant.address) ?? '', kind: claimant.kind === 'named' ? 'named' : 'made_for_this_check' },
    certification: { address: text(certification.address) ?? '', kind: kind === 'own' || kind === 'not_a_certification' ? kind : 'another_wallets', url: text(certification.url) },
    verdict: toVerdict(r.verdict),
    logs: Array.isArray(r.logs) ? r.logs.filter((line): line is string => typeof line === 'string') : [],
    repeatWith: text(r.repeat_with),
    signature: text(r.signature),
    explorerUrl: text(r.explorer_url),
  };
}

/** `wallet`: ask about that address (simulated, no signature needed). `send`: a real transaction from a key made for the call. */
export async function askGate(input: { wallet?: string; send?: boolean; lang: string }): Promise<GateCheck> {
  if (!url || !anonKey) throw new GateCheckError('not_configured');
  const query = new URLSearchParams({ lang: input.lang });
  if (input.send) query.set('send', '1');
  else if (input.wallet) query.set('wallet', input.wallet);
  const response = await fetch(`${url}/functions/v1/gate-check?${query}`, { headers: { apikey: anonKey } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new GateCheckError(text(row(body).error) ?? `http_${response.status}`);
  return toGateCheck(body);
}
