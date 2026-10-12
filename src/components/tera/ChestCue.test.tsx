import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED } from '@/services/teraChestMock';
import type { ChestList } from '@/types/tera';
import { ChestCue } from './ChestCue';

const state = vi.hoisted(() => ({ list: null as unknown, followed: [] as unknown[] }));
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));
// The picture of the Tera is in the browser at once: the reveal waits for it.
class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    this.onload?.();
  }
}
vi.stubGlobal('Image', LoadedImage);
vi.mock('@/hooks/useTeraCatalog', async () => {
  const { FALLBACK_CATALOG } = await import('@/services/teraCatalog.service');
  return { useTeraCatalog: () => FALLBACK_CATALOG };
});
vi.mock('@/hooks/useDayChest', () => ({
  useMyChestsQuery: () => ({ data: state.list }),
  useDayChest: (...args: unknown[]) => {
    state.followed.push(args);
    return { phase: null, chest: null };
  },
}));

const chest = (wire: Record<string, unknown>, id: string) => toChest({ ...wire, id, lesson_id: `lesson-${id}` })!;
const show = (list: ChestList) => {
  state.list = list;
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ChestCue />
      </MemoryRouter>
    </I18nProvider>,
  );
};

describe('ChestCue', () => {
  beforeEach(() => {
    localStorage.clear();
    state.followed = [];
  });

  it('draws nothing with the feature off, with no chest, or when every chest was already shown', () => {
    expect(show({ enabled: false, chests: [chest(WIRE_CHEST_MINTED, 'a')] }).container).toBeEmptyDOMElement();
    expect(show({ enabled: true, chests: [] }).container).toBeEmptyDOMElement();
    localStorage.setItem('itera.chest.seen.v1', JSON.stringify(['a']));
    expect(show({ enabled: true, chests: [chest(WIRE_CHEST_MINTED, 'a')] }).container).toBeEmptyDOMElement();
  });

  it('one line for a chest nobody saw; opening it shows the reveal, and closing it is the end of the cue', () => {
    show({ enabled: true, chests: [chest(WIRE_CHEST_MINTED, 'a'), chest(WIRE_CHEST_MINTED, 'b')] });
    expect(screen.getAllByTestId('chest-cue')).toHaveLength(1);
    expect(screen.getByTestId('chest-cue')).toHaveTextContent('O baú do dia 3 de HTML abriu e você ainda não viu o que saiu.');
    expect(screen.queryByTestId('day-chest')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver o baú' }));
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-size', 'hero');
    expect(screen.getByTestId('day-chest-tier')).toHaveTextContent('Super Tera');
    expect(screen.getByTestId('chest-cue-more')).toHaveTextContent('Mais 1 nas suas certificações');
    fireEvent.click(screen.getByTestId('chest-cue-close'));
    expect(screen.queryByTestId('chest-cue')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('itera.chest.seen.v1') ?? '[]').sort()).toEqual(['a', 'b']);
  });

  it('a chest that is still opening says so, and is followed only once the learner opens it', () => {
    show({ enabled: true, chests: [chest(WIRE_CHEST_COMMITTED, 'c')] });
    expect(screen.getByTestId('chest-cue')).toHaveAttribute('data-status', 'committed');
    expect(screen.getByTestId('chest-cue')).toHaveTextContent('está abrindo');
    expect(state.followed).toHaveLength(0);
    fireEvent.click(screen.getByTestId('chest-cue-open'));
    expect(state.followed.at(-1)).toEqual(['lesson-c', true]);
    expect(screen.getByTestId('day-chest')).toHaveAttribute('data-phase', 'committed');
  });
});
