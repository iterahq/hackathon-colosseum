import { describe, it, expect, beforeEach, vi } from 'vitest';

interface OtpRequest {
  email: string;
  options: Record<string, unknown>;
}
interface VerifyRequest {
  email: string;
  token: string;
  type: string;
}

const signInWithOtp = vi.fn(async (_req: OtpRequest) => ({
  error: null as { message: string } | null,
}));
const verifyOtp = vi.fn(async (_req: VerifyRequest) => ({
  error: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ auth: { signInWithOtp, verifyOtp } }),
}));

const { sendLoginCode, sendSignupCode, verifySignupCode } = await import('./otpAuth.service');

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ error: null });
});

function optionsOfLastCall(): Record<string, unknown> {
  const call = signInWithOtp.mock.calls.at(-1);
  if (!call) throw new Error('signInWithOtp was never called');
  return call[0].options;
}

describe('who may mint an account', () => {
  /**
   * The two flows differ by exactly one flag, and swapping it silently turns a
   * mistyped login into a second empty account — or reopens the door this repo
   * spent a release closing. Pin both directions.
   */
  it('signing IN never creates a user', async () => {
    await sendLoginCode('someone@learner.dev');
    expect(optionsOfLastCall().shouldCreateUser).toBe(false);
  });

  it('signing UP does create one, and returns to the paywall', async () => {
    await sendSignupCode('new@learner.dev');
    expect(optionsOfLastCall().shouldCreateUser).toBe(true);
    expect(optionsOfLastCall().emailRedirectTo).toMatch(/\/subscribe$/);
  });
});

describe('verifySignupCode token types', () => {
  it('accepts the generic email token without a second round-trip', async () => {
    const { error } = await verifySignupCode('new@learner.dev', '123456');
    expect(error).toBeNull();
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'new@learner.dev',
      token: '123456',
      type: 'email',
    });
  });

  it('falls back to the signup token GoTrue mints for a brand-new address', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } });
    const { error } = await verifySignupCode('new@learner.dev', '123456');
    expect(error).toBeNull();
    expect(verifyOtp).toHaveBeenLastCalledWith({
      email: 'new@learner.dev',
      token: '123456',
      type: 'signup',
    });
  });

  it('reports the error when neither type verifies', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const { error } = await verifySignupCode('new@learner.dev', '000000');
    expect(error).toBe('Token has expired or is invalid');
  });
});
