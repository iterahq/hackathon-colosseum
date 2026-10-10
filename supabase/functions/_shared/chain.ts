import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@1.6.0';
import {
  createSignerFromKeypair,
  keypairIdentity,
  publicKey,
  type KeypairSigner,
  type TransactionBuilder,
  type Umi,
} from 'npm:@metaplex-foundation/umi@1.6.0';
import { base58 } from 'npm:@metaplex-foundation/umi@1.6.0/serializers';
import {
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
  mplCore,
  updatePlugin,
} from 'npm:@metaplex-foundation/mpl-core@1.10.0';
import { COLLECTIONS, type CollectionKind } from './chain-names.ts';
import type { OnchainAttribute } from './credential.ts';

export const MIN_AUTHORITY_LAMPORTS = 10_000_000;
const CONFIRM_TIMEOUT_MS = 45_000;
const CONFIRM_POLL_MS = 700;

export interface Chain {
  umi: Umi;
  authority: string;
  seed: Uint8Array;
}

export class ChainNotConfiguredError extends Error {}

function rpcUrl(): string {
  return Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';
}

/** Read-only connection: enough to fetch and verify assets, holds no key. */
export function readOnlyUmi(): Umi {
  return createUmi(rpcUrl(), 'confirmed').use(mplCore());
}

/** Connection that signs and pays as the minting authority. */
export function loadChain(): Chain {
  const raw = Deno.env.get('SOLANA_AUTHORITY_SECRET');
  if (!raw) throw new ChainNotConfiguredError('SOLANA_AUTHORITY_SECRET is not set');
  let secret: Uint8Array;
  try {
    secret = raw.trim().startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : base58.serialize(raw.trim());
  } catch {
    throw new ChainNotConfiguredError('SOLANA_AUTHORITY_SECRET is not a valid secret key');
  }
  if (secret.length !== 64) throw new ChainNotConfiguredError('SOLANA_AUTHORITY_SECRET must be a 64-byte secret key');
  const umi = readOnlyUmi();
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(keypair));
  return { umi, authority: keypair.publicKey, seed: secret.slice(0, 32) };
}

export async function authorityLamports(chain: Chain): Promise<number> {
  const balance = await chain.umi.rpc.getBalance(publicKey(chain.authority));
  return Number(balance.basisPoints);
}

/**
 * Every account we create has an address derived from the authority key and a
 * label (a row id, a collection name). A retry after a lost response finds the
 * account already there instead of minting a duplicate.
 */
export async function derivedSigner(chain: Chain, label: string): Promise<KeypairSigner> {
  const material = new Uint8Array([...chain.seed, ...new TextEncoder().encode(`itera-passport:${label}`)]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  return createSignerFromKeypair(chain.umi, chain.umi.eddsa.createKeypairFromSeed(digest));
}

export async function sendAndConfirm(chain: Chain, builder: TransactionBuilder): Promise<string> {
  const { umi } = chain;
  const transaction = await builder.setLatestBlockhash(umi).then((ready) => ready.buildAndSign(umi));
  const signature = await umi.rpc.sendTransaction(transaction, { commitment: 'confirmed' });
  const encoded = base58.deserialize(signature)[0];
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [status] = await umi.rpc.getSignatureStatuses([signature]);
    if (status?.error) throw new Error(`transaction ${encoded} failed: ${JSON.stringify(status.error)}`);
    if (status && (status.commitment === 'confirmed' || status.commitment === 'finalized')) return encoded;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
  throw new Error(`transaction ${encoded} was not confirmed in time`);
}

async function latestSignature(chain: Chain, address: string): Promise<string | null> {
  const signatures = await chain.umi.rpc.call<Array<{ signature: string }>>('getSignaturesForAddress', [
    address,
    { limit: 1 },
  ]);
  return signatures[0]?.signature ?? null;
}

/** Creates the collection on first use. Returns its address. */
export async function ensureCollection(chain: Chain, kind: CollectionKind, metadataUri: string): Promise<string> {
  const collection = await derivedSigner(chain, `collection:${kind}`);
  if (!(await chain.umi.rpc.accountExists(collection.publicKey))) {
    await sendAndConfirm(chain, createCollection(chain.umi, { collection, name: COLLECTIONS[kind].name, uri: metadataUri }));
  }
  return collection.publicKey;
}

export interface CreateCredentialInput {
  rowId: string;
  collection: string;
  owner: string;
  name: string;
  uri: string;
  attributes: OnchainAttribute[];
}

/**
 * Mints a soulbound asset to the learner: PermanentFreezeDelegate frozen with
 * authority None (nobody can ever thaw it), Attributes owned by the update authority.
 */
export async function createCredential(
  chain: Chain,
  input: CreateCredentialInput,
): Promise<{ asset: string; signature: string | null; alreadyExisted: boolean }> {
  const asset = await derivedSigner(chain, `asset:${input.rowId}`);
  if (await chain.umi.rpc.accountExists(asset.publicKey)) {
    return { asset: asset.publicKey, signature: await latestSignature(chain, asset.publicKey), alreadyExisted: true };
  }
  const signature = await sendAndConfirm(
    chain,
    create(chain.umi, {
      asset,
      collection: { publicKey: publicKey(input.collection) },
      owner: publicKey(input.owner),
      name: input.name,
      uri: input.uri,
      plugins: [
        { type: 'PermanentFreezeDelegate', frozen: true, authority: { type: 'None' } },
        { type: 'Attributes', attributeList: input.attributes },
      ],
    }),
  );
  return { asset: asset.publicKey, signature, alreadyExisted: false };
}

/**
 * Mints a COLLECTIBLE to the buyer: same derived address and Attributes plugin
 * as a credential, but no freeze plugin at all, so the owner can transfer it.
 */
export async function createCollectible(
  chain: Chain,
  input: CreateCredentialInput,
): Promise<{ asset: string; signature: string | null; alreadyExisted: boolean }> {
  const asset = await derivedSigner(chain, `asset:${input.rowId}`);
  if (await chain.umi.rpc.accountExists(asset.publicKey)) {
    return { asset: asset.publicKey, signature: await latestSignature(chain, asset.publicKey), alreadyExisted: true };
  }
  const signature = await sendAndConfirm(
    chain,
    create(chain.umi, {
      asset,
      collection: { publicKey: publicKey(input.collection) },
      owner: publicKey(input.owner),
      name: input.name,
      uri: input.uri,
      plugins: [{ type: 'Attributes', attributeList: input.attributes }],
    }),
  );
  return { asset: asset.publicKey, signature, alreadyExisted: false };
}

export function updateCredentialAttributes(
  chain: Chain,
  input: { asset: string; collection: string; attributes: OnchainAttribute[] },
): Promise<string> {
  return sendAndConfirm(
    chain,
    updatePlugin(chain.umi, {
      asset: publicKey(input.asset),
      collection: publicKey(input.collection),
      plugin: { type: 'Attributes', attributeList: input.attributes },
    }),
  );
}

export interface OnchainCredential {
  address: string;
  owner: string;
  name: string;
  uri: string;
  frozen: boolean;
  attributes: OnchainAttribute[];
  collection: string | null;
  /** The key that can update the asset: its own authority, or its collection's. */
  update_authority: string | null;
}

/** Reads the asset from chain. `null` when the address holds no Core asset. */
export async function readCredential(umi: Umi, address: string): Promise<OnchainCredential | null> {
  const key = publicKey(address);
  if (!(await umi.rpc.accountExists(key))) return null;
  let asset;
  try {
    asset = await fetchAsset(umi, key);
  } catch {
    return null;
  }
  const collection = asset.updateAuthority.type === 'Collection' ? (asset.updateAuthority.address ?? null) : null;
  const collectionAuthority = collection ? (await fetchCollection(umi, collection)).updateAuthority : null;
  return {
    address,
    owner: asset.owner,
    name: asset.name,
    uri: asset.uri,
    frozen: asset.permanentFreezeDelegate?.frozen === true || asset.freezeDelegate?.frozen === true,
    attributes: (asset.attributes?.attributeList ?? []).map(({ key: name, value }) => ({ key: name, value })),
    collection,
    update_authority: asset.updateAuthority.type === 'Address' ? (asset.updateAuthority.address ?? null) : collectionAuthority,
  };
}
