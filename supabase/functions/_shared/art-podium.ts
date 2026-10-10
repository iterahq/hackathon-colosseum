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
