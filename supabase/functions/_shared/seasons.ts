import type { Lang } from './art.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The season window stored on an avatar row (`effect.season`): month-day bounds, every year, UTC. A window may wrap the new year. */
export interface SeasonData {
  key: string;
  /** `MM-DD`, first day inside the window. */
  from: string;
  /** `MM-DD`, last day inside the window. */
  to: string;
  label: { pt: string; en: string };
}

export interface SeasonView {
  key: string;
  label: string;
  /** Start of the window running now, or of the next one. */
  starts_at: string;
  /** End (last millisecond) of that same window. */
  ends_at: string;
  available: boolean;
}

function monthDay(value: unknown): { month: number; day: number } | null {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return null;
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(3));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/** The season of an avatar's `effect`, or `null` for an avatar that is always on sale (or a malformed entry). */
export function seasonData(effect: Record<string, unknown> | null | undefined): SeasonData | null {
  const raw = effect?.season;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { key, from, to, label } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || key.length === 0 || !monthDay(from) || !monthDay(to)) return null;
  const text = label && typeof label === 'object' ? (label as Record<string, unknown>) : {};
  const pt = typeof text.pt === 'string' ? text.pt : key;
  const en = typeof text.en === 'string' ? text.en : pt;
  return { key, from: from as string, to: to as string, label: { pt, en } };
}

interface Window {
  start: number;
  end: number;
}

/** The window of the year `year` that starts in it (a window that wraps ends in the next year). */
function windowOf(data: SeasonData, year: number): Window {
  const from = monthDay(data.from) as { month: number; day: number };
  const to = monthDay(data.to) as { month: number; day: number };
  const start = Date.UTC(year, from.month - 1, from.day);
  const wraps = to.month < from.month || (to.month === from.month && to.day < from.day);
  const end = Date.UTC(wraps ? year + 1 : year, to.month - 1, to.day) + DAY_MS - 1;
  return { start, end };
}

/** The window running at `now`, or else the next one to start. */
function nextWindow(data: SeasonData, now: Date): { window: Window; running: boolean } {
  const year = now.getUTCFullYear();
  const at = now.getTime();
  const windows = [year - 1, year, year + 1].map((candidate) => windowOf(data, candidate));
  const running = windows.find((window) => window.start <= at && at <= window.end);
  if (running) return { window: running, running: true };
  return { window: windows.find((window) => window.start > at) as Window, running: false };
}

/** Whether an avatar with this season can be bought at `now` (no season: always). */
export function inSeason(data: SeasonData | null, now: Date): boolean {
  return data === null || nextWindow(data, now).running;
}

export function seasonView(data: SeasonData | null, lang: Lang, now: Date): SeasonView | null {
  if (!data) return null;
  const { window, running } = nextWindow(data, now);
  return { key: data.key, label: data.label[lang] ?? data.label.pt, starts_at: new Date(window.start).toISOString(), ends_at: new Date(window.end).toISOString(), available: running };
}
