import { useEffect, useRef } from 'react';

/**
 * Generative gamified background music for the live class — a light chiptune
 * arpeggio + bassline synthesised with the Web Audio API (no asset download).
 * Kept quiet on purpose (flat master gain 0.05); silenced when muted,
 * disabled, or volume 0. Because browsers block autoplay, the AudioContext
 * resumes on the first user gesture.
 */
interface BackgroundMusicOptions {
  enabled: boolean;
  muted: boolean;
  volume: number;
}

const BASE_FREQ = 261.63; // C4
const STEP = 0.26; // seconds per melody step
const LOOKAHEAD_MS = 120;
const SCHEDULE_AHEAD = 0.4; // schedule notes this far ahead (s)
// Semitone offsets — a cheerful looping motif over a simple bassline.
const MELODY = [0, 4, 7, 12, 7, 4, 7, 4, 5, 9, 12, 16, 12, 9, 7, 4];
const BASS = [0, 0, 5, 5, 7, 7, 5, 5];

function toFreq(semitone: number): number {
  return BASE_FREQ * Math.pow(2, semitone / 12);
}

function blip(
  ctx: AudioContext,
  master: GainNode,
  when: number,
  freq: number,
  duration: number,
  type: OscillatorType,
  peak: number
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain).connect(master);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

export function useBackgroundMusic({ enabled, muted, volume }: BackgroundMusicOptions): void {
  const active = enabled && !muted && volume > 0;
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  // Track the target level in a ref so the running scheduler reads the latest
  // volume without being torn down and rebuilt on every slider tick.
  const levelRef = useRef(0);
  levelRef.current = active ? 0.05 * volume : 0;

  useEffect(() => {
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(levelRef.current, ctxRef.current.currentTime, 0.08);
    }
  }, [active, volume]);

  useEffect(() => {
    if (!active) return;

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = levelRef.current;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;

    let step = 0;
    let nextTime = ctx.currentTime + 0.1;

    const scheduler = window.setInterval(() => {
      master.gain.setTargetAtTime(levelRef.current, ctx.currentTime, 0.08);
      while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
        const mel = toFreq(MELODY[step % MELODY.length]);
        blip(ctx, master, nextTime, mel, STEP * 0.9, 'triangle', 0.35);
        if (step % 2 === 0) {
          const bass = toFreq(BASS[(step / 2) % BASS.length] - 12);
          blip(ctx, master, nextTime, bass, STEP * 1.6, 'sine', 0.4);
        }
        nextTime += STEP;
        step += 1;
      }
    }, LOOKAHEAD_MS);

    const resume = () => void ctx.resume();
    resume();
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });

    return () => {
      window.clearInterval(scheduler);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      ctxRef.current = null;
      masterRef.current = null;
      void ctx.close();
    };
  }, [active]);
}
