import type { Frame, Ink } from './cosmetics.ts';
import { MASCOT_DATA_URI } from './mascot.ts';
import { OUTFIT_LAYERS, TERA_FACE, TERA_FACE_DATA_URI } from './outfit-art.ts';

export type Lang = 'pt' | 'en';

export interface ArtInput {
  shape: 'passport' | 'stamp' | 'medal' | 'companion';
  tier: 'bronze' | 'silver' | 'gold';
  title: string;
  /** Trail name on a passport or stamp, achievement description line on a medal. */
  subtitle: string;
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
  /** Passport cosmetics. Unset draws the default page. */
  ink?: Ink | null;
  frame?: Frame | null;
  /** Only read by the `companion` shape. */
  companion?: { lives: number; maxLives: number; level: number; outfit: string | null };
}

const BACKGROUND = '#0A0908';
const PAGE = '#15120F';
const CREAM = '#F4EDE2';
const GREEN = '#3FD17F';
const VIOLET = '#A78BFA';
const EMERALD = { light: '#A5F5C4', base: '#12B76A', dark: '#05603A', ink: '#03281C' } as const;
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
    brand: 'CERTIFICAÇÕES DO TERA',
    proof: 'PROVA DE APRENDIZADO',
    day: 'DIA',
    days: 'DIAS',
    complete: 'CERTIFICADA',
    soulbound: 'INTRANSFERÍVEL · SOLANA',
    tier: { bronze: 'BRONZE', silver: 'PRATA', gold: 'OURO' },
    medal: 'MEDALHA',
    companion: 'COMPANHEIRO DE ESTUDOS',
    level: 'NÍVEL',
    lives: 'VIDAS',
  },
  en: {
    brand: 'TERA CERTIFICATION',
    proof: 'PROOF OF LEARNING',
    day: 'DAY',
    days: 'DAYS',
    complete: 'CERTIFIED',
    soulbound: 'SOULBOUND · SOLANA',
    tier: { bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD' },
    medal: 'MEDAL',
    companion: 'STUDY COMPANION',
    level: 'LEVEL',
    lives: 'LIVES',
  },
} as const;

function isControlCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f);
}

export function escapeXml(value: string): string {
  return [...value]
    .filter((char) => !isControlCharacter(char))
    .join('')
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

function isValidColor(value: string | null): value is string {
  return value !== null && /^#[0-9a-fA-F]{6}$/.test(value);
}

function mascot(x: number, y: number, width: number): string {
  const height = (width * 300) / 240;
  return `<image href="${MASCOT_DATA_URI}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

function defs(tier: ArtInput['tier'], accent: string, glowOpacity = 0.2, extra = ''): string {
  const metal = TIER_COLORS[tier];
  const leaf = TIER_COLORS.gold;
  return `<defs>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${metal.light}"/><stop offset="0.5" stop-color="${metal.base}"/><stop offset="1" stop-color="${metal.dark}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="${accent}" stop-opacity="${glowOpacity}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${leaf.light}"/><stop offset="0.35" stop-color="${leaf.base}"/><stop offset="0.6" stop-color="${leaf.light}"/><stop offset="1" stop-color="${leaf.dark}"/></linearGradient>
<pattern id="grain" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><path d="M0 11h22" stroke="${CREAM}" stroke-opacity="0.035" stroke-width="1"/></pattern>
${extra}</defs>`;
}

function frame(stroke: string): string {
  return `<rect width="512" height="512" fill="${BACKGROUND}"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="${PAGE}" stroke="${stroke}" stroke-width="3"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="url(#grain)"/>
<rect x="20" y="20" width="472" height="472" rx="30" fill="url(#glow)"/>
<rect x="32" y="32" width="448" height="448" rx="21" fill="none" stroke="${stroke}" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="2 5"/>`;
}

/** How a filled stamp is painted: a flat line colour, or the emerald jewel (gradient body, sheen on top). */
type StampPaint = { jewel: false; color: string } | { jewel: true };

const EMERALD_DEFS = `<linearGradient id="emerald" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${EMERALD.light}"/><stop offset="0.42" stop-color="${EMERALD.base}"/><stop offset="1" stop-color="${EMERALD.dark}"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
`;

function stampSlot(cx: number, cy: number, r: number, day: number, filled: boolean, paint: StampPaint, label: string, highlighted: boolean): string {
  if (!filled) {
    return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CREAM}" stroke-opacity="0.28" stroke-width="2" stroke-dasharray="5 6"/>
<text x="${cx}" y="${cy + r * 0.24}" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="${r * 0.7}" fill="${CREAM}" fill-opacity="0.3">${day}</text></g>`;
  }
  const tilt = ((day * 37) % 25) - 12;
  const line = paint.jewel ? EMERALD.ink : paint.color;
  const edge = paint.jewel ? EMERALD.light : paint.color;
  const halo = highlighted ? `<circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="none" stroke="${edge}" stroke-opacity="0.45" stroke-width="2"/>` : '';
  const body = paint.jewel
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#emerald)" stroke="${EMERALD.light}" stroke-width="2"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${line}" fill-opacity="0.16" stroke="${line}" stroke-width="3.5"/>`;
  const sheen = paint.jewel ? `\n<ellipse cx="${cx}" cy="${cy - r * 0.46}" rx="${r * 0.66}" ry="${r * 0.34}" fill="url(#sheen)"/>` : '';
  return `<g transform="rotate(${tilt} ${cx} ${cy})">${halo}
${body}
<circle cx="${cx}" cy="${cy}" r="${r - 6.5}" fill="none" stroke="${line}" stroke-width="1.2" stroke-dasharray="1.5 3.5"/>
<text x="${cx}" y="${cy - r * 0.42}" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="${r * 0.25}" letter-spacing="1.5" fill="${line}">${label}</text>
<text x="${cx}" y="${cy + r * 0.22}" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="${r * 0.72}" fill="${line}">${day}</text>
<path d="M${cx - r * 0.2} ${cy + r * 0.5}l${r * 0.14} ${r * 0.13}l${r * 0.28} -${r * 0.25}" fill="none" stroke="${line}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>${sheen}</g>`;
}

function stampGrid(input: ArtInput, paint: StampPaint, label: string): string {
  const total = Math.max(1, input.totalDays);
  if (total > MAX_SLOTS) {
    const ratio = Math.min(1, input.daysDone / total);
    return `<rect x="56" y="296" width="400" height="18" rx="9" fill="${CREAM}" fill-opacity="0.12"/>
<rect x="56" y="296" width="${Math.round(400 * ratio)}" height="18" rx="9" fill="${paint.jewel ? 'url(#emerald)' : paint.color}"/>`;
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
    slots.push(stampSlot(cx, cy, radius, day, stamped.has(day), paint, label, input.highlightDay === day));
  }
  return `<g data-ink="${input.ink ?? 'default'}">\n${slots.join('\n')}\n</g>`;
}

/** Gold-leaf frame cosmetic: a gilded double border with a leaf spray in each corner. */
function goldLeafFrame(): string {
  const corner = `<path d="M0 34C0 14 14 0 34 0" fill="none" stroke="url(#leaf)" stroke-width="3" stroke-linecap="round"/>
<path d="M9 9c9-3 17 0 22 7c-9 3-17 0-22-7z" fill="url(#leaf)"/>
<path d="M9 9c-3 9 0 17 7 22c3-9 0-17-7-22z" fill="url(#leaf)"/>
<path d="M9 9c8 2 13 7 15 15c-8-2-13-7-15-15z" fill="url(#leaf)" fill-opacity="0.75"/>
<circle cx="40" cy="4" r="2.4" fill="url(#leaf)"/><circle cx="4" cy="40" r="2.4" fill="url(#leaf)"/>`;
  const corners = [
    'translate(27 27)',
    'translate(485 27) scale(-1 1)',
    'translate(27 485) scale(1 -1)',
    'translate(485 485) scale(-1 -1)',
  ].map((transform) => `<g transform="${transform}">${corner}</g>`);
  return `<g data-frame="gold-leaf">
<rect x="20" y="20" width="472" height="472" rx="30" fill="none" stroke="url(#leaf)" stroke-width="6"/>
<rect x="29" y="29" width="454" height="454" rx="23" fill="none" stroke="url(#leaf)" stroke-opacity="0.55" stroke-width="1.2"/>
${corners.join('\n')}
</g>`;
}

/**
 * The certification page. Itera green is the default ink on every trail; a
 * completed page turns gold. A bought ink repaints the stamps and the accent
 * bar only (and keeps doing so on a gold page): the page itself stays charcoal.
 */
function passportSvg(input: ArtInput): string {
  const labels = LABELS[input.lang];
  const isGold = input.tier === 'gold';
  const emerald = input.ink === 'emerald';
  const pageStroke = isGold ? 'url(#metal)' : GREEN;
  const paint: StampPaint = emerald
    ? { jewel: true }
    : { jewel: false, color: input.ink === 'violet' ? VIOLET : isGold ? TIER_COLORS.gold.base : GREEN };
  const accent = emerald ? 'url(#emerald)' : input.ink === 'violet' ? VIOLET : pageStroke;
  const innerGlow = emerald
    ? `<rect x="27" y="27" width="458" height="458" rx="24" fill="none" stroke="${EMERALD.base}" stroke-opacity="0.6" stroke-width="5" filter="url(#soft)"/>`
    : '';
  const titleLines = wrapText(input.subtitle, 23, 3);
  const title = titleLines
    .map((line, index) => `<text x="52" y="${150 + index * 31}" font-family="${SANS}" font-weight="800" font-size="26" fill="${isGold ? TIER_COLORS.gold.light : CREAM}">${escapeXml(line)}</text>`)
    .join('\n');
  const ribbon = isGold
    ? `<g transform="rotate(-6 256 382)"><rect x="92" y="363" width="328" height="38" rx="8" fill="${BACKGROUND}" fill-opacity="0.86" stroke="url(#metal)" stroke-width="2.5"/>
<text x="256" y="388" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="19" letter-spacing="3" fill="url(#metal)">★ ${labels.complete} ★</text></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${escapeXml(`${input.title} · ${input.subtitle}`)}">
${defs(input.tier, isGold ? TIER_COLORS.gold.base : GREEN, isGold ? 0.2 : 0.1, emerald ? EMERALD_DEFS : '')}
${frame(pageStroke)}
${innerGlow}
${input.frame === 'gold-leaf' ? goldLeafFrame() : ''}
<text x="52" y="72" font-family="${SANS}" font-weight="800" font-size="15" letter-spacing="3.2" fill="${CREAM}">${labels.brand}</text>
<text x="52" y="94" font-family="${MONO}" font-size="11.5" letter-spacing="1.6" fill="${GREEN}">${labels.proof} · ${escapeXml(input.programSlug.slice(0, 26).toUpperCase())}</text>
<rect x="52" y="108" width="44" height="4" rx="2" fill="${accent}"/>
${title}
${mascot(380, 42, 84)}
${stampGrid(input, paint, labels.day)}
${ribbon}
<text x="52" y="452" font-family="${SANS}" font-weight="900" font-size="30" fill="${isGold ? TIER_COLORS.gold.light : CREAM}">${input.daysDone}<tspan fill-opacity="0.45" font-weight="700">/${input.totalDays}</tspan><tspan dx="8" font-size="13" font-weight="800" letter-spacing="2.4" fill="${CREAM}" fill-opacity="0.7">${labels.days}</tspan></text>
<rect x="352" y="428" width="108" height="30" rx="15" fill="${isGold ? 'url(#metal)' : 'none'}" stroke="${pageStroke}" stroke-width="2"/>
<text x="406" y="448" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="13" letter-spacing="2.6" fill="${isGold ? BACKGROUND : GREEN}">${labels.tier[input.tier]}</text>
<text x="256" y="474" text-anchor="middle" font-family="${MONO}" font-size="9" letter-spacing="1.8" fill="${CREAM}" fill-opacity="0.42">${labels.soulbound} · ${escapeXml(input.serial)}</text>
</svg>`;
}

/**
 * The companion is drawn exactly as the app draws the learner's Tera: the outfit's `back` layer,
 * his face, then the `front` layer. The layers are the files of `public/mascot/outfits/`, inlined
 * (`outfit-art.ts`); they cover the face box plus a bleed on every side.
 */
function companionTera(centerX: number, bottom: number, width: number, outfit: string | null): string {
  const scale = width / TERA_FACE.width;
  const x = centerX - width / 2;
  const y = bottom - TERA_FACE.height * scale;
  const layers = outfit && Object.prototype.hasOwnProperty.call(OUTFIT_LAYERS, outfit) ? OUTFIT_LAYERS[outfit] : undefined;
  const bleed = TERA_FACE.bleed * scale;
  const layer = (href: string, part: string) =>
    `<image data-outfit-layer="${part}" href="${href}" x="${x - bleed}" y="${y - bleed}" width="${width + 2 * bleed}" height="${TERA_FACE.height * scale + 2 * bleed}"/>`;
  const face = `<image href="${TERA_FACE_DATA_URI}" x="${x}" y="${y}" width="${width}" height="${TERA_FACE.height * scale}"/>`;
  if (!layers) return face;
  return `<g data-outfit="${escapeXml(outfit as string)}">${layers.back ? layer(layers.back, 'back') : ''}${face}${layer(layers.front, 'front')}</g>`;
}

function heart(cx: number, cy: number, size: number, filled: boolean): string {
  const scale = size / 24;
  const shape = 'M12 21C5 15.5 2 12 2 8.2C2 5.2 4.3 3 7.1 3C9 3 10.9 4 12 5.6C13.1 4 15 3 16.9 3C19.7 3 22 5.2 22 8.2C22 12 19 15.5 12 21Z';
  const paint = filled
    ? `fill="${GREEN}" stroke="${GREEN}" stroke-width="1.6"`
    : `fill="none" stroke="${CREAM}" stroke-opacity="0.32" stroke-width="1.6" stroke-dasharray="2.4 2.4"`;
  return `<path d="${shape}" transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})" ${paint} stroke-linejoin="round"/>`;
}

function companionSvg(input: ArtInput): string {
  const labels = LABELS[input.lang];
  const { lives, maxLives, level, outfit } = input.companion ?? { lives: 0, maxLives: 5, level: 1, outfit: null };
  const total = Math.max(1, Math.min(MAX_SLOTS, Math.floor(maxLives)));
  const current = Math.max(0, Math.min(total, Math.floor(lives)));
  const gap = 46;
  const hearts = Array.from({ length: total }, (_, index) =>
    heart(256 - ((total - 1) * gap) / 2 + index * gap, 392, 34, index < current),
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${escapeXml(input.title)}">
${defs('bronze', GREEN, 0.16)}
${frame(GREEN)}
<text x="52" y="72" font-family="${SANS}" font-weight="800" font-size="15" letter-spacing="3.2" fill="${CREAM}">TERA</text>
<text x="52" y="94" font-family="${MONO}" font-size="11.5" letter-spacing="1.6" fill="${GREEN}">${labels.companion}</text>
<rect x="52" y="108" width="44" height="4" rx="2" fill="${GREEN}"/>
<rect x="364" y="52" width="96" height="30" rx="15" fill="none" stroke="${GREEN}" stroke-width="2"/>
<text x="412" y="72" text-anchor="middle" font-family="${SANS}" font-weight="900" font-size="13" letter-spacing="2.2" fill="${GREEN}">${labels.level} ${Math.max(1, Math.floor(level))}</text>
${companionTera(256, 356, 168, outfit)}
${hearts}
<text x="256" y="438" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="13" letter-spacing="2.4" fill="${CREAM}" fill-opacity="0.7">${current}/${total} ${labels.lives}</text>
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
  if (input.shape === 'companion') return companionSvg(input);
  return input.shape === 'medal' ? medalSvg(input) : passportSvg(input);
}
