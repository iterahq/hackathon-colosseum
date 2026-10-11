/**
 * A Metaplex Core asset account, decoded from its raw bytes in the browser: no
 * library, no Itera server. Layout (mpl-core `AssetV1`, then the plugin header
 * and registry): every offset read here is listed on the "Verify it yourself"
 * page so anyone can repeat it by hand.
 */
import { base58Encode } from '@/lib/chain/base58';

export const MPL_CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const KEY_ASSET_V1 = 1;
const KEY_PLUGIN_HEADER_V1 = 3;
const KEY_PLUGIN_REGISTRY_V1 = 4;
const PLUGIN_FREEZE_DELEGATE = 1;
const PLUGIN_PERMANENT_FREEZE_DELEGATE = 5;
const PLUGIN_ATTRIBUTES = 6;
const PLUGIN_NAMES: Record<number, string> = {
  0: 'Royalties',
  1: 'FreezeDelegate',
  2: 'BurnDelegate',
  3: 'TransferDelegate',
  4: 'UpdateDelegate',
  5: 'PermanentFreezeDelegate',
  6: 'Attributes',
  7: 'PermanentTransferDelegate',
  8: 'PermanentBurnDelegate',
  9: 'Edition',
  10: 'MasterEdition',
  11: 'AddBlocker',
  12: 'ImmutableMetadata',
  13: 'VerifiedCreators',
  14: 'Autograph',
};

export interface CorePlugin {
  type: number;
  name: string;
  /** Where the plugin's own bytes start in the account. */
  offset: number;
  authority: 'none' | 'owner' | 'update_authority' | string;
}

export interface CoreAsset {
  owner: string;
  /** The collection the asset belongs to, when its update authority is a collection. */
  collection: string | null;
  /** The update authority address, when it is a plain address. */
  updateAuthority: string | null;
  name: string;
  uri: string;
  plugins: CorePlugin[];
  attributes: Array<{ key: string; value: string }>;
  /** `true` when a FreezeDelegate or PermanentFreezeDelegate plugin says frozen: the asset cannot be transferred. */
  frozen: boolean;
  /** Which plugin freezes it, and the byte that says so. */
  frozenBy: { plugin: string; offset: number } | null;
}

class Reader {
  offset = 0;
  private readonly view: DataView;
  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  u8(): number {
    this.need(1);
    return this.data[this.offset++];
  }
  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  u64(): number {
    this.need(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('offset out of range');
    return Number(value);
  }
  key(): string {
    this.need(32);
    this.offset += 32;
    return base58Encode(this.data.subarray(this.offset - 32, this.offset));
  }
  text(): string {
    const length = this.u32();
    this.need(length);
    this.offset += length;
    return new TextDecoder().decode(this.data.subarray(this.offset - length, this.offset));
  }
  private need(length: number) {
    if (this.offset + length > this.data.length) throw new Error('account data ends early');
  }
}

/** The asset, or `null` when the bytes are not a Core `AssetV1` account. */
export function parseCoreAsset(data: Uint8Array): CoreAsset | null {
  try {
    const reader = new Reader(data);
    if (reader.u8() !== KEY_ASSET_V1) return null;
    const owner = reader.key();
    const authorityKind = reader.u8();
    const authority = authorityKind === 0 ? null : reader.key();
    const name = reader.text();
    const uri = reader.text();
    if (reader.u8() === 1) reader.u64();
    const asset: CoreAsset = {
      owner,
      collection: authorityKind === 2 ? authority : null,
      updateAuthority: authorityKind === 1 ? authority : null,
      name,
      uri,
      plugins: [],
      attributes: [],
      frozen: false,
      frozenBy: null,
    };
    if (reader.offset >= data.length) return asset;
    if (reader.u8() !== KEY_PLUGIN_HEADER_V1) return asset;
    reader.offset = reader.u64();
    if (reader.u8() !== KEY_PLUGIN_REGISTRY_V1) return asset;
    const count = reader.u32();
    for (let index = 0; index < count; index += 1) {
      const type = reader.u8();
      const authorityTag = reader.u8();
      const pluginAuthority = authorityTag === 3 ? reader.key() : authorityTag === 1 ? 'owner' : authorityTag === 2 ? 'update_authority' : 'none';
      asset.plugins.push({ type, name: PLUGIN_NAMES[type] ?? `plugin ${type}`, offset: reader.u64(), authority: pluginAuthority });
    }
    for (const plugin of asset.plugins) {
      const body = new Reader(data);
      body.offset = plugin.offset + 1;
      if (plugin.type === PLUGIN_FREEZE_DELEGATE || plugin.type === PLUGIN_PERMANENT_FREEZE_DELEGATE) {
        if (body.u8() === 1 && !asset.frozen) {
          asset.frozen = true;
          asset.frozenBy = { plugin: plugin.name, offset: plugin.offset + 1 };
        }
      }
      if (plugin.type === PLUGIN_ATTRIBUTES) {
        const entries = body.u32();
        for (let index = 0; index < entries; index += 1) asset.attributes.push({ key: body.text(), value: body.text() });
      }
    }
    return asset;
  } catch {
    return null;
  }
}

export const attributeOf = (asset: CoreAsset, key: string): string | null => asset.attributes.find((entry) => entry.key === key)?.value ?? null;
