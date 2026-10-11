import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { PassportCeremonyGate, PassportPrefetch } from '@/components/passport/PassportCeremonyGate';
import type { LessonEndView } from '@/types/lessonEnd';
vi.mock('@/hooks/useLearnerAvatar', async () => {
  const { DEFAULT_AVATAR } = await import('@/types/avatar');
  return { useLearnerAvatar: () => DEFAULT_AVATAR };
});

const state = vi.hoisted(() => ({ view: null as unknown, broken: true, seen: [] as unknown[] }));

vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play: vi.fn() }) }));
vi.mock('@/hooks/useCompanion', () => ({ useCompanion: () => ({ outfit: null }) }));
vi.mock('@/hooks/usePassport', () => ({
  usePassportPrefetch: () => {
    if (state.broken) throw new Error('no providers');
  },
  usePassport: (options: unknown) => {
    if (state.broken) throw new Error('no providers');
    state.seen.push(options);
    return { view: state.view, colorIndex: 1, retry: vi.fn(), connect: vi.fn(), dismiss: vi.fn() };
  },
}));

vi.mock('@/components/loop/LoopPanel', () => ({ LoopPanel: () => null }));
const PREVIEW = { day: 5, totalDays: 5, stampedBefore: 4, trailTitle: 'HTML', colorIndex: 1 };

function show(view: LessonEndView | null, props: Partial<Parameters<typeof PassportCeremonyGate>[0]> = {}) {
  state.view = view;
  state.broken = view === null;
  const tree = () => (
    <I18nProvider>
      <MemoryRouter>
        <PassportCeremonyGate lessonId="l5" doneCount={16} total={16} nextLessonId="next" {...props} />
      </MemoryRouter>
    </I18nProvider>
  );
  const out = render(tree());
  return { ...out, update: (next: LessonEndView) => ((state.view = next), out.rerender(tree())) };
}

describe('PassportCeremonyGate', () => {
  beforeEach(() => {
    state.seen = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('falls back to the plain card when the passport machinery cannot run', () => {
    show(null);
    expect(screen.getByTestId('lesson-complete')).toHaveTextContent('16/16');
    expect(screen.getByTestId('lesson-next-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('stamp-ceremony')).not.toBeInTheDocument();
  });

  it('the prefetch renders nothing and never breaks the lesson', () => {
    state.broken = true;
    const { container } = render(<PassportPrefetch />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hands the lesson facts to the decision', () => {
    show({ kind: 'card', note: null }, { doneCount: 15, fresh: true });
    expect(state.seen[0]).toEqual({ lessonId: 'l5', fresh: true, done: 15, total: 16 });
  });

  it('a whole day finished now: the ceremony is the first thing on screen, never the card', async () => {
    const view = show({ kind: 'preparing', preview: PREVIEW }, { fresh: true });
    expect(screen.queryByTestId('lesson-complete')).not.toBeInTheDocument();
    const ceremony = screen.getByTestId('stamp-ceremony');
    expect(ceremony).toHaveAttribute('data-phase', 'preparing');
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Carimbando na Solana…');
    expect(screen.getByTestId('passport-page')).toHaveAttribute('data-variant', 'active');
    view.update({
      kind: 'ceremony',
      model: { day: 5, daysDone: 5, totalDays: 5, trailTitle: 'HTML', status: 'minted', last: true, newMedals: [], txSignature: 'sig', assetAddress: 'A' },
    });
    expect(screen.getByTestId('stamp-ceremony')).toBe(ceremony);
    expect(ceremony).toHaveAttribute('data-phase', 'resolved');
    expect(screen.queryByTestId('lesson-complete')).not.toBeInTheDocument();
    expect(screen.getByTestId('ceremony-actions-waiting')).toHaveTextContent('Carimbando…');
    expect(screen.queryByTestId('lesson-next-cta')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('lesson-certifications-cta')).toHaveAttribute('href', '/passport'), { timeout: 4000 });
    expect(screen.getByTestId('lesson-next-cta')).toHaveAttribute('href', '/lesson/next');
  });

  it('an unfinished day: no ceremony, the card says what is missing and leads back to it', () => {
    const onRedoMissing = vi.fn();
    show({ kind: 'incomplete', missing: 1, done: 15, total: 16 }, { doneCount: 15, onRedoMissing });
    expect(screen.queryByTestId('stamp-ceremony')).not.toBeInTheDocument();
    expect(screen.getByTestId('lesson-complete')).toHaveAttribute('data-state', 'incomplete');
    expect(screen.getByTestId('lesson-complete-title')).toHaveTextContent('Faltou 1 atividade pra carimbar o dia');
    expect(screen.getByTestId('lesson-complete-count')).toHaveTextContent('15 de 16');
    fireEvent.click(screen.getByRole('button', { name: 'Refazer as que faltaram' }));
    expect(onRedoMissing).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Depois' })).toHaveAttribute('href', '/lesson/next');
  });

  it('the passport call failed: the plain card with one honest line', () => {
    show({ kind: 'card', note: 'stampLater' });
    expect(screen.getByTestId('lesson-complete-note')).toHaveTextContent('Seu dia está salvo; o carimbo on-chain entra na próxima vez.');
    expect(screen.getByTestId('lesson-next-cta')).toBeInTheDocument();
  });

  it('nothing to say: the plain card exactly as before', () => {
    show({ kind: 'card', note: null });
    expect(screen.getByTestId('lesson-complete')).toHaveAttribute('data-state', 'complete');
    expect(screen.queryByTestId('lesson-complete-note')).not.toBeInTheDocument();
    expect(screen.getByTestId('lesson-complete-title')).toHaveTextContent('Lição concluída!');
  });
});
