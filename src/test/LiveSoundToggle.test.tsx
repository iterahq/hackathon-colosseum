import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';

const h = vi.hoisted(() => ({
  muted: true,
  volume: 1,
  play: vi.fn(),
  toggleMuted: vi.fn(),
  setVolume: vi.fn(),
}));

vi.mock('@/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    play: h.play,
    playSuccess: vi.fn(),
    playError: vi.fn(),
    playClick: vi.fn(),
    playCelebration: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLiveMuted', () => ({
  useLiveMuted: () => [h.muted, h.toggleMuted],
}));

vi.mock('@/hooks/useLiveVolume', () => ({
  useLiveVolume: () => [h.volume, h.setVolume],
}));

import { LiveSoundToggle } from '@/components/live/LiveSoundToggle';

beforeEach(() => {
  h.play.mockClear();
  h.toggleMuted.mockClear();
  h.setVolume.mockClear();
  h.muted = true;
  h.volume = 1;
});

describe('LiveSoundToggle', () => {
  it('plays a confirm chime when turning sound back ON', () => {
    h.muted = true; // the click unmutes
    render(
      <I18nProvider>
        <LiveSoundToggle />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.play).toHaveBeenCalledWith('chime', expect.any(Number));
  });

  it('stays silent when muting', () => {
    h.muted = false; // the click mutes
    render(
      <I18nProvider>
        <LiveSoundToggle />
      </I18nProvider>
    );
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();
  });

  it('exposes a volume slider (compact) that updates the shared volume', () => {
    h.muted = false;
    render(
      <I18nProvider>
        <LiveSoundToggle compact />
      </I18nProvider>
    );
    const slider = screen.getByTestId('live-volume-slider');
    fireEvent.change(slider, { target: { value: '0.3' } });
    expect(h.setVolume).toHaveBeenCalledWith(0.3);
  });
});
