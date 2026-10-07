import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReflectionDocumentActivity } from './ReflectionDocumentActivity.js';
import { textDraftKey } from '../../internal/textDraft.js';
import type { PortableActivity } from '../../renderer.js';

const WRITTEN = 'A tag abre e fecha, e o navegador desenha o que está entre as duas.';

const activity = (status: 'todo' | 'done') =>
  ({ id: 'reflect-1', kind: 'document_reflect', status, spec: {} }) as unknown as PortableActivity;

function renderReflection(status: 'todo' | 'done', response?: string) {
  const onComplete = vi.fn();
  render(
    <ReflectionDocumentActivity
      activity={activity(status)}
      spec={{ prompt: 'O que você aprendeu?' }}
      minWords={5}
      onComplete={onComplete}
      priorAnswer={response === undefined ? undefined : { response }}
    />,
  );
  return { onComplete, input: screen.getByTestId('document-reflection-input') as HTMLTextAreaElement };
}

describe('ReflectionDocumentActivity', () => {
  it('re-opens a finished reflection on the text the learner wrote, locked', () => {
    const { input } = renderReflection('done', WRITTEN);
    expect(input.value).toBe(WRITTEN);
    expect(input.readOnly).toBe(true);
    expect(input).toBeEnabled();
    expect(screen.getByTestId('document-word-count').textContent).toContain('15');
  });

  it('locks a finished reflection even when the text could not be read back', () => {
    const { input } = renderReflection('done');
    expect(input.value).toBe('');
    expect(input.readOnly).toBe(true);
    expect(input).toBeEnabled();
  });

  it('never seeds an unfinished reflection from a prior answer', () => {
    const { input } = renderReflection('todo', WRITTEN);
    expect(input.value).toBe('');
    expect(input.readOnly).toBe(false);
  });

  it('hands the written text up as the response', () => {
    const { input, onComplete } = renderReflection('todo');
    fireEvent.change(input, { target: { value: WRITTEN } });
    fireEvent.click(screen.getByRole('button'));
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: WRITTEN }));
  });
});

describe('ReflectionDocumentActivity — the text being written', () => {
  const saved = () => localStorage.getItem(textDraftKey('reflect-1'));

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('is kept a moment after the last key, and is back on the next open', () => {
    const { input } = renderReflection('todo');
    fireEvent.change(input, { target: { value: 'Merge junta' } });
    expect(saved()).toBeNull();
    act(() => void vi.advanceTimersByTime(600));
    expect(saved()).toBe('Merge junta');

    screen.getByTestId('document-reflection-input');
    const second = render(
      <ReflectionDocumentActivity
        activity={activity('todo')}
        spec={{ prompt: 'O que você aprendeu?' }}
        minWords={5}
        onComplete={vi.fn()}
      />,
    );
    const reopened = second.getAllByTestId('document-reflection-input').at(-1) as HTMLTextAreaElement;
    expect(reopened.value).toBe('Merge junta');
  });

  it('is written at once when the page goes away inside that moment', () => {
    const { input } = renderReflection('todo');
    fireEvent.change(input, { target: { value: 'Merge junta duas linhas' } });
    act(() => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saved()).toBe('Merge junta duas linhas');
  });

  it('is forgotten when the learner empties the box', () => {
    const { input } = renderReflection('todo');
    fireEvent.change(input, { target: { value: 'Merge' } });
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.change(input, { target: { value: '' } });
    act(() => void vi.advanceTimersByTime(600));
    expect(saved()).toBeNull();
  });

  it('is kept when sent, so a save that fails does not cost the text', () => {
    const { input } = renderReflection('todo');
    fireEvent.change(input, { target: { value: WRITTEN } });
    fireEvent.click(screen.getByRole('button'));
    expect(saved()).toBe(WRITTEN);
  });

  it('never overrides what a finished reflection shows', () => {
    localStorage.setItem(textDraftKey('reflect-1'), 'an older draft');
    const { input } = renderReflection('done', WRITTEN);
    expect(input.value).toBe(WRITTEN);
  });
});

