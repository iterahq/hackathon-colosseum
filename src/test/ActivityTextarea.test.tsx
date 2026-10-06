import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityTextarea } from '@/components/branded/activity/ActivityTextarea';

describe('ActivityTextarea', () => {
  it('clamps to maxLength so the caller never holds a value the server would truncate', () => {
    const onChange = vi.fn();
    render(
      <ActivityTextarea value="" onChange={onChange} rows={3} maxLength={5} data-testid="ta" />,
    );
    fireEvent.change(screen.getByTestId('ta'), { target: { value: 'abcdefgh' } });
    expect(onChange).toHaveBeenCalledWith('abcde');
  });

  it('takes 16 px under a finger so iOS does not zoom the page on focus', () => {
    render(<ActivityTextarea value="" onChange={() => {}} rows={3} data-testid="ta" />);
    expect(screen.getByTestId('ta').className).toContain('coarse:text-base');
  });

  it('leaves the value alone when no maxLength is given', () => {
    const onChange = vi.fn();
    render(<ActivityTextarea value="" onChange={onChange} rows={3} data-testid="ta" />);
    fireEvent.change(screen.getByTestId('ta'), { target: { value: 'abcdefgh' } });
    expect(onChange).toHaveBeenCalledWith('abcdefgh');
  });

  it('submits on Enter but never mid-IME-composition', () => {
    const onEnterSubmit = vi.fn();
    render(
      <ActivityTextarea
        value="oi"
        onChange={() => {}}
        rows={2}
        onEnterSubmit={onEnterSubmit}
        data-testid="ta"
      />,
    );
    const ta = screen.getByTestId('ta');

    fireEvent.keyDown(ta, { key: 'Enter', isComposing: true });
    expect(onEnterSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(onEnterSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onEnterSubmit).toHaveBeenCalledTimes(1);
  });

  it('ignores Enter entirely when the caller wants a plain multiline field', () => {
    const onChange = vi.fn();
    render(<ActivityTextarea value="oi" onChange={onChange} rows={6} data-testid="ta" />);
    fireEvent.keyDown(screen.getByTestId('ta'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
