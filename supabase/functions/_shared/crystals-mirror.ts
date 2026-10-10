import { isSolanaAddress } from './address.ts';
import { linkedWalletOf } from './caller.ts';
import { explorerUrl } from './credential.ts';
import { loadAccount, type CrystalAccount } from './crystals-store.ts';
import { CRYSTAL_MINT_CONFIG_KEY } from './crystals-token.ts';
import { TOKEN_MIRROR_STALE_MS, mirrorCooldownLeftMs, mirrorStep } from './crystals.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { functionsBase } from './http.ts';

const MAX_PASSES = 3;

export const crystalMetadataUrl = (): string => `${functionsBase()}/crystals/token.json`;

/** What `GET /crystals` says about the chain side of an account. A learner with no wallet has no chain side. */
export function tokenView(account: CrystalAccount, mint: string | null, wallet: string | null) {
  const onChain = account.token_account ? account.mirrored_balance : 0;
  return {
    mint,
    token_account: account.token_account,
    mirrored: wallet !== null && onChain === account.balance,
    explorer_url: explorerUrl('address', account.token_account),
  };
}

/** The wallet crystals are mirrored to: the one the caller proved, else the linked one, else the companion's. */
async function walletFor(db: IteraClient, account: CrystalAccount, known: string | null): Promise<string | null> {
  if (known) return known;
  if (isSolanaAddress(account.wallet)) return account.wallet;
  const linked = await linkedWalletOf(db, account.user_id);
  if (linked) return linked.wallet;
  const { data, error } = await db.from('companions').select('wallet_address').eq('user_id', account.user_id).maybeSingle();
  if (error) throw new Error(`companions wallet: ${error.message}`);
  return isSolanaAddress(data?.wallet_address) ? data.wallet_address : null;
}

/** Takes the mirror of this account for this invocation. The token is the claim. */
async function claim(db: IteraClient, userId: string): Promise<string | null> {
  const now = new Date();
  const token = now.toISOString();
  const staleBefore = new Date(now.getTime() - TOKEN_MIRROR_STALE_MS).toISOString();
  const { data, error } = await db
    .from('crystal_accounts')
    .update({ mirror_claimed_at: token })
    .eq('user_id', userId)
    .or(`mirror_claimed_at.is.null,mirror_claimed_at.lt."${staleBefore}"`)
    .select('user_id');
  if (error) throw new Error(`crystal_accounts mirror claim: ${error.message}`);
  return (data ?? []).length > 0 ? token : null;
}

/**
 * Brings the learner's token balance to the ledger balance: mints the
 * difference or burns it. The ledger is the truth and this only follows it, so
 * it runs after the response and never throws: an earn or a spend is complete
 * without it. One invocation per account writes at a time; the others return,
 * and the holder reads the balance again after its write, so changes that
 * arrive inside the cooldown become one transaction. Whatever is still behind
 * is caught up by the learner's next `GET /crystals`. A learner with no wallet
 * is left alone: the whole balance is minted on the first call after one is linked.
 */
export async function mirrorCrystals(db: IteraClient, userId: string, knownWallet: string | null = null): Promise<void> {
  let token: string | null = null;
  try {
    let account = await loadAccount(db, userId);
    const wallet = await walletFor(db, account, knownWallet);
    if (!wallet) return;
    const settled = account.wallet === wallet && account.token_account !== null && account.mirrored_balance === account.balance;
    // Nothing to write, and no token account to create for a learner who never held a crystal.
    if (settled || (account.balance === 0 && account.token_account === null)) return;
    token = await claim(db, userId);
    if (!token) return;

    const sdk = await import('./chain.ts');
    const token2022 = await import('./crystals-chain.ts');
    const chain = sdk.loadChain();
    if ((await sdk.authorityLamports(chain)) < sdk.MIN_AUTHORITY_LAMPORTS) throw new Error('authority_unfunded');

    let mint = (await loadConfig(db))[CRYSTAL_MINT_CONFIG_KEY];
    if (!mint) {
      mint = await token2022.ensureCrystalMint(chain, crystalMetadataUrl());
      const { error } = await db.from('onchain_config').upsert({ key: CRYSTAL_MINT_CONFIG_KEY, value: mint, updated_at: new Date().toISOString() });
      if (error) throw new Error(`onchain_config: ${error.message}`);
    }
    const tokenAccount = token2022.crystalTokenAccount(chain, mint, wallet);

    for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
      const wait = mirrorCooldownLeftMs(account.mirrored_at, new Date());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      account = await loadAccount(db, userId);
      // The chain is asked, not remembered: a write whose confirmation was lost is seen here and not repeated.
      const held = await token2022.crystalTokenBalance(chain, tokenAccount);
      const step = mirrorStep(account.balance, held.amount);
      const signature = step.op === 'none' ? account.mirror_signature : await token2022.writeCrystalBalance(chain, { mint, wallet, tokenAccount, step });
      const written = {
        wallet,
        token_account: held.exists || step.op === 'mint' ? tokenAccount : null,
        mirrored_balance: account.balance,
        mirrored_at: step.op === 'none' ? account.mirrored_at : new Date().toISOString(),
        mirror_signature: signature,
        mirror_error: null,
      };
      const { error } = await db.from('crystal_accounts').update(written).eq('user_id', userId);
      if (error) throw new Error(`crystal_accounts mirror: ${error.message}`);
      account = { ...(await loadAccount(db, userId)) };
      if (account.mirrored_balance === account.balance) break;
    }
  } catch (error) {
    console.error(`crystals: token mirror for ${userId} failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    await db.from('crystal_accounts').update({ mirror_error: message }).eq('user_id', userId);
  } finally {
    if (token) await db.from('crystal_accounts').update({ mirror_claimed_at: null }).eq('user_id', userId).eq('mirror_claimed_at', token);
  }
}
