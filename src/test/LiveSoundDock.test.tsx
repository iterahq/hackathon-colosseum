import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';

const h = vi.hoisted(() => ({
  muted: true,
  volume: 1,
  musicOn: true,
  play: vi.fn(),
  toggleMuted: vi.fn(),
  setVolume: vi.fn(),
  toggleMusic: vi.fn(),
  bgMusic: vi.fn(),
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

vi.mock('@/hooks/useLiveMusicEnabled', () => ({
  useLiveMusicEnabled: () => [h.musicOn, h.toggleMusic],
}));

vi.mock('@/hooks/useBackgroundMusic', () => ({
  useBackgroundMusic: (opts: unknown) => h.bgMusic(opts),
}));

import { LiveSoundDock } from '@/components/live/LiveSoundDock';

function renderDock() {
  return render(
    <I18nProvider>
      <LiveSoundDock />
    </I18nProvider>
  );
}

beforeEach(() => {
  h.play.mockClear();
  h.toggleMuted.mockClear();
  h.setVolume.mockClear();
  h.toggleMusic.mockClear();
  h.bgMusic.mockClear();
  h.muted = true;
  h.volume = 1;
  h.musicOn = true;
});

describe('LiveSoundDock', () => {
  it('fica no canto inferior esquerdo, fora da sidebar', () => {
    renderDock();
    const dock = screen.getByTestId('live-sound-dock');
    expect(dock.dataset.raised).toBe('false');
    expect(dock.className).toContain('bottom-3');
    expect(dock.className).toContain('left-3');
  });

  it('sobe quando a barra de feedback está no ar', () => {
    render(
      <I18nProvider>
        <LiveSoundDock raised />
      </I18nProvider>
    );
    const dock = screen.getByTestId('live-sound-dock');
    expect(dock.dataset.raised).toBe('true');
    expect(dock.className).toContain('bottom-32');
  });

  it('plays a confirm chime when turning sound back ON', () => {
    h.muted = true; // the click unmutes
    renderDock();
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.play).toHaveBeenCalledWith('chime', expect.any(Number));
  });

  it('stays silent when muting', () => {
    h.muted = false; // the click mutes
    renderDock();
    fireEvent.click(screen.getByTestId('live-sound-toggle'));
    expect(h.toggleMuted).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();
  });

  it('exposes tappable volume percentages that update the shared volume', () => {
    h.muted = false;
    renderDock();
    fireEvent.click(screen.getByTestId('live-volume-25'));
    expect(h.setVolume).toHaveBeenCalledWith(0.25);
  });

  it('abre e fecha o painel por toque, sem depender de hover', () => {
    renderDock();
    const trigger = screen.getByTestId('live-sound-panel-toggle');
    expect(screen.getByTestId('live-sound-panel').className).toContain('pointer-events-none');
    fireEvent.click(trigger);
    expect(screen.getByTestId('live-sound-panel').className).toContain('pointer-events-auto');
    fireEvent.click(trigger);
    expect(screen.getByTestId('live-sound-panel').className).toContain('pointer-events-none');
  });

  it('fecha o painel no Escape e no toque fora do dock', () => {
    renderDock();
    const trigger = screen.getByTestId('live-sound-panel-toggle');
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('live-sound-panel').className).toContain('pointer-events-none');
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.getByTestId('live-sound-panel').className).toContain('pointer-events-none');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles background music and previews a chime when enabling it', () => {
    h.muted = false;
    h.musicOn = false; // the click enables music
    renderDock();
    fireEvent.click(screen.getByTestId('live-music-toggle'));
    expect(h.toggleMusic).toHaveBeenCalledTimes(1);
    expect(h.play).toHaveBeenCalledWith('chime', expect.any(Number));
  });

  it('drives the background-music loop from the mute + music prefs', () => {
    h.muted = false;
    h.volume = 0.5;
    h.musicOn = true;
    renderDock();
    expect(h.bgMusic).toHaveBeenCalledWith({ enabled: true, muted: false, volume: 0.5 });
  });
});
