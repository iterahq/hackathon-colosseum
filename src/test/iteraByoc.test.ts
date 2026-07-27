import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readByoc } from '@/api/iteraByoc';
import { IteraApiError, parseIteraApiError } from '@/api/iteraApiError';

/**
 * The generated tree is MODEL output that crossed the wire — untrusted at this
 * boundary even though itera-api validated it. These pin that the client refuses
 * a malformed one (so the activity degrades instead of crashing mid-render) and
 * that a JWT echoed back in an error body never survives into an Error message.
 */

vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiBase: () => 'https://api.test',
}));

const tree = {
  interaction: 'pick_best',
  options: [
    { id: 'a', content: 'Pedido vago', ai_response: 'Genérica' },
    { id: 'b', content: 'Pedido com contexto', ai_response: 'Sob medida' },
  ],
  correct_option_id: 'b',
};

function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('readByoc', () => {
  it('accepts a well-formed generation', async () => {
    respond({ generation_id: 'g1', seed: 'futebol', generated: tree });
    const row = await readByoc('act-1', 'tok');
    expect(row?.generated.options).toHaveLength(2);
  });

  it('rejects a tree the schema does not accept', async () => {
    respond({ generation_id: 'g1', seed: 'futebol', generated: { ...tree, correct_option_id: 'nope' } });
    await expect(readByoc('act-1', 'tok')).rejects.toThrow(/malformed byoc tree/);
  });

  it('treats 404 as "no generation yet", not an error', async () => {
    respond({}, 404);
    await expect(readByoc('act-1', 'tok')).resolves.toBeNull();
  });
});

describe('parseIteraApiError', () => {
  it('redacts an echoed token out of the error message', () => {
    const raw = JSON.stringify({ error: { code: 'invalid_request', message: 'bad' }, dfl_token: 'ey.SECRET.sig' });
    const err = parseIteraApiError(400, raw);
    expect(err).toBeInstanceOf(IteraApiError);
    expect(err.code).toBe('invalid_request');
    expect(err.message).not.toContain('SECRET');
    expect(err.message).toContain('[redacted]');
  });

  // BYOC prints `serverMessage` verbatim on the seed form, so it is the one field
  // that reaches the learner's screen — redaction there is not optional.
  it('redacts the token out of the learner-facing message too', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SECRETSIG';
    const raw = JSON.stringify({
      error: { code: 'seed_not_allowed', message: `try another theme (sent ${jwt})` },
    });
    const err = parseIteraApiError(400, raw);
    expect(err.serverMessage).not.toContain('SECRETSIG');
    expect(err.serverMessage).toContain('[redacted]');
  });

  it('redacts a refresh token echoed outside the known field names', () => {
    const raw = '<html>upstream rejected Authorization: Bearer eyJhbG.eyJzdWI.SIGX</html>';
    const err = parseIteraApiError(502, raw);
    expect(err.message).not.toContain('SIGX');
    expect(err.message).toContain('[redacted]');
  });
});
