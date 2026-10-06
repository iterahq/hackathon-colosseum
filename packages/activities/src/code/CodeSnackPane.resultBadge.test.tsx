import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeSnackPane } from './CodeSnackPane.js';

const activity = { id: 'a1', kind: 'code', status: 'todo', spec: {} } as never;
const spec = { prompt: 'p', starter: 'let a = 1;' } as never;

function setup() {
  render(<CodeSnackPane activity={activity} spec={spec} onComplete={() => {}} />);
  return screen.getByRole('textbox');
}

describe('CodeSnackPane result tab on phones', () => {
  it('shows a dot and announces after an edit, and clears when the result is opened', () => {
    const editor = setup();
    expect(screen.queryByTestId('code-pane-new-result')).toBeNull();
    fireEvent.change(editor, { target: { value: 'let a = 2;' } });
    expect(screen.getByTestId('code-pane-new-result')).toBeInTheDocument();
    expect(screen.getByTestId('code-pane-switch').querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Novo resultado'
    );
    fireEvent.click(screen.getByTestId('code-pane-preview'));
    expect(screen.queryByTestId('code-pane-new-result')).toBeNull();
  });

  it('does not flag an edit made while the result is open', () => {
    const editor = setup();
    fireEvent.click(screen.getByTestId('code-pane-preview'));
    fireEvent.change(editor, { target: { value: 'let a = 3;' } });
    expect(screen.queryByTestId('code-pane-new-result')).toBeNull();
  });

  it('does not flag a change event that carries the text already in the editor', () => {
    const editor = setup();
    fireEvent.change(editor, { target: { value: 'let a = 1;' } });
    expect(screen.queryByTestId('code-pane-new-result')).toBeNull();
  });
});
