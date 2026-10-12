import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillBadge } from './SkillBadge';

describe('SkillBadge', () => {
  it('is neutral with no medal by default and shows the title it was given', () => {
    render(<SkillBadge claimId="html-form" title="Forms" hint="Builds a form with labeled, typed inputs" />);
    const badge = screen.getByTestId('skill-badge');
    expect(badge).toHaveAttribute('data-state', 'neutral');
    expect(badge).toHaveAttribute('data-claim', 'html-form');
    expect(badge).not.toHaveAttribute('data-tier');
    expect(badge).toHaveTextContent('Forms');
    expect(badge).toHaveAttribute('title', 'Builds a form with labeled, typed inputs');
    expect(screen.queryByTestId('skill-badge-tier')).toBeNull();
  });

  it('carries the state and says it to a screen reader', () => {
    render(<SkillBadge claimId="css-box" title="Box model" state="locked" stateLabel="locked" size="md" />);
    const badge = screen.getByTestId('skill-badge');
    expect(badge).toHaveAttribute('data-state', 'locked');
    expect(badge).toHaveTextContent('Box model (locked)');
  });

  it('draws the medal of the tier it was given, in both sizes', () => {
    for (const size of ['sm', 'md'] as const) {
      const { unmount } = render(<SkillBadge claimId="js-app" title="App" state="lit" tier="top" tierLabel="Server checked" size={size} />);
      expect(screen.getByTestId('skill-badge')).toHaveAttribute('data-tier', 'top');
      expect(screen.getByTestId('skill-badge-tier')).toHaveAttribute('title', 'Server checked');
      expect(screen.getByTestId('skill-badge')).toHaveTextContent('App (Server checked)');
      unmount();
    }
  });
});
