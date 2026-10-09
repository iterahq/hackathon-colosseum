import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { walletOf } from '@/utils/wallet';

const user = (over: Partial<User>) => over as User;

describe('walletOf', () => {
  it('reads the web3 identity claim', () => {
    const u = user({ identities: [{ provider: 'web3', identity_data: { custom_claims: { address: '7xKp' } } } as never] });
    expect(walletOf(u)).toBe('7xKp');
  });

  it('is null for an email user or no user', () => {
    expect(walletOf(user({ identities: [{ provider: 'email', identity_data: {} } as never], user_metadata: {} }))).toBeNull();
    expect(walletOf(null)).toBeNull();
  });
});
