import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';

const h = vi.hoisted(() => ({
  muted: true,
  playSuccess: vi.fn(),
  toggleMuted: vi.fn(),
}));

vi.mock('@/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    playSuccess: h.playSuccess,
    playError: vi.fn(),
    playClick: vi.fn(),
    playCelebration: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLiveMuted', () => ({
  useLiveMuted: () => [h.muted, h.toggleMuted],
}));

import { LiveSoundToggle } from '@/components/live/LiveSoundToggle';

beforeEach(() => {
  h.playSuccess.mockClear();
  h.toggleMuted.mockClear();
});

describe('LiveSoundToggle', () => {
  it('plays a confirm chime when turning sound back ON', () => {
    h.muted = true; // currently muted → the click unmutes
    render(
      <I18nProvider>
        <LiveSoundToggle />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.playSuccess).toHaveBeenCalledTimes(1);
  });

  it('stays silent when muting', () => {
    h.muted = false; // currently on → the click mutes
    render(
      <I18nProvider>
        <LiveSoundToggle />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.playSuccess).not.toHaveBeenCalled();
  });
});
