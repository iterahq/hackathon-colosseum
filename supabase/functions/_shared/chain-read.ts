import { MPL_CORE_PROGRAM_ID, deserializeAssetV1, deserializeCollectionV1 } from 'npm:@metaplex-foundation/mpl-core@1.10.0';
import type { OnchainAsset } from './profile.ts';
import { rpc } from './rpc.ts';

const MAX_ACCOUNTS = 100;

interface AccountInfo {
  data: [string, string];
  owner: string;
  lamports: number;
  executable: boolean;
}

type RawAccount = Parameters<typeof deserializeAssetV1>[0];

function rawAccount(address: string, info: AccountInfo): RawAccount {
  const data = Uint8Array.from(atob(info.data[0]), (char) => char.charCodeAt(0));
  return { publicKey: address, data, owner: info.owner, executable: info.executable, lamports: { basisPoints: BigInt(info.lamports) } } as unknown as RawAccount;
}

/**
 * Reads many Core assets and the collections they should belong to in ONE
 * `getMultipleAccounts` call. An address that holds no Core asset is absent
 * from the result. Lighter than `chain.ts`: no Umi client, no signer.
 */
export async function readAssets(assets: string[], collections: string[]): Promise<Map<string, OnchainAsset>> {
  const found = new Map<string, OnchainAsset>();
  const addresses = [...new Set([...collections, ...assets])];
  if (assets.length === 0) return found;
  if (addresses.length > MAX_ACCOUNTS) throw new Error(`readAssets: ${addresses.length} accounts exceed one RPC call`);

  const { value } = await rpc<{ value: Array<AccountInfo | null> }>('getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }]);
  const accounts = new Map<string, AccountInfo>();
  addresses.forEach((address, index) => {
    const info = value[index];
    if (info && info.owner === MPL_CORE_PROGRAM_ID) accounts.set(address, info);
  });

  const authorities = new Map<string, string>();
  for (const address of collections) {
    const info = accounts.get(address);
    if (!info) continue;
    try {
      authorities.set(address, deserializeCollectionV1(rawAccount(address, info)).updateAuthority);
    } catch {
      // Not a collection account: assets pointing at it stay unverified.
    }
  }

  for (const address of assets) {
    const info = accounts.get(address);
    if (!info) continue;
    try {
      const asset = deserializeAssetV1(rawAccount(address, info));
      const collection = asset.updateAuthority.type === 'Collection' ? (asset.updateAuthority.address ?? null) : null;
      found.set(address, {
        address,
        owner: asset.owner,
        frozen: asset.permanentFreezeDelegate?.frozen === true || asset.freezeDelegate?.frozen === true,
        attributes: (asset.attributes?.attributeList ?? []).map(({ key, value: text }) => ({ key, value: text })),
        collection,
        update_authority: collection ? (authorities.get(collection) ?? null) : null,
      });
    } catch {
      // Not an asset account.
    }
  }
  return found;
}
