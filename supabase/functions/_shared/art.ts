import { MASCOT_DATA_URI } from './mascot.ts';

export type Lang = 'pt' | 'en';

export interface ArtInput {
  shape: 'passport' | 'stamp' | 'medal';
  tier: 'bronze' | 'silver' | 'gold';
  title: string;
  /** Trail name on a passport or stamp, achievement description line on a medal. */
  subtitle: string;
  /** Seeds the per-trail color. */
  colorSeed: string;
  daysDone: number;
  totalDays: number;
  /** 1-based positions of the stamped days. */
  stampedDays: number[];
  /** On a stamp: the day this credential is about. */
  highlightDay: number | null;
  glyph: string;
  accent: string | null;
  programSlug: string;
  serial: string;
  lang: Lang;
}

const BACKGROUND = '#0A0908';
const PAGE = '#15120F';
const CREAM = '#F4EDE2';
const GREEN = '#3FD17F';
const TIER_COLORS = {
  bronze: { light: '#E3A46E', base: '#C8834A', dark: '#7A4A24' },
  silver: { light: '#F1F3F6', base: '#C3C9D2', dark: '#737B88' },
  gold: { light: '#FFE49A', base: '#E8B84A', dark: '#8F6A16' },
} as const;
const SANS = `Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const MONO = `'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace`;
const MAX_SLOTS = 10;

const LABELS = {
  pt: {
    brand: 'PASSAPORTE DO TERA',
    proof: 'PROVA DE APRENDIZADO',
    day: 'DIA',
    days: 'DIAS',
    complete: 'TRILHA COMPLETA',
    soulbound: 'INTRANSFERÍVEL · SOLANA',
    tier: { bronze: 'BRONZE', silver: 'PRATA', gold: 'OURO' },
    medal: 'MEDALHA',
  },
  en: {
    brand: "TERA'S PASSPORT",
    proof: 'PROOF OF LEARNING',
    day: 'DAY',
    days: 'DAYS',
    complete: 'TRAIL COMPLETE',
    soulbound: 'SOULBOUND · SOLANA',
    tier: { bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD' },
    medal: 'MEDAL',
  },
} as const;

export function escapeXml(value: string): string {
  return value
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.slice(0, Math.min(last.length, maxChars - 1)).trimEnd()}…`;
  return kept;
}

/** A stable, saturated color per trail. Gold hues are skipped: gold means "complete". */
export function trailColor(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619) >>> 0;
  }
  const hue = (70 + (hash % 250)) % 360;
  return `hsl(${hue}, 72%, 62%)`;
}

function isValidColor(value: string | null): value is string {
  return value !== null && /^#[0-9a-fA-F]{6}$/.test(value);
}

function mascot(x: number, y: number, width: number): string {
  const height = (width * 300) / 240;
  return `<image href="${MASCOT_DATA_URI}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

function defs(tier: ArtInput['tier'], accent: string): string {
  const metal = TIER_COLORS[tier];
  return `<defs>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${metal.light}"/><stop offset="0.5" stop-color="${metal.base}"/><stop offset="1" stop-color="${metal.dark}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="${accent}" stop-opacity="0.20"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<pattern id="grain" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><path d="M0 11h22" stroke="${CREAM}" stroke-opacity="0.035" stroke-width="1"/></pattern>
</defs>`;
}

function frame(stroke: string): string {
  return `<rect width="512" height="512" fill="${BACKGROUND}"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="${PAGE}" stroke="${stroke}" stroke-width="3"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="url(#grain)"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="url(#glow)"/>
<rect x="32" y="32" width="448" height="448" rx="21" fill="none" stroke="${stroke}" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="2 5"/>`;
}

function stampSlot(cx: number, cy: number, r: number, day: number, filled: boolean, color: string, label: string, highlighted: boolean): string {
  if (!filled) {
    return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CREAM}" stroke-opacity="0.28" stroke-width="2" stroke-dasharray="5 6"/>
<text x="${cx}" y="${cy + r * 0.24}" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="${r * 0.7}" fill="${CREAM}" fill-opacity="0.3">${day}</text></g>`;
  }
  const tilt = ((day * 37) % 25) - 12;
  const halo = highlighted ? `<circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="2"/>` : '';
  return `<g transform="rotate(${tilt} ${cx} ${cy})">${halo}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="3.5"/>
<circle cx="${cx}" cy="${cy}" r="${r - 6.5}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="1.5 3.5"/>
<text x="${cx}" y="${cy - r * 0.42}" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="${r * 0.25}" letter-spacing="1.5" fill="${color}">${label}</text>
<text x="${cx}" y="${cy + r * 0.22}" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="${r * 0.72}" fill="${color}">${day}</text>
<path d="M${cx - r * 0.2} ${cy + r * 0.5}l${r * 0.14} ${r * 0.13}l${r * 0.28} -${r * 0.25}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function stampGrid(input: ArtInput, color: string, label: string): string {
  const total = Math.max(1, input.totalDays);
  if (total > MAX_SLOTS) {
    const ratio = Math.min(1, input.daysDone / total);
    return `<rect x="56" y="296" width="400" height="18" rx="9" fill="${CREAM}" fill-opacity="0.12"/>
<rect x="56" y="296" width="${Math.round(400 * ratio)}" height="18" rx="9" fill="${color}"/>`;
  }
  const stamped = new Set(input.stampedDays);
  const perRow = total <= 5 ? total : Math.ceil(total / 2);
  const rows = Math.ceil(total / perRow);
  const radius = rows === 1 ? (total <= 3 ? 46 : 37) : 31;
  const gap = Math.min(radius * 2 + 16, 400 / perRow);
  const centerY = rows === 1 ? 298 : 258;
  const slots: string[] = [];
  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, total - row * perRow);
    const column = index - row * perRow;
    const cx = 256 - ((inRow - 1) * gap) / 2 + column * gap;
    const cy = centerY + row * (radius * 2 + 14);
    const day = index + 1;
    slots.push(stampSlot(cx, cy, radius, day, stamped.has(day), color, label, input.highlightDay === day));
  }
  return slots.join('\n');
}

function passportSvg(input: ArtInput): string {
  const labels = LABELS[input.lang];
  const isGold = input.tier === 'gold';
  const trail = trailColor(input.colorSeed);
  const ink = isGold ? 'url(#metal)' : trail;
  const stampInk = isGold ? TIER_COLORS.gold.base : trail;
  const titleLines = wrapText(input.subtitle, 23, 3);
  const title = titleLines
    .map((line, index) => `<text x="52" y="${150 + index * 31}" font-family="${SANS}" font-weight="800" font-size="26" fill="${isGold ? TIER_COLORS.gold.light : CREAM}">${escapeXml(line)}</text>`)
    .join('\n');
  const ribbon = isGold
    ? `<g transform="rotate(-6 256 382)"><rect x="92" y="363" width="328" height="38" rx="8" fill="${BACKGROUND}" fill-opacity="0.86" stroke="url(#metal)" stroke-width="2.5"/>
<text x="256" y="388" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="19" letter-spacing="3" fill="url(#metal)">★ ${labels.complete} ★</text></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${escapeXml(`${input.title} · ${input.subtitle}`)}">
${defs(input.tier, isGold ? TIER_COLORS.gold.base : trail)}
${frame(ink)}
<text x="52" y="72" font-family="${SANS}" font-weight="800" font-size="15" letter-spacing="3.2" fill="${CREAM}">${labels.brand}</text>
<text x="52" y="94" font-family="${MONO}" font-size="11.5" letter-spacing="1.6" fill="${GREEN}">${labels.proof} · ${escapeXml(input.programSlug.slice(0, 26).toUpperCase())}</text>
<rect x="52" y="108" width="44" height="4" rx="2" fill="${ink}"/>
${title}
${mascot(380, 42, 84)}
${stampGrid(input, stampInk, labels.day)}
${ribbon}
<text x="52" y="452" font-family="${SANS}" font-weight="900" font-size="30" fill="${isGold ? TIER_COLORS.gold.light : CREAM}">${input.daysDone}<tspan fill-opacity="0.45" font-weight="700">/${input.totalDays}</tspan><tspan dx="8" font-size="13" font-weight="800" letter-spacing="2.4" fill="${CREAM}" fill-opacity="0.7">${labels.days}</tspan></text>
<rect x="352" y="428" width="108" height="30" rx="15" fill="${isGold ? 'url(#metal)' : 'none'}" stroke="${ink}" stroke-width="2"/>
<text x="406" y="448" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="13" letter-spacing="2.6" fill="${isGold ? BACKGROUND : stampInk}">${labels.tier[input.tier]}</text>
<text x="256" y="474" text-anchor="middle" font-family="${MONO}" font-size="9" letter-spacing="1.8" fill="${CREAM}" fill-opacity="0.42">${labels.soulbound} · ${escapeXml(input.serial)}</text>
</svg>`;
}

function medalSvg(input: ArtInput): string {
  const labels = LABELS[input.lang];
  const metal = TIER_COLORS[input.tier];
  const accent = isValidColor(input.accent) ? input.accent : GREEN;
  const titleLines = wrapText(input.title, 24, 2);
  const title = titleLines
    .map((line, index) => `<text x="256" y="${392 + index * 30}" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="26" fill="${CREAM}">${escapeXml(line)}</text>`)
    .join('\n');
  const subtitleY = 392 + titleLines.length * 30 - 6;
  const subtitle = wrapText(input.subtitle, 40, 2)
    .map((line, index) => `<text x="256" y="${subtitleY + index * 17}" text-anchor="middle" font-family="${SANS}" font-size="13" fill="${CREAM}" fill-opacity="0.66">${escapeXml(line)}</text>`)
    .join('\n');
  const glyph = [...input.glyph].slice(0, 2).join('') || '★';
  const rays = Array.from({ length: 24 }, (_, index) => `<path d="M256 153v12" stroke="${metal.dark}" stroke-width="3" stroke-linecap="round" transform="rotate(${index * 15} 256 244)"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${escapeXml(input.title)}">
${defs(input.tier, accent)}
${frame('url(#metal)')}
<text x="52" y="72" font-family="${SANS}" font-weight="800" font-size="15" letter-spacing="3.2" fill="${CREAM}">${labels.brand}</text>
<text x="52" y="94" font-family="${MONO}" font-size="11.5" letter-spacing="1.6" fill="${GREEN}">${labels.medal} · ${labels.tier[input.tier]}</text>
<path d="M212 110h36l30 70h-40z" fill="${accent}"/>
<path d="M300 110h-36l-30 70h40z" fill="${accent}" fill-opacity="0.72"/>
<circle cx="256" cy="244" r="98" fill="url(#metal)"/>
<circle cx="256" cy="244" r="98" fill="none" stroke="${metal.dark}" stroke-width="3"/>
${rays}
<circle cx="256" cy="244" r="71" fill="${PAGE}" stroke="${metal.dark}" stroke-width="3"/>
<circle cx="256" cy="244" r="63" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="2 5"/>
<text x="256" y="274" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="84" fill="${accent}">${escapeXml(glyph)}</text>
${title}
${subtitle}
${mascot(400, 40, 62)}
<text x="256" y="474" text-anchor="middle" font-family="${MONO}" font-size="9" letter-spacing="1.8" fill="${CREAM}" fill-opacity="0.42">${labels.soulbound} · ${escapeXml(input.serial)}</text>
</svg>`;
}

export function renderArt(input: ArtInput): string {
  return input.shape === 'medal' ? medalSvg(input) : passportSvg(input);
}
