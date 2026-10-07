import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoneButton, SubmitButton } from './parts.js';
import { HostOwnsSettledAction } from './settledAction.js';

const noop = () => {};

describe('SubmitButton / DoneButton when the host owns the settled action', () => {
  it('keeps the locked buttons without the provider', () => {
    render(
      <>
        <SubmitButton submitted onSubmit={noop} testId="s" />
        <DoneButton done onClick={noop} />
      </>,
    );
    expect(screen.getByTestId('s')).toBeDisabled();
    expect(screen.getByTestId('activity-done')).toBeDisabled();
  });

  it('renders nothing for a settled button under the provider', () => {
    render(
      <HostOwnsSettledAction>
        <SubmitButton submitted onSubmit={noop} testId="s" />
        <DoneButton done onClick={noop} />
      </HostOwnsSettledAction>,
    );
    expect(screen.queryByTestId('s')).toBeNull();
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('still renders live buttons under the provider', () => {
    render(
      <HostOwnsSettledAction>
        <SubmitButton submitted={false} onSubmit={noop} testId="s" />
        <DoneButton onClick={noop} />
      </HostOwnsSettledAction>,
    );
    expect(screen.getByTestId('s')).toBeInTheDocument();
    expect(screen.getByTestId('activity-done')).toBeInTheDocument();
  });
});
