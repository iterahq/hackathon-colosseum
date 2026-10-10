/**
 * The emblem inside a live-class podium medal: the place as a numeral over the
 * three steps, the learner's own step filled. Drawn in the medal's accent
 * (Itera green); the metal of the ring is what says gold, silver or bronze.
 */
export function podiumEmblem(position: number, accent: string, line: string): string {
  const place = position === 2 || position === 3 ? position : 1;
  // Left to right as on a real podium: 2nd, 1st, 3rd. `top` is the y of each step's surface.
  const steps = [
    { place: 2, x: 208, top: 276 },
    { place: 1, x: 240, top: 264 },
    { place: 3, x: 272, top: 284 },
  ];
  const base = 300;
  const bars = steps
    .map((step) =>
      step.place === place
        ? `<rect x="${step.x}" y="${step.top}" width="32" height="${base - step.top}" fill="${accent}"/>`
        : `<rect x="${step.x + 1}" y="${step.top + 1}" width="30" height="${base - step.top - 1}" fill="none" stroke="${line}" stroke-opacity="0.45" stroke-width="2"/>`,
    )
    .join('\n');
  return `<g data-podium="${place}">
<text x="256" y="250" text-anchor="middle" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="900" font-size="64" fill="${accent}">${place}</text>
${bars}
<path d="M200 300h112" stroke="${line}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>
</g>`;
}

/**
 * The small seal a certification page gains when a teacher endorsed it: a
 * notched ring with a check, and one dot per endorsement (three at most).
 */
export function endorsementSeal(count: number, color: string, line: string): string {
  const shown = Math.max(1, Math.min(3, Math.floor(count)));
  const cx = 300;
  const cy = 443;
  const dots = Array.from({ length: shown }, (_, index) => `<circle cx="${cx - (shown - 1) * 4 + index * 8}" cy="${cy + 24}" r="2" fill="${color}"/>`).join('');
  return `<g data-endorsed="${shown}">
<circle cx="${cx}" cy="${cy}" r="16" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="20.5" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="2.5 3.2"/>
<path d="M${cx - 7} ${cy}l5 5l9 -10" fill="none" stroke="${line}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
${dots}
</g>`;
}
