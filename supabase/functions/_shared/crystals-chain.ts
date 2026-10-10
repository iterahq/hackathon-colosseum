import { publicKey, publicKeyBytes, transactionBuilder, type Instruction, type PublicKey, type Signer } from 'npm:@metaplex-foundation/umi@1.6.0';
import { derivedSigner, sendAndConfirm, type Chain } from './chain.ts';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  CRYSTAL_DECIMALS,
  CRYSTAL_NAME,
  CRYSTAL_SYMBOL,
  MINT_ACCOUNT_BYTES,
  TOKEN_2022_PROGRAM,
  burnData,
  createAccountData,
  createTokenAccountData,
  initializeMetadataData,
  initializeMetadataPointerData,
  initializeMintData,
  initializeNonTransferableMintData,
  initializePermanentDelegateData,
  mintBytesWithMetadata,
  mintToData,
} from './crystals-token.ts';
import type { MirrorStep } from './crystals.ts';

const SYSTEM_PROGRAM = publicKey('11111111111111111111111111111111');
const TOKEN_PROGRAM = publicKey(TOKEN_2022_PROGRAM);
const TOKEN_ACCOUNT_PROGRAM = publicKey(ASSOCIATED_TOKEN_PROGRAM);

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });
const step = (instruction: Instruction, signers: Signer[], bytesCreatedOnChain = 0) => ({ instruction, signers, bytesCreatedOnChain });

/**
 * The crystal mint, created on first use: Token-2022, no decimals,
 * NonTransferable, the authority as PermanentDelegate (so a spend burns without
 * the learner signing), metadata on the mint itself. Its address is derived
 * from the authority key, so a retry finds it instead of creating a second one.
 */
export async function ensureCrystalMint(chain: Chain, metadataUri: string): Promise<string> {
  const mint = await derivedSigner(chain, 'crystal-mint');
  if (await chain.umi.rpc.accountExists(mint.publicKey)) return mint.publicKey;

  const authority = chain.umi.identity;
  const authorityBytes = publicKeyBytes(authority.publicKey);
  const mintBytes = publicKeyBytes(mint.publicKey);
  const metadata = { name: CRYSTAL_NAME, symbol: CRYSTAL_SYMBOL, uri: metadataUri };
  const rent = await chain.umi.rpc.getRent(mintBytesWithMetadata(metadata));
  const onMint = (data: Uint8Array): Instruction => ({ programId: TOKEN_PROGRAM, keys: [meta(mint.publicKey, false, true)], data });

  await sendAndConfirm(
    chain,
    transactionBuilder([
      step(
        {
          programId: SYSTEM_PROGRAM,
          keys: [meta(authority.publicKey, true, true), meta(mint.publicKey, true, true)],
          data: createAccountData(Number(rent.basisPoints), MINT_ACCOUNT_BYTES, publicKeyBytes(TOKEN_PROGRAM)),
        },
        [authority, mint],
        MINT_ACCOUNT_BYTES,
      ),
      // Extensions are fixed before the mint is initialised and can never be added later.
      step(onMint(initializeNonTransferableMintData()), []),
      step(onMint(initializePermanentDelegateData(authorityBytes)), []),
      step(onMint(initializeMetadataPointerData(authorityBytes, mintBytes)), []),
      step(onMint(initializeMintData(CRYSTAL_DECIMALS, authorityBytes)), []),
      step(
        {
          programId: TOKEN_PROGRAM,
          keys: [meta(mint.publicKey, false, true), meta(authority.publicKey, false, false), meta(mint.publicKey, false, false), meta(authority.publicKey, true, false)],
          data: initializeMetadataData(metadata),
        },
        [authority],
      ),
    ]),
  );
  return mint.publicKey;
}

/** The learner's token account for the crystal mint: the associated one, the address every wallet looks at. */
export function crystalTokenAccount(chain: Chain, mint: string, wallet: string): string {
  const [address] = chain.umi.eddsa.findPda(TOKEN_ACCOUNT_PROGRAM, [publicKeyBytes(publicKey(wallet)), publicKeyBytes(TOKEN_PROGRAM), publicKeyBytes(publicKey(mint))]);
  return address;
}

/** The crystals the account holds on chain; 0 when it does not exist yet. */
export async function crystalTokenBalance(chain: Chain, tokenAccount: string): Promise<{ exists: boolean; amount: number }> {
  if (!(await chain.umi.rpc.accountExists(publicKey(tokenAccount)))) return { exists: false, amount: 0 };
  const result = await chain.umi.rpc.call<{ value: { amount: string } }>('getTokenAccountBalance', [tokenAccount, { commitment: 'confirmed' }]);
  return { exists: true, amount: Number(result.value.amount) };
}

/**
 * One transaction that brings the learner's token balance to the ledger's:
 * mints the difference, or burns it as the permanent delegate. The authority
 * signs alone and pays; the token account is created when it is missing.
 */
export function writeCrystalBalance(chain: Chain, input: { mint: string; wallet: string; tokenAccount: string; step: Exclude<MirrorStep, { op: 'none' }> }): Promise<string> {
  const authority = chain.umi.identity;
  const mint = publicKey(input.mint);
  const account = publicKey(input.tokenAccount);
  const steps = [];
  if (input.step.op === 'mint') {
    steps.push(
      step(
        {
          programId: TOKEN_ACCOUNT_PROGRAM,
          keys: [
            meta(authority.publicKey, true, true),
            meta(account, false, true),
            meta(publicKey(input.wallet), false, false),
            meta(mint, false, false),
            meta(SYSTEM_PROGRAM, false, false),
            meta(TOKEN_PROGRAM, false, false),
          ],
          data: createTokenAccountData(),
        },
        [authority],
      ),
      step({ programId: TOKEN_PROGRAM, keys: [meta(mint, false, true), meta(account, false, true), meta(authority.publicKey, true, false)], data: mintToData(input.step.amount) }, [authority]),
    );
  } else {
    steps.push(
      step({ programId: TOKEN_PROGRAM, keys: [meta(account, false, true), meta(mint, false, true), meta(authority.publicKey, true, false)], data: burnData(input.step.amount) }, [authority]),
    );
  }
  return sendAndConfirm(chain, transactionBuilder(steps));
}
