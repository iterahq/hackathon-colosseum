import { describe, expect, it, vi } from 'vitest';
import type { BackendAnswer, ProbeFetch, ProbeResponse } from './backendProbe';
import { PROJECT, fakeJwt } from './jwt.testkit';
import { createNativeBackend, type TokenSource } from './nativeBackend';
import type { WritableBackend } from './nativeBackend';
import { createProfileHost, drawable, loadProfile } from './profileHost';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ok = (value: unknown): BackendAnswer => ({ kind: 'ok', value, status: 200 });
const ID = '00000000-0000-4000-8000-000000000002';
const ROW = { display_name: 'Ana', avatar_url: 'https://cdn.example/ana.png', dfl_avatar_url: 'https://learn.example/ana.jpg', email: 'ana@example.com' };

function fakeBackend(answers: { who?: BackendAnswer; rows?: BackendAnswer; update?: BackendAnswer | Promise<BackendAnswer> } = {}) {
  let session: ((signedIn: boolean) => void) | null = null;
  const rpc = vi.fn(async (): Promise<BackendAnswer> => answers.who ?? ok(ID));
  const rows = vi.fn(async (): Promise<BackendAnswer> => answers.rows ?? ok([ROW]));
  const update = vi.fn(async (): Promise<BackendAnswer> => answers.update ?? { kind: 'ok', value: 1, status: 200 });
  const backend: WritableBackend = {
    rpc,
    rows,
    update,
    email: async () => null,
    onSession: (listener) => {
      session = listener;
      return () => {
        session = null;
      };
    },
  };
  return { backend, rpc, rows, update, emit: (signedIn: boolean) => session?.(signedIn) };
}

async function mounted(fake: ReturnType<typeof fakeBackend>, enabled = true) {
  const host = createProfileHost({ backend: fake.backend, enabled });
  const seen = vi.fn();
  const off = host.subscribe(seen);
  await tick();
  return { host, seen, off };
}

const formOf = (host: { snapshot(): { form: { kind: string } } }) => {
  const { form } = host.snapshot() as ReturnType<ReturnType<typeof createProfileHost>['snapshot']>;
  if (form.kind !== 'ready') throw new Error(`form is ${form.kind}`);
  return form.form;
};

describe('drawable', () => {
  it('is a remote raster; a bundled icon of the web, an SVG and plain http are not', () => {
    expect(drawable('https://cdn.example/a.png?v=1')).toBe('https://cdn.example/a.png?v=1');
    expect(drawable('/avatars/robo.svg')).toBe('');
    expect(drawable('https://cdn.example/a.svg?v=1')).toBe('');
    expect(drawable('http://cdn.example/a.png')).toBe('');
    expect(drawable('')).toBe('');
  });
});

describe('loadProfile', () => {
  it('asks who the learner is, then reads that one row', async () => {
    const fake = fakeBackend();
    expect(await loadProfile(fake.backend)).toEqual({
      kind: 'ready',
      value: { id: ID, displayName: 'Ana', avatarUrl: 'https://cdn.example/ana.png', dflAvatarUrl: 'https://learn.example/ana.jpg', email: 'ana@example.com' },
    });
    expect(fake.rpc).toHaveBeenCalledWith('current_itera_user_id');
    expect(fake.rows).toHaveBeenCalledWith('users', `select=display_name,avatar_url,dfl_avatar_url,email&id=eq.${ID}`);
  });

  it('an account with no row is an empty profile, and no row is read for it', async () => {
    const none = fakeBackend({ who: ok(null) });
    expect(await loadProfile(none.backend)).toMatchObject({ kind: 'ready', value: { id: null, displayName: null } });
    expect(none.rows).not.toHaveBeenCalled();
    expect(await loadProfile(fakeBackend({ rows: ok([]) }).backend)).toMatchObject({ kind: 'ready', value: { id: null } });
  });

  it('never puts an id that is not a uuid into the query', async () => {
    const fake = fakeBackend({ who: ok('1&select=*') });
    expect(await loadProfile(fake.backend)).toEqual({ kind: 'error', unreachable: false });
    expect(fake.rows).not.toHaveBeenCalled();
  });

  it('no session is signed-out; a failed read is an error that says whether the backend answered', async () => {
    expect(await loadProfile(fakeBackend({ who: { kind: 'no-session' } }).backend)).toEqual({ kind: 'signed-out' });
    expect(await loadProfile(fakeBackend({ who: { kind: 'not-configured' } }).backend)).toEqual({ kind: 'signed-out' });
    expect(await loadProfile(fakeBackend({ who: { kind: 'failed', status: null } }).backend)).toEqual({ kind: 'error', unreachable: true });
    expect(await loadProfile(fakeBackend({ rows: { kind: 'failed', status: 500 } }).backend)).toEqual({ kind: 'error', unreachable: false });
    expect(await loadProfile(fakeBackend({ rows: ok({ not: 'rows' }) }).backend)).toEqual({ kind: 'error', unreachable: false });
  });
});

describe('createProfileHost', () => {
  it('a closed host reads nothing and says closed', async () => {
    const fake = fakeBackend();
    const { host } = await mounted(fake, false);
    expect(host.snapshot()).toEqual({ gate: 'closed', form: { kind: 'loading' }, learnPhoto: false });
    host.actions.onSave();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('loads, then shows the form: no icons to pick, the picture, the Learn photo on offer', async () => {
    const fake = fakeBackend();
    const host = createProfileHost({ backend: fake.backend, enabled: true });
    host.subscribe(() => {});
    expect(host.snapshot()).toEqual({ gate: 'open', form: { kind: 'loading' }, learnPhoto: false });
    await tick();
    expect(host.snapshot().learnPhoto).toBe(true);
    expect(formOf(host)).toMatchObject({ name: 'Ana', email: 'ana@example.com', avatarUrl: 'https://cdn.example/ana.png', presets: [], canSave: true, canRevert: false, saved: false });
    expect(host.snapshot()).toBe(host.snapshot());
  });

  it('signed out is a gate, and an error is the error state with a retry that reads again', async () => {
    const out = await mounted(fakeBackend({ who: { kind: 'no-session' } }));
    expect(out.host.snapshot().gate).toBe('signed-out');

    const fake = fakeBackend({ rows: { kind: 'failed', status: 500 } });
    const { host } = await mounted(fake);
    expect(host.snapshot()).toMatchObject({ gate: 'open', form: { kind: 'error' } });
    fake.rows.mockResolvedValueOnce(ok([ROW]));
    host.actions.onRetry();
    expect(host.snapshot().form).toEqual({ kind: 'loading' });
    await tick();
    expect(formOf(host).name).toBe('Ana');
  });

  it('saves the edited name alone: the stored avatar is not sent when it was not changed here', async () => {
    const fake = fakeBackend();
    const { host, seen } = await mounted(fake);
    host.actions.onEditName('  Ana Clara ');
    expect(formOf(host).name).toBe('  Ana Clara ');
    host.actions.onSave();
    expect(formOf(host)).toMatchObject({ saving: true, canSave: false });
    host.actions.onSave();
    await tick();
    expect(fake.update).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledWith('users', ID, { display_name: 'Ana Clara' });
    expect(formOf(host)).toMatchObject({ saving: false, saved: true, saveFailed: false });
    expect(seen).toHaveBeenCalled();
    host.actions.onEditName('Ana C');
    expect(formOf(host).saved).toBe(false);
  });

  it('a stored icon the shell cannot draw shows the initials and survives a save', async () => {
    const fake = fakeBackend({ rows: ok([{ ...ROW, avatar_url: '/avatars/robo.svg', dfl_avatar_url: null }]) });
    const { host } = await mounted(fake);
    expect(formOf(host)).toMatchObject({ avatarUrl: '', initials: 'AN', canRevert: false });
    expect(host.snapshot().learnPhoto).toBe(false);
    host.takeLearnPhoto();
    host.actions.onSave();
    await tick();
    expect(fake.update).toHaveBeenCalledWith('users', ID, { display_name: 'Ana' });
  });

  it('takes the Learn photo, reverts it, and sends the avatar only when it changed', async () => {
    const fake = fakeBackend({ rows: ok([{ ...ROW, avatar_url: '/avatars/robo.svg' }]) });
    const { host } = await mounted(fake);
    host.takeLearnPhoto();
    expect(formOf(host)).toMatchObject({ avatarUrl: 'https://learn.example/ana.jpg', canRevert: true });
    host.actions.onRevert();
    expect(formOf(host)).toMatchObject({ avatarUrl: '', canRevert: false });
    host.takeLearnPhoto();
    host.actions.onSave();
    await tick();
    expect(fake.update).toHaveBeenCalledWith('users', ID, { display_name: 'Ana', avatar_url: 'https://learn.example/ana.jpg' });
    expect(formOf(host)).toMatchObject({ saved: true, canRevert: false });
  });

  it('a refused write shows the save error and keeps what was typed', async () => {
    const fake = fakeBackend({ update: { kind: 'failed', status: 403 } });
    const { host } = await mounted(fake);
    host.actions.onEditName('Ana Clara');
    host.actions.onSave();
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Ana Clara', saveFailed: true, saved: false, saving: false, canSave: true });
  });

  it('does not save a short name, nor for an account with no row', async () => {
    const fake = fakeBackend();
    const { host } = await mounted(fake);
    host.actions.onEditName(' A ');
    expect(formOf(host).canSave).toBe(false);
    host.actions.onSave();
    const none = fakeBackend({ who: ok(null) });
    const empty = await mounted(none);
    empty.host.actions.onEditName('Ana');
    expect(formOf(empty.host)).toMatchObject({ name: 'Ana', canSave: false, initials: 'AN' });
    empty.host.actions.onSave();
    await tick();
    expect(fake.update).not.toHaveBeenCalled();
    expect(none.update).not.toHaveBeenCalled();
  });

  it('another learner signing in starts from that learner: nothing typed is inherited, and a late answer is dropped', async () => {
    let release: (answer: BackendAnswer) => void = () => {};
    const fake = fakeBackend({ update: new Promise<BackendAnswer>((resolve) => (release = resolve)) });
    const { host } = await mounted(fake);
    host.actions.onEditName('Typed by Ana');
    host.actions.onSave();
    fake.rows.mockResolvedValueOnce(ok([{ ...ROW, display_name: 'Bia', email: 'bia@example.com' }]));
    fake.emit(true);
    expect(host.snapshot().form).toEqual({ kind: 'loading' });
    await tick();
    release({ kind: 'ok', value: 1, status: 200 });
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Bia', email: 'bia@example.com', saved: false, saving: false });
  });

  it('a sign-out closes the gate at once', async () => {
    const fake = fakeBackend();
    const { host } = await mounted(fake);
    fake.emit(false);
    expect(host.snapshot().gate).toBe('signed-out');
  });
});

describe('createProfileHost: what a save may send and may claim (REVIEW-671)', () => {
  it('H1: a name longer than the 40 the field allows is cut before it is sent, whoever calls the host', async () => {
    const fake = fakeBackend();
    const { host } = await mounted(fake);
    host.actions.onEditName('y'.repeat(100_000));
    expect(formOf(host).name).toHaveLength(40);
    host.actions.onSave();
    await tick();
    expect(fake.update).toHaveBeenCalledWith('users', ID, { display_name: 'y'.repeat(40) });
  });

  it('H2: a write that changed no row is the save error, never "Perfil atualizado!"', async () => {
    const fake = fakeBackend({ update: { kind: 'ok', value: 0, status: 200 } });
    const { host } = await mounted(fake);
    host.actions.onEditName('Ana B');
    host.actions.onSave();
    await tick();
    expect(formOf(host)).toMatchObject({ saved: false, saveFailed: true, name: 'Ana B' });
  });
});

describe('createProfileHost: nothing of one learner reaches the next', () => {
  it('a refused write of learner A, answered after B signed in, marks nothing on B', async () => {
    let release: (answer: BackendAnswer) => void = () => {};
    const fake = fakeBackend({ update: new Promise<BackendAnswer>((resolve) => (release = resolve)) });
    const { host } = await mounted(fake);
    host.actions.onEditName('Typed by Ana');
    host.actions.onSave();
    fake.emit(false);
    fake.rows.mockResolvedValueOnce(ok([{ ...ROW, display_name: 'Bia', email: 'bia@example.com' }]));
    fake.emit(true);
    await tick();
    release({ kind: 'failed', status: 403 });
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Bia', saveFailed: false, saving: false, saved: false, canSave: true });
  });

  it('B signing in between the two reads of A never shows the row read for A', async () => {
    let releaseRows: (answer: BackendAnswer) => void = () => {};
    const fake = fakeBackend();
    fake.rows.mockImplementationOnce(() => new Promise<BackendAnswer>((resolve) => (releaseRows = resolve)));
    const host = createProfileHost({ backend: fake.backend, enabled: true });
    host.subscribe(() => {});
    await tick();
    fake.rows.mockResolvedValueOnce(ok([{ ...ROW, display_name: 'Bia', email: 'bia@example.com' }]));
    fake.emit(true);
    await tick();
    releaseRows(ok([ROW]));
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Bia', email: 'bia@example.com' });
  });

  it('what was typed, and a failed-save mark, do not survive leaving the screen', async () => {
    const fake = fakeBackend({ update: { kind: 'failed', status: 500 } });
    const { host, off } = await mounted(fake);
    host.actions.onEditName('Typed and left');
    host.actions.onSave();
    await tick();
    expect(formOf(host).saveFailed).toBe(true);
    off();
    host.subscribe(() => {});
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Ana', saveFailed: false, saved: false });
  });

  it('a save still out when the screen left changes nothing on the next visit', async () => {
    let release: (answer: BackendAnswer) => void = () => {};
    const fake = fakeBackend({ update: new Promise<BackendAnswer>((resolve) => (release = resolve)) });
    const { host, off } = await mounted(fake);
    host.actions.onEditName('Ana Clara');
    host.actions.onSave();
    off();
    host.subscribe(() => {});
    await tick();
    release({ kind: 'failed', status: 500 });
    await tick();
    expect(formOf(host)).toMatchObject({ name: 'Ana', saving: false, saveFailed: false });
  });
});

describe('createProfileHost over the real backend: a token the page gave late is an error, never a sign-out', () => {
  const BACKEND = { origin: PROJECT, anonKey: fakeJwt({ role: 'anon', iss: 'supabase', ref: 'x', sub: undefined, aud: undefined }) };
  const answer = (body: string, status = 200): ProbeResponse => ({ ok: status < 400, status, text: async () => body });

  function world() {
    const listeners = new Set<(event: { type: string }) => void>();
    let token: string | null = fakeJwt();
    const session: TokenSource = {
      getAccessToken: async () => token,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const calls: { method: string; url: string; body?: string }[] = [];
    const fetchImpl: ProbeFetch = async (url, init) => {
      calls.push({ method: init.method, url, body: init.body });
      if (init.method === 'PATCH') return answer(JSON.stringify([{ id: ID }]));
      return answer(url.includes('/rpc/') ? JSON.stringify(ID) : JSON.stringify([ROW]));
    };
    const backend = createNativeBackend(BACKEND, session, fetchImpl);
    const emit = (type: string) => listeners.forEach((l) => l({ type }));
    return { backend, calls, emit, setToken: (next: string | null) => (token = next) };
  }

  it('the first read: the page says signed in but hands no token -> the error state with a retry that works', async () => {
    const w = world();
    w.emit('signed-in');
    w.setToken(null);
    const host = createProfileHost({ backend: w.backend, enabled: true });
    host.subscribe(() => {});
    await tick();
    expect(host.snapshot()).toMatchObject({ gate: 'open', form: { kind: 'error' } });
    expect(w.calls).toHaveLength(0);
    w.setToken(fakeJwt());
    host.actions.onRetry();
    await tick();
    expect(formOf(host).name).toBe('Ana');
  });

  it('a save: the token is late -> the save error, the gate stays open, the typed name is kept, and saving again works', async () => {
    const w = world();
    w.emit('signed-in');
    const host = createProfileHost({ backend: w.backend, enabled: true });
    host.subscribe(() => {});
    await tick();
    host.actions.onEditName('Ana Clara');
    w.setToken(null);
    host.actions.onSave();
    await tick();
    expect(host.snapshot().gate).toBe('open');
    expect(formOf(host)).toMatchObject({ name: 'Ana Clara', saveFailed: true, saved: false });
    expect(w.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    w.setToken(fakeJwt());
    host.actions.onSave();
    await tick();
    expect(formOf(host)).toMatchObject({ saveFailed: false, saved: true });
    expect(w.calls.filter((c) => c.method === 'PATCH')).toEqual([{ method: 'PATCH', url: `${PROJECT}/rest/v1/users?id=eq.${ID}&select=id`, body: '{"display_name":"Ana Clara"}' }]);
  });

  it('a real sign-out is still a sign-out: the gate closes and the row is dropped', async () => {
    const w = world();
    w.emit('signed-in');
    const host = createProfileHost({ backend: w.backend, enabled: true });
    host.subscribe(() => {});
    await tick();
    w.emit('signed-out');
    w.setToken(null);
    expect(host.snapshot()).toEqual({ gate: 'signed-out', form: { kind: 'loading' }, learnPhoto: false });
    host.actions.onRetry();
    await tick();
    expect(host.snapshot().gate).toBe('signed-out');
  });
});
