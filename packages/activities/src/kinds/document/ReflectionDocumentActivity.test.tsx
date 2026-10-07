import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReflectionDocumentActivity } from './ReflectionDocumentActivity.js';
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
