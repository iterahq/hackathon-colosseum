import { describe, expect, it } from 'vitest';
import type { SearchSource } from '@/types/headerSearch';
import { buildIndex, flatten, normalize, search } from './globalSearch';

const sources: SearchSource[] = [
  {
    id: 'trails',
    label: 'Trails',
    entries: [
      { id: 't1', title: 'Fundamentos de CSS', href: '/a' },
      { id: 't2', title: 'CSS avançado', href: '/b' },
      { id: 't3', title: 'Acessibilidade', subtitle: 'Inclui css', href: '/c' },
    ],
  },
  {
    id: 'pages',
    label: 'Pages',
    entries: [
      { id: 'p1', title: 'Passaporte', keywords: ['passport', 'credencial'], href: '/passport', suggested: true },
      { id: 'p2', title: 'Perfil', href: '/profile', suggested: true },
    ],
  },
];
const index = buildIndex(sources);
const ids = (q: string) => flatten(search(index, q)).map((e) => e.id);

describe('globalSearch', () => {
  it('normalizes accents and case', () => {
    expect(normalize('  Avançado   CSS ')).toBe('avancado css');
  });

  it('matches without accents or case', () => {
    expect(ids('AVANCADO')).toEqual(['t2']);
    expect(ids('acessibilidade')).toEqual(['t3']);
  });

  it('ranks prefix before word start before substring before subtitle', () => {
    expect(ids('css')).toEqual(['t2', 't1', 't3']);
    expect(ids('ndamentos')).toEqual(['t1']);
  });

  it('requires every word of the query', () => {
    expect(ids('css fund')).toEqual(['t1']);
    expect(ids('css zzz')).toEqual([]);
  });

  it('matches keywords that are not shown', () => {
    expect(ids('credencial')).toEqual(['p1']);
  });

  it('lists only suggested entries for an empty query, grouped by source', () => {
    const groups = search(index, '   ');
    expect(groups.map((g) => g.id)).toEqual(['pages']);
    expect(flatten(groups).map((e) => e.id)).toEqual(['p1', 'p2']);
  });

  it('keeps source order and caps each group', () => {
    const many: SearchSource = { id: 'm', label: 'M', entries: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, title: `item ${i}`, href: '/' })) };
    const groups = search(buildIndex([many, ...sources]), 'item', 4);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(4);
  });

  it('keeps suggest-only entries out of typed results', () => {
    const only: SearchSource = { id: 'go', label: 'Go', suggestOnly: true, entries: [{ id: 'g1', title: 'Fundamentos de CSS', href: '/a', suggested: true }] };
    const withOnly = buildIndex([only, ...sources]);
    expect(flatten(search(withOnly, 'css')).map((e) => e.id)).not.toContain('g1');
    expect(flatten(search(withOnly, '')).map((e) => e.id)).toContain('g1');
  });

  it('accepts one more source without changing the others', () => {
    const extra: SearchSource = { id: 'videos', label: 'Videos', entries: [{ id: 'v1', title: 'Vídeo de CSS', href: '/v' }] };
    const groups = search(buildIndex([...sources, extra]), 'css');
    expect(groups.map((g) => g.id)).toEqual(['trails', 'videos']);
  });
});
