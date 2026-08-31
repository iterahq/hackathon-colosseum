import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { LiveRemovedScreen } from '@/components/live/LiveRemovedScreen';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import { rankByScore } from '@/utils/rankByScore';
import type { ClassAnswerer, ClassPresenceMember } from '@/types/liveClass';

/**
 * O menu por aluno do professor: abaixar a mão, palco e tirar da sala. A única
 * que muda estado durável — tirar da sala — é a que este arquivo guarda mais,
 * porque um erro de alvo atinge o aluno errado na frente da turma inteira. Por
 * isso ela nasce ESCONDIDA atrás do "Mais" e ainda confirma na linha.
 */

const roster: ClassPresenceMember[] = [
  { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Ana', avatarUrl: null, isInstructor: false, handRaised: true },
  { userId: 'b', name: 'Bruno', avatarUrl: null, isInstructor: false },
];

const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', avatarUrl: null, state: 'done', elapsedMs: 4000 },
  { userId: 'b', name: 'Bruno', avatarUrl: null, state: 'pending' },
];

const actionHandlers = () => ({
  onLowerHand: vi.fn(),
  onGrantLife: vi.fn(),
  onRemove: vi.fn(),
  onToggleStage: vi.fn(),
});

function renderRoom() {
  const handlers = actionHandlers();
  const ranking = rankByScore(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } });
  render(
    <I18nProvider>
      <LiveRoomList
        rows={buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-1' })}
        instructors={roster.filter((m) => m.isInstructor)}
        showDetail
        actionsFor={() => ({ ...handlers, onStage: false, pending: false, unreachable: false })}
      />
    </I18nProvider>
  );
  return handlers;
}

const openRow = (i: number) => fireEvent.click(screen.getAllByTestId('live-room-actions-open')[i]);

describe('per-student actions', () => {
  it('offers the everyday actions on one row', () => {
    renderRoom();
    openRow(0);
    expect(screen.getByTestId('live-room-lower-hand')).toBeTruthy();
    expect(screen.getByTestId('live-room-stage')).toBeTruthy();
  });

  // Devolver vida não depende do estado da linha: quem está sem vidas não fica
  // marcado no roster, e a única leitura desse saldo é o localStorage do aluno.
  it('devolve uma vida para a linha, sempre habilitado', () => {
    const { onGrantLife } = renderRoom();
    openRow(1);
    const button = screen.getByTestId('live-room-grant-life');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onGrantLife).toHaveBeenCalledWith('b');
  });

  it('fecha as ações no segundo clique do mesmo botão', () => {
    renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-actions-close'));
    expect(screen.queryByTestId('live-room-stage')).toBeNull();
    expect(screen.getAllByTestId('live-room-actions-open').length).toBeGreaterThan(0);
  });

  it('não deixa o ⋯ preso visível depois de fechar as ações por clique', () => {
    renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-actions-close'));
    // Fechar por clique deixa ESTE botão com `:focus`. Enquanto o revelar
    // dependia de `focus-within`, o ⋯ ficava visível e a pontuação escondida
    // até o professor clicar em outro lugar da tela.
    const toggle = screen.getAllByTestId('live-room-actions-open')[0];
    expect(toggle.className).not.toContain('group-focus-within');
    expect(toggle.className).toContain('group-has-[:focus-visible]:opacity-100');
    const info = screen.getAllByTestId('live-room-score')[0].parentElement;
    expect(info?.className).not.toContain('group-focus-within');
  });

  it('only lowers a hand that is up', () => {
    const { onLowerHand } = renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-lower-hand'));
    expect(onLowerHand).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByTestId('live-room-actions-close'));
    openRow(1);
    expect(screen.getByTestId('live-room-lower-hand')).toBeDisabled();
  });

  // C1 do plano 20260806-itera-aula-ao-vivo-alunos-reais: na primeira aula com
  // alunos reais o professor confundiu "tirar da sala" com "tirar do palco", que
  // fica na faixa de cima e se usa toda hora.
  it('nem mostra o tirar da sala junto do palco — ele mora atrás do "Mais"', () => {
    renderRoom();
    openRow(0);
    expect(screen.queryByTestId('live-room-remove')).toBeNull();
    fireEvent.click(screen.getByTestId('live-room-more'));
    expect(screen.getByTestId('live-room-remove')).toBeTruthy();
  });

  it('never removes on a single click — it confirms on the row first', () => {
    const { onRemove } = renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-more'));
    fireEvent.click(screen.getByTestId('live-room-remove'));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-room-remove-cancel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-room-remove-confirm'));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('keeps the row order frozen while a menu is open, so nothing slides under the click', () => {
    const { rerender } = render(
      <I18nProvider>
        <LiveRoomList rows={[]} instructors={[]} showDetail />
      </I18nProvider>
    );
    const list = (
      elapsed: Record<string, Record<string, number>>,
      answers: Record<string, Record<string, boolean>>
    ) => (
      <I18nProvider>
        <LiveRoomList
          rows={buildLiveRoomRows({
            ranking: rankByScore(roster, elapsed, answers),
            answerers,
            roster,
            currentActivityId: 'act-1',
          })}
          instructors={roster.filter((m) => m.isInstructor)}
          showDetail
          actionsFor={() => ({
            ...actionHandlers(),
            onStage: false,
            pending: false,
            unreachable: false,
          })}
        />
      </I18nProvider>
    );
    rerender(list({ 'act-1': { a: 4000 } }, { 'act-1': { a: true } }));
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Ana');
    openRow(0);
    // Bruno overtakes Ana mid-menu (same score, faster time); the open row must
    // stay where the finger is.
    rerender(
      list({ 'act-1': { a: 4000, b: 1000 } }, { 'act-1': { a: true, b: true } })
    );
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Ana');
  });

  it('thaws the order once the learner with the open menu is gone', () => {
    const later: ClassPresenceMember[] = [
      { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
      { userId: 'b', name: 'Bruno', avatarUrl: null, isInstructor: false },
      { userId: 'c', name: 'Carla', avatarUrl: null, isInstructor: false },
    ];
    const list = (
      members: ClassPresenceMember[],
      elapsed: Record<string, Record<string, number>>,
      answers: Record<string, Record<string, boolean>>
    ) => (
      <I18nProvider>
        <LiveRoomList
          rows={buildLiveRoomRows({
            ranking: rankByScore(members, elapsed, answers),
            answerers,
            roster: members,
            currentActivityId: 'act-1',
          })}
          instructors={members.filter((m) => m.isInstructor)}
          showDetail
          actionsFor={() => ({
            ...actionHandlers(),
            onStage: false,
            pending: false,
            unreachable: false,
          })}
        />
      </I18nProvider>
    );
    const { rerender } = render(
      list(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } })
    );
    openRow(0);
    // Ana is removed while her menu is open — nothing can close it, so the list
    // has to notice on its own or it stays frozen for the rest of the class.
    rerender(list(later, { 'act-1': { c: 1000 } }, { 'act-1': { c: true } }));
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Carla');
  });
});

describe('removed screen', () => {
  it('tells the learner the class ended for them, with a way out', () => {
    const onLeave = vi.fn();
    render(
      <I18nProvider>
        <LiveRemovedScreen onLeave={onLeave} />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-removed')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-removed-leave'));
    expect(onLeave).toHaveBeenCalled();
  });
});
