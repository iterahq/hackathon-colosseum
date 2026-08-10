import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveRoomStateIcon } from '@/components/live/LiveRoomStateIcon';
import type { ClassAnswerState } from '@/types/liveClass';

/**
 * A matriz inteira do ícone de uma linha da sala. Ela existe porque a célula
 * "errou, visto pelo aluno" já foi verde uma vez: a lista dizia que a turma
 * toda tinha acertado (Tainan 2026-08-06, "mundo de cor de rosa").
 */
function variant(state: ClassAnswerState, showDetail: boolean, working = false) {
  const { unmount } = render(
    <LiveRoomStateIcon state={state} showDetail={showDetail} working={working} />
  );
  const node = screen.queryByTestId('live-room-state');
  const v = node ? node.getAttribute('data-variant') : 'working';
  unmount();
  return v;
}

describe('LiveRoomStateIcon', () => {
  it('só quem acertou fica verde — nas duas telas', () => {
    expect(variant('done', false)).toBe('done');
    expect(variant('done', true)).toBe('done');
  });

  it('errou na tela do ALUNO = check cinza, nunca o verde nem o X', () => {
    expect(variant('wrong', false)).toBe('missed');
  });

  it('errou na tela do PROFESSOR = X, que é quem precisa agir', () => {
    expect(variant('wrong', true)).toBe('wrong');
  });

  it('quem não respondeu segue neutro', () => {
    expect(variant('pending', false)).toBe('pending');
    expect(variant('pending', true)).toBe('pending');
  });

  it('o lápis do trabalho em andamento só aparece antes de responder', () => {
    expect(variant('pending', true, true)).toBe('working');
    expect(variant('wrong', true, true)).toBe('wrong');
  });

  it('o cinza do erro não é o verde do acerto', () => {
    const { container } = render(<LiveRoomStateIcon state="wrong" showDetail={false} />);
    const cls = container.querySelector('[data-variant="missed"]')?.getAttribute('class') ?? '';
    expect(cls).toContain('text-muted-foreground');
    expect(cls).not.toContain('text-menta');
  });
});
