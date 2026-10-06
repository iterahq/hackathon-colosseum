import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LATE_PLAY_BUDGET_MS, SILENT_SWITCH_PROOF_SESSION_TYPE, SOUND_URLS } from '@/lib/soundClips';
import { createSoundEngine } from '@/lib/soundEngine';
import type { SoundEngineDeps } from '@/types/sound';

type Listener = () => void;

class FakeTarget {
  listeners = new Map<string, Set<Listener>>();
  visibilityState = 'visible';
  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string) {
    [...(this.listeners.get(type) ?? [])].forEach((listener) => listener());
  }
  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

interface FakeSource {
  buffer: { duration: number } | null;
  gain?: FakeGain;
  startedInState: string | null;
  connect: (node: unknown) => void;
  disconnect: () => void;
  start: () => void;
  onended: (() => void) | null;
}

interface FakeGain {
  gain: { value: number };
  connect: (node: unknown) => void;
  disconnect: () => void;
}

const world = {
  contexts: [] as FakeContext[],
  startsRunning: false,
  decodeFails: false,
  constructorThrows: false,
};

class FakeContext extends FakeTarget {
  state = world.startsRunning ? 'running' : 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  decoded: number[] = [];
  resumeCalls = 0;

  constructor() {
    super();
    if (world.constructorThrows) throw new Error('no audio device');
    world.contexts.push(this);
  }
  setState(state: string) {
    this.state = state;
    this.fire('statechange');
  }
  resume() {
    this.resumeCalls += 1;
    this.setState('running');
    return Promise.resolve();
  }
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate };
  }
  createGain(): FakeGain {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }
  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      startedInState: null,
      onended: null,
      connect: (node) => {
        if ((node as FakeGain).gain) source.gain = node as FakeGain;
      },
      disconnect: vi.fn(),
      start: () => {
        source.startedInState = this.state;
        this.sources.push(source);
      },
    };
    return source;
  }
  decodeAudioData(data: ArrayBuffer) {
    this.decoded.push(data.byteLength);
    return world.decodeFails ? Promise.reject(new Error('bad mp3')) : Promise.resolve({ duration: 1.8 });
  }
  /** Sources that carry a clip, not the one-sample unlock buffer. */
  clips() {
    return this.sources.filter((source) => (source.buffer?.duration ?? 0) > 0.1);
  }
}

interface FakeAudio {
  src: string;
  preload: string;
  volume: number;
  currentTime: number;
  play: ReturnType<typeof vi.fn>;
}

function setup(overrides: Partial<SoundEngineDeps> = {}) {
  const gestures = new FakeTarget();
  const visibility = new FakeTarget();
  const audios: FakeAudio[] = [];
  const clock = { now: 0 };
  const fetchBytes = vi.fn((url: string) => Promise.resolve(new ArrayBuffer(url.length)));
  const idleTasks: (() => void)[] = [];
  const deps: SoundEngineDeps = {
    AudioContextCtor: FakeContext as unknown as SoundEngineDeps['AudioContextCtor'],
    fetchBytes,
    createAudio: (src) => {
      const audio: FakeAudio = { src, preload: '', volume: 1, currentTime: 5, play: vi.fn(() => Promise.resolve()) };
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
    gestureTarget: gestures,
    visibility,
    idle: (task) => idleTasks.push(task),
    now: () => clock.now,
    saveData: () => false,
    audioSession: () => undefined,
    ...overrides,
  };
  return { engine: createSoundEngine(deps), gestures, visibility, audios, clock, fetchBytes, idleTasks };
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

beforeEach(() => {
  world.contexts = [];
  world.startsRunning = false;
  world.decodeFails = false;
  world.constructorThrows = false;
});

describe('sound engine', () => {
  it('creates no context and plays nothing before a gesture', async () => {
    const { engine, fetchBytes } = setup();
    await engine.preload(['success']);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(world.contexts).toHaveLength(0);
  });

  it('unlocks on the first gesture: one context, resumed, a silent buffer started inside it', async () => {
    const { gestures } = setup();
    expect(gestures.count('pointerdown')).toBe(1);
    gestures.fire('pointerdown');
    await settle();
    const [ctx] = world.contexts;
    expect(world.contexts).toHaveLength(1);
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer?.duration).toBeLessThan(0.001);
    expect(ctx.clips()).toHaveLength(0);
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) expect(gestures.count(type)).toBe(0);
  });

  it('decodes a clip once and plays it N times through N source nodes, with no fetch at play time', async () => {
    const { engine, gestures, fetchBytes } = setup();
    await engine.preload(['success']);
    gestures.fire('touchend');
    await settle();
    const [ctx] = world.contexts;
    expect(ctx.decoded).toHaveLength(1);

    fetchBytes.mockClear();
    engine.play('success', 0.4);
    engine.play('success', 0.4);
    engine.play('success', 2);
    expect(ctx.clips()).toHaveLength(3);
    expect(new Set(ctx.clips()).size).toBe(3);
    expect(ctx.clips().map((source) => source.gain?.gain.value)).toEqual([0.4, 0.4, 1]);
    expect(ctx.clips().every((source) => source.startedInState === 'running')).toBe(true);
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(ctx.decoded).toHaveLength(1);
    expect(world.contexts).toHaveLength(1);
  });

  it('fetches a clip once even when preload is asked twice', async () => {
    const { engine, fetchBytes } = setup();
    await Promise.all([engine.preload(['success', 'error']), engine.preload(['success'])]);
    await engine.preload(['success']);
    expect(fetchBytes.mock.calls.map(([url]) => url).sort()).toEqual([SOUND_URLS.error, SOUND_URLS.success]);
  });

  it('preloads at idle time, and only the essential clips on a data-saver connection', async () => {
    const full = setup();
    full.engine.schedulePreload(['success', 'error', 'click', 'celebration']);
    expect(full.fetchBytes).not.toHaveBeenCalled();
    full.idleTasks.forEach((task) => task());
    expect(full.fetchBytes).toHaveBeenCalledTimes(4);

    const saver = setup({ saveData: () => true });
    saver.engine.schedulePreload(['success', 'error', 'click', 'celebration']);
    saver.idleTasks.forEach((task) => task());
    expect(saver.fetchBytes.mock.calls.map(([url]) => url)).toEqual([SOUND_URLS.success, SOUND_URLS.error, SOUND_URLS.click]);
  });

  it('resumes after an iOS interruption on the next gesture, and never queues a sound on a stopped context', async () => {
    const { engine, gestures } = setup();
    await engine.preload(['success']);
    gestures.fire('pointerdown');
    await settle();
    const [ctx] = world.contexts;

    ctx.resume = () => new Promise<void>(() => undefined);
    ctx.setState('interrupted');
    expect(gestures.count('touchend')).toBe(1);
    engine.play('success');
    await settle();
    expect(ctx.clips()).toHaveLength(0);

    ctx.resume = () => {
      ctx.setState('running');
      return Promise.resolve();
    };
    gestures.fire('touchend');
    await settle();
    expect(ctx.state).toBe('running');
    expect(gestures.count('touchend')).toBe(0);
    engine.play('success');
    expect(ctx.clips()).toHaveLength(1);
  });

  it('tries to resume when the page becomes visible again', async () => {
    const { gestures, visibility } = setup();
    gestures.fire('pointerdown');
    await settle();
    const [ctx] = world.contexts;
    ctx.setState('suspended');
    const before = ctx.resumeCalls;
    visibility.fire('visibilitychange');
    await settle();
    expect(ctx.resumeCalls).toBe(before + 1);
    expect(ctx.state).toBe('running');
  });

  it('plays a clip that was not preloaded only if it is ready within the late budget', async () => {
    world.startsRunning = true;
    const late = setup();
    late.fetchBytes.mockImplementation(async (url: string) => {
      late.clock.now += LATE_PLAY_BUDGET_MS + 1;
      return new ArrayBuffer(url.length);
    });
    late.engine.play('celebration');
    await settle();
    expect(world.contexts[0].clips()).toHaveLength(0);

    late.engine.play('celebration');
    expect(world.contexts[0].clips()).toHaveLength(1);

    const prompt = setup();
    prompt.engine.play('chime');
    await settle();
    expect(world.contexts[1].clips()).toHaveLength(1);
  });

  it('falls back to a preloaded media element when Web Audio is missing', async () => {
    const { engine, audios, fetchBytes, gestures } = setup({ AudioContextCtor: undefined });
    expect(gestures.count('pointerdown')).toBe(0);
    await engine.preload(['success']);
    expect(audios).toHaveLength(1);
    expect(audios[0]).toMatchObject({ src: SOUND_URLS.success, preload: 'auto' });

    engine.play('success', 0.4);
    engine.play('success', 0.4);
    expect(audios).toHaveLength(1);
    expect(audios[0].play).toHaveBeenCalledTimes(2);
    expect(audios[0]).toMatchObject({ volume: 0.4, currentTime: 0 });
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('falls back to a media element for a clip that fails to decode', async () => {
    world.decodeFails = true;
    const { engine, gestures, audios } = setup();
    await engine.preload(['success']);
    gestures.fire('pointerdown');
    await settle();
    expect(audios.map((audio) => audio.src)).toEqual([SOUND_URLS.success]);
    engine.play('success', 0.3);
    expect(audios[0].play).toHaveBeenCalledTimes(1);
    expect(world.contexts[0].clips()).toHaveLength(0);
  });

  it('falls back to media elements when the context cannot be created', async () => {
    world.constructorThrows = true;
    const { engine, gestures, audios } = setup();
    await engine.preload(['success', 'error']);
    gestures.fire('pointerdown');
    expect(audios.map((audio) => audio.src).sort()).toEqual([SOUND_URLS.error, SOUND_URLS.success]);
    engine.play('error', 0.3);
    expect(audios.find((audio) => audio.src === SOUND_URLS.error)!.play).toHaveBeenCalledTimes(1);
  });

  it('never throws into the caller', async () => {
    const { engine, gestures } = setup({
      fetchBytes: () => Promise.reject(new Error('offline')),
      createAudio: () => {
        throw new Error('no audio');
      },
      saveData: () => {
        throw new Error('no connection api');
      },
    });
    gestures.fire('pointerdown');
    expect(() => engine.play('success')).not.toThrow();
    expect(() => engine.schedulePreload(['success'])).not.toThrow();
    await expect(engine.preload(['success', 'error'])).resolves.toBeUndefined();
    await settle();
    expect(world.contexts[0].clips()).toHaveLength(0);
  });

  it('sets the audio session to playback inside the first gesture, before the context resumes, and only once', async () => {
    const order: string[] = [];
    const session = {
      value: 'auto',
      writes: 0,
      get type() {
        return this.value;
      },
      set type(next: string) {
        this.value = next;
        this.writes += 1;
        order.push(`session:${next}:${world.contexts[0]?.resumeCalls ?? 'no-context'}`);
      },
    };
    const { engine, gestures } = setup({ audioSession: () => session });
    await engine.preload(['success']);
    expect(session.writes).toBe(0);

    gestures.fire('touchend');
    await settle();
    expect(SILENT_SWITCH_PROOF_SESSION_TYPE).toBe('playback');
    expect(order).toEqual(['session:playback:no-context']);
    expect(world.contexts[0].resumeCalls).toBe(1);

    world.contexts[0].setState('interrupted');
    gestures.fire('touchend');
    await settle();
    expect(session.writes).toBe(1);
    engine.play('success');
    expect(world.contexts[0].clips()).toHaveLength(1);
  });

  it('keeps playing when the audio session refuses the type', async () => {
    const session = {
      get type(): string {
        return 'auto';
      },
      set type(_next: string) {
        throw new Error('InvalidStateError');
      },
    };
    const { engine, gestures } = setup({ audioSession: () => session });
    await engine.preload(['success']);
    gestures.fire('pointerdown');
    await settle();
    engine.play('success');
    expect(world.contexts[0].clips()).toHaveLength(1);
  });
});
