import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeSnackPane } from './CodeSnackPane.js';
import { HostOwnsSettledAction } from '../components/settledAction.js';

const spec = {
  prompt: 'p',
  starter: 'let a = 1;',
  checks: [{ id: 'c1', label: 'a', kind: 'text', pattern: 'a' }],
} as never;
const done = { id: 'a1', kind: 'code', status: 'done', spec: {} } as never;

describe('CodeSnackPane settled state', () => {
  it('shows the dead submit and reset controls by default', () => {
    render(<CodeSnackPane activity={done} spec={spec} onComplete={() => {}} />);
    expect(screen.getByTestId('code-submit')).toBeDisabled();
  });

  it('drops them when the host owns the settled action', () => {
    render(
      <HostOwnsSettledAction>
        <CodeSnackPane activity={done} spec={spec} onComplete={() => {}} />
      </HostOwnsSettledAction>,
    );
    expect(screen.queryByTestId('code-submit')).toBeNull();
    expect(screen.queryByText(/Recomeçar/)).toBeNull();
  });
});
