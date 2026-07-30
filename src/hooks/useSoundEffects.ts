import { useCallback, useRef } from 'react';

// Servidos do nosso domínio (`scripts/vendor-sfx.ts`), nunca de CDN pública: na
// rede de escola do piloto o CDN cai e o aluno passa o exercício sem ouvir nada.
// O clipe de comemoração chegou a responder 403 na origem — o risco não é
// hipotético.
const SOUNDS = {
  // Warm, gentle reward chime on passing an exercise (agradável, not sharp).
  success: '/vendor/sfx/success.mp3',
  error: '/vendor/sfx/error.mp3',
  click: '/vendor/sfx/click.mp3',
  celebration: '/vendor/sfx/celebration.mp3',
  // Soft single bell — a gentle "sound is back on" cue.
  chime: '/vendor/sfx/chime.mp3',
  // Light "answer sent" tone — distinct from the success/error confirm cue.
  submit: '/vendor/sfx/submit.mp3',
};

type SoundType = keyof typeof SOUNDS;

export function useSoundEffects() {
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const play = useCallback((sound: SoundType, volume: number = 0.5) => {
    try {
      // Reuse or create audio element
      if (!audioRefs.current[sound]) {
        audioRefs.current[sound] = new Audio(SOUNDS[sound]);
      }
      
      const audio = audioRefs.current[sound];
      audio.volume = Math.min(1, Math.max(0, volume));
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay restrictions
      });
    } catch {
      // Ignore errors
    }
  }, []);

  const playSuccess = useCallback(() => play('success', 0.4), [play]);
  const playError = useCallback(() => play('error', 0.3), [play]);
  const playClick = useCallback(() => play('click', 0.2), [play]);
  const playCelebration = useCallback(() => play('celebration', 0.5), [play]);

  return {
    play,
    playSuccess,
    playError,
    playClick,
    playCelebration,
  };
}
