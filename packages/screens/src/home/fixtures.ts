import type { HomeView } from '@iterahq/shell-core';
import { CATALOG_PREVIEW_STATE } from '../catalog/fixtures';

/**
 * A dashboard for the development preview of the shell: no network, no token. A member with one course
 * not started and one in progress, and one medal of each kind.
 */
export const HOME_PREVIEW_VIEW: HomeView = {
  kind: 'member',
  stats: { name: 'ana', initials: 'AN', streak: '0', xp: '120', badges: '1', completed: '7' },
  programs:
    CATALOG_PREVIEW_STATE.kind === 'ready'
      ? { kind: 'ready', programs: CATALOG_PREVIEW_STATE.programs.slice(0, 2).map((card, i) => ({ ...card, action: { kind: 'enrolled', percent: i * 40, progress: `${i * 40}% concluído` } })) }
      : { kind: 'empty' },
  badges: { kind: 'ready', badges: [{ id: 'preview-1', title: 'Primeira lição', earned: true }, { id: 'preview-2', title: 'Maratonista', earned: false }] },
};
