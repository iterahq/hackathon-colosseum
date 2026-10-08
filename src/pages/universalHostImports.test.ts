// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A web host of a universal screen is the first thing a learner loads on its route. The `branded` barrel
 * re-exports every branded component (the skill tree, the lesson cards, their animation library): importing
 * the header through it put all of that on the route's first load (measured on `/`, cold, Slow 4G: 37 KB
 * and about 180 ms). A host names the file it needs.
 */
describe('web hosts of the universal screens', () => {
  it.each(['HomeRoute.tsx', 'CatalogRoute.tsx'])('%s imports no barrel of components', (file) => {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8');
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.filter((s) => /^@\/components\/[a-z-]+$/.test(s))).toEqual([]);
  });
});
