/** Marketing origin captured on the learner's first touch. See lib/attribution.ts. */

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export interface Attribution {
  utm: Partial<Record<UtmKey, string>>;
  /** Referrer HOST only — never the full URL, which can carry a query string. */
  referrer: string | null;
  /** Same-origin landing path, no query and no fragment. */
  landing: string | null;
  /** ISO timestamp of first touch, so the attribution window is measurable. */
  capturedAt: string;
}
