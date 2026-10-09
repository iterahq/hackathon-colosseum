import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { HomeLiveBlocks } from './HomeLiveBlocks';

const mocks = vi.hoisted(() => ({ surface: 'web' as ShellSurface }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => mocks.surface }));
vi.mock('@/hooks/useLiveClass', () => ({ useActiveLiveClass: () => ({ data: { id: 'session-1', instructorId: 'teacher-1' } }) }));
vi.mock('@/hooks/useIteraIdentity', () => ({ useIteraIdentity: () => ({ userId: 'student-1' }) }));
vi.mock('./NextScheduledClassBlock', () => ({ NextScheduledClassBlock: () => null }));

function mount() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <HomeLiveBlocks />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('HomeLiveBlocks live class block', () => {
  beforeEach(() => {
    mocks.surface = 'web';
  });

  it('in a browser tab it shows the subtitle and the join button', () => {
    mount();
    expect(screen.getByTestId('live-class-join')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(window.location.host))).not.toBeInTheDocument();
  });

  it('inside the shell it says live class is not available and offers no button', () => {
    mocks.surface = 'shell';
    mount();
    expect(screen.getByTestId('live-class-block')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(window.location.host))).not.toHaveClass('truncate');
    expect(screen.queryByTestId('live-class-join')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-class-return')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-class-join-as-learner')).not.toBeInTheDocument();
  });

  it('while the handshake is pending it renders no button', () => {
    mocks.surface = 'pending';
    mount();
    expect(screen.queryByTestId('live-class-join')).not.toBeInTheDocument();
  });
});
