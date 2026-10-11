/** Where a public chain answer came from and when: the page must say it. */
export interface ChainRead {
  source: 'chain' | 'cache';
  /** When the body was read from the chain (ISO). */
  at: string;
  ageMs: number;
  /** How long that read took. */
  ms: number;
}

export function parseChainRead(v: unknown, fallbackMs: number): ChainRead {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const source = r.source === 'cache' ? 'cache' : 'chain';
  const at = typeof r.at === 'string' && r.at ? r.at : new Date().toISOString();
  const ageMs = typeof r.age_ms === 'number' && r.age_ms >= 0 ? r.age_ms : 0;
  const ms = typeof r.ms === 'number' && r.ms >= 0 ? r.ms : fallbackMs;
  return { source, at, ageMs, ms };
}
