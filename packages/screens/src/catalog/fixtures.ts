import type { CatalogCardView, CatalogListState } from '@iterahq/shell-core';

/**
 * A list for the development preview of the shell: no network, no token. One course of each foot (open, enroll,
 * locked) and of each tone, so the route shows every variant of the card.
 */
const card = (n: number, over: Partial<CatalogCardView>): CatalogCardView => ({
  id: `preview-${n}`,
  slug: `preview-${n}`,
  headline: 'Modele seus dados com IA',
  subline: null,
  counts: { lessons: '12 lições', units: '4 unidades', activities: '60 atividades' },
  icon: 'code',
  tone: { accent: '#7AD6CD', surface: '#003B37', edge: '#057A72' },
  action: { kind: 'open' },
  ...over,
});

export const CATALOG_PREVIEW_STATE: CatalogListState = {
  kind: 'ready',
  programs: [
    card(1, {}),
    card(2, {
      headline: 'HTML do zero',
      subline: 'sua primeira página no ar',
      counts: { lessons: '1 lição', units: '1 unidade', activities: '1 atividade' },
      icon: 'layers',
      tone: { accent: '#7AA2E0', surface: '#1A2B4C', edge: '#3B5C9C' },
      action: { kind: 'enroll', pending: false, failed: false },
    }),
    card(3, {
      headline: 'Git sem medo',
      subline: 'versionando seu código',
      counts: { lessons: '9 lições', units: '3 unidades', activities: '40 atividades' },
      icon: 'rocket',
      tone: { accent: '#E07A4A', surface: '#4D2818', edge: '#9E5230' },
      action: { kind: 'locked' },
    }),
  ],
};
