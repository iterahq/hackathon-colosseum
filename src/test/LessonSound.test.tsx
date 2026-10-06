import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { useLessonSound } from '@/hooks/useLessonSound';
import { LessonChrome } from '@/components/branded/lesson/LessonChrome';

/**
 * O self-paced não tinha som nenhum: `useLiveMuted` nasce MUDO (sala
 * compartilhada) e a lição não tem dock pra religar, então reaproveitar aquela
 * preferência deixaria o retorno sonoro morto. Estes testes trancam as duas
 * pontas: o padrão LIGADO e o toggle que o desliga.
 */

const play = vi.fn();
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play }) }));
const schedulePreload = vi.fn();
vi.mock('@/lib/soundEngine', () => ({ getSoundEngine: () => ({ schedulePreload }) }));

function Probe() {
  const { muted, toggleMuted, onSettle } = useLessonSound();
  return (
    <>
      <LessonChrome progressPct={40} muted={muted} onToggleMuted={toggleMuted} onClose={() => {}} />
      <button data-testid="settle-pass" onClick={() => onSettle(true)} />
      <button data-testid="settle-miss" onClick={() => onSettle(false)} />
    </>
  );
}

function renderProbe() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  );
}

beforeEach(() => {
  play.mockReset();
  schedulePreload.mockReset();
  localStorage.clear();
});

describe('som da lição self-paced', () => {
  it('toca ao passar o exercício sem nenhum opt-in', () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(play).toHaveBeenCalledWith('success', 0.4);
  });

  it('toca um som distinto ao errar', () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('settle-miss'));
    expect(play).toHaveBeenCalledWith('error', 0.3);
  });

  it('cala quando o aluno desliga no chrome, e persiste a escolha', () => {
    renderProbe();
    act(() => {
      fireEvent.click(screen.getByTestId('lesson-sound-toggle'));
    });
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByTestId('lesson-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('itera.lesson.muted')).toBe('1');
  });

  it('não herda o mudo da aula ao vivo', () => {
    localStorage.setItem('itera.live.muted', '1');
    renderProbe();
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(play).toHaveBeenCalledWith('success', 0.4);
  });

  it('preloads the lesson clips when the lesson opens, not at the verdict', () => {
    renderProbe();
    expect(schedulePreload).toHaveBeenCalledTimes(1);
    expect(schedulePreload).toHaveBeenCalledWith(['success', 'error', 'click', 'celebration']);
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(schedulePreload).toHaveBeenCalledTimes(1);
  });

  it('a muted lesson preloads nothing, and unmuting preloads without a reload', () => {
    localStorage.setItem('itera.lesson.muted', '1');
    renderProbe();
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(schedulePreload).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByTestId('lesson-sound-toggle'));
    });
    expect(schedulePreload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('settle-pass'));
    expect(play).toHaveBeenCalledWith('success', 0.4);
  });
});
