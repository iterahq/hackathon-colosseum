import { avatarImageUrl, teraProof } from './avatars.ts';
import { fetchPictureDataUri } from './avatar-image.ts';
import type { Lang } from './art.ts';
import { loadBounty, loadClaims } from './bounty-store.ts';
import { bountyPageUrl, type BountyRow } from './bounty.ts';
import { COLLECTIONS } from './chain-names.ts';
import { pickText } from './credential.ts';
import { loadConfig, type IteraClient } from './db.ts';
import { functionsBase } from './http.ts';
import type { OnchainAsset } from './profile.ts';
import { rpc } from './rpc.ts';
import {
  PRIZE_BASES,
  PRIZE_SWITCH,
  SPONSOR_RARITY,
  SPONSOR_TIER_NAME,
  paidPrizeFee,
  prizeOf,
  sponsorAssetName,
  sponsorAttributes,
  sponsorImageUrl,
  sponsorMetadataUrl,
  type PrizeTera,
} from './sponsor-tera.ts';

const UNIQUE_VIOLATION = '23505';
const STALE_MINT_MS = 3 * 60_000;
export const SPONSOR_COLUMNS = 'id,bounty_id,claim_id,user_id,wallet,brand,accent,base,edition,edition_size,payout_signature,mint_status,asset_address,tx_signature,minted_at,created_at';

export interface SponsorTeraRow {
  id: string;
  bounty_id: string;
  claim_id: string;
  user_id: string;
  wallet: string;
  brand: string;
  accent: string;
  base: string;
  edition: number;
  edition_size: number;
  payout_signature: string;
  mint_status: 'pending' | 'minted' | 'failed';
  asset_address: string | null;
  tx_signature: string | null;
  minted_at: string | null;
  created_at: string;
}

export function prizeEnabled(config: Record<string, string>): boolean {
  return config[PRIZE_SWITCH] === 'on';
}

const message = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 300);

function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

/** The base Tera's published picture, inlined for the composed art. The key is checked against the short list before any URL is built. */
export async function basePicture(base: string): Promise<string | null> {
  if (!(PRIZE_BASES as readonly string[]).includes(base)) return null;
  // The free faces are published under their sheet-A names.
  const key = base === 'tera_normal' || base === 'tera_feliz' || base === 'tera_determinado' || base === 'tera_focado' ? base.replace('tera_', 'tera_a_') : base;
  return (await fetchPictureDataUri(avatarImageUrl(supabaseUrl(), { key, image_key: key }, '512'), 110_000)) ?? (await fetchPictureDataUri(avatarImageUrl(supabaseUrl(), { key, image_key: key }, '128'), 60_000));
}

/** The base Teras a sponsor may pick, for the form. */
export function prizeBases(lang: Lang) {
  const titles: Record<string, { pt: string; en: string }> = {
    tera_normal: { pt: 'Tera tranquilo', en: 'Calm Tera' },
    tera_feliz: { pt: 'Tera feliz', en: 'Happy Tera' },
    tera_determinado: { pt: 'Tera determinado', en: 'Determined Tera' },
    tera_focado: { pt: 'Tera focado', en: 'Focused Tera' },
  };
  return PRIZE_BASES.map((key) => {
    const image = key.replace('tera_', 'tera_a_');
    return { key, title: titles[key][lang], image_url: avatarImageUrl(supabaseUrl(), { key: image, image_key: image }), thumb_url: avatarImageUrl(supabaseUrl(), { key: image, image_key: image }, '128') };
  });
}

interface FundingTransaction {
  meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null;
  transaction: { message: { accountKeys: string[] } };
}

/**
 * Records that the funding transaction of a bounty paid for its prize: the
 * transaction that created THIS bounty's escrow account also raised the
 * treasury by the mint cost plus the fee. One transaction pays for one prize
 * (the column is unique). Never throws; `false` leaves the prize unfunded.
 */
export async function verifyPrizeFee(db: IteraClient, bounty: BountyRow, config: Record<string, string>): Promise<boolean> {
  if (!prizeOf(bounty.prize_tera)) return false;
  if (bounty.prize_fee_signature) return true;
  if (!bounty.funding_signature || !config.treasury) return false;
  try {
    const transaction = await rpc<FundingTransaction | null>('getTransaction', [bounty.funding_signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
    if (!transaction || !transaction.transaction.message.accountKeys.includes(bounty.escrow_address) || !paidPrizeFee(transaction, config.treasury)) return false;
    const { error } = await db.from('bounties').update({ prize_fee_signature: bounty.funding_signature }).eq('id', bounty.id).is('prize_fee_signature', null);
    if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
    return !error;
  } catch (error) {
    console.error('prize fee not verified', bounty.id, message(error));
    return false;
  }
}

async function claimMint(db: IteraClient, rowId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MINT_MS).toISOString();
  const { data, error } = await db
    .from('sponsor_teras')
    .update({ mint_claimed_at: new Date().toISOString() })
    .eq('id', rowId)
    .in('mint_status', ['pending', 'failed'])
    .or(`mint_claimed_at.is.null,mint_claimed_at.lt."${staleBefore}"`)
    .select('id');
  if (error) throw new Error(`sponsor_teras claim: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Mints the prize of a PAID bounty to the wallet the escrow paid, once. Every
 * fact comes from our row of the bounty as the escrow account settled it: the
 * payee, the payout transaction, the three prize values stored at posting.
 * Idempotent (one row per bounty and claim, an asset address derived from the
 * row). Never throws: a failure is on the row and the next read tries again.
 */
export async function issuePrizeTera(db: IteraClient, bountyId: string): Promise<SponsorTeraRow | null> {
  try {
    const [bounty, config] = await Promise.all([loadBounty(db, { id: bountyId }), loadConfig(db)]);
    const prize = bounty ? prizeOf(bounty.prize_tera) : null;
    if (!bounty || !prize || !prizeEnabled(config)) return null;
    if (bounty.status !== 'paid' || bounty.origin !== 'wallet' || !bounty.claim_id || !bounty.paid_wallet || !bounty.payout_signature) return null;
    const claim = (await loadClaims(db, [bounty.claim_id])).get(bounty.claim_id);
    // The Tera goes where the money went, and to nobody else.
    if (!claim || claim.status !== 'approved' || claim.wallet !== bounty.paid_wallet) return null;
    if (!(await verifyPrizeFee(db, bounty, config))) return null;

    let row: SponsorTeraRow | null = null;
    const inserted = await db
      .from('sponsor_teras')
      .insert({ bounty_id: bounty.id, claim_id: claim.id, user_id: claim.user_id, wallet: claim.wallet, brand: prize.brand, accent: prize.accent, base: prize.base, edition: 1, edition_size: 1, payout_signature: bounty.payout_signature })
      .select(SPONSOR_COLUMNS)
      .maybeSingle();
    if (inserted.error && inserted.error.code !== UNIQUE_VIOLATION) throw new Error(`sponsor_teras insert: ${inserted.error.message}`);
    row = inserted.data as SponsorTeraRow | null;
    if (!row) {
      const { data, error } = await db.from('sponsor_teras').select(SPONSOR_COLUMNS).eq('bounty_id', bounty.id).eq('claim_id', claim.id).maybeSingle();
      if (error) throw new Error(`sponsor_teras: ${error.message}`);
      row = data as SponsorTeraRow | null;
    }
    if (!row) return null;
    if (row.mint_status === 'minted' && row.asset_address) return row;
    if (!(await claimMint(db, row.id))) return row;

    try {
      const sdk = await import('./chain.ts');
      const chain = sdk.loadChain();
      if ((await sdk.authorityLamports(chain)) < sdk.MIN_AUTHORITY_LAMPORTS) throw new Error('authority_unfunded');
      const collection = config[COLLECTIONS.avatars.configKey];
      if (!collection) throw new Error('avatars collection is not configured');
      const stored: PrizeTera = { brand: row.brand, accent: row.accent, base: row.base as PrizeTera['base'] };
      const created = await sdk.createCredential(chain, {
        rowId: `sponsor:${row.id}`,
        collection,
        owner: row.wallet,
        name: sponsorAssetName(stored, row.edition),
        uri: sponsorMetadataUrl(functionsBase(), row.id),
        attributes: sponsorAttributes({ prize: stored, edition: row.edition, editionSize: row.edition_size, wallet: row.wallet, bountyId: bounty.id, payoutSignature: row.payout_signature }),
      });
      const { data, error } = await db
        .from('sponsor_teras')
        .update({ mint_status: 'minted', asset_address: created.asset, tx_signature: created.signature, minted_at: new Date().toISOString(), mint_error: null, mint_claimed_at: null })
        .eq('id', row.id)
        .select(SPONSOR_COLUMNS)
        .single();
      if (error) throw new Error(`sponsor_teras settle: ${error.message}`);
      const { error: bountyError } = await db.from('bounties').update({ prize_issued: 1, prize_asset: created.asset }).eq('id', bounty.id);
      if (bountyError) console.error('prize not noted on the bounty', bounty.id, bountyError.message);
      return data as SponsorTeraRow;
    } catch (failure) {
      await db.from('sponsor_teras').update({ mint_status: 'failed', mint_error: message(failure), mint_claimed_at: null }).eq('id', row.id).neq('mint_status', 'minted');
      throw failure;
    }
  } catch (error) {
    console.error('prize tera not issued', bountyId, message(error));
    return null;
  }
}

export async function sponsorTeraById(db: IteraClient, id: string): Promise<SponsorTeraRow | null> {
  const { data, error } = await db.from('sponsor_teras').select(SPONSOR_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`sponsor_teras: ${error.message}`);
  return data as SponsorTeraRow | null;
}

export async function sponsorTeraByAsset(db: IteraClient, asset: string): Promise<SponsorTeraRow | null> {
  const { data, error } = await db.from('sponsor_teras').select(SPONSOR_COLUMNS).eq('asset_address', asset).maybeSingle();
  if (error) throw new Error(`sponsor_teras: ${error.message}`);
  return data as SponsorTeraRow | null;
}

/** The sponsor Teras minted to a wallet, oldest first. Never throws: a profile without them is still a profile. */
export async function sponsorTerasOfWallet(db: IteraClient, wallet: string): Promise<SponsorTeraRow[]> {
  try {
    const { data, error } = await db.from('sponsor_teras').select(SPONSOR_COLUMNS).eq('wallet', wallet).eq('mint_status', 'minted').not('asset_address', 'is', null).order('minted_at').limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as SponsorTeraRow[];
  } catch (error) {
    console.error('sponsor teras unavailable', message(error));
    return [];
  }
}

/** Slug and title of the bounties behind these rows. */
export async function bountiesOf(db: IteraClient, rows: readonly SponsorTeraRow[]): Promise<Map<string, Pick<BountyRow, 'id' | 'slug' | 'slug_en' | 'title_i18n' | 'sponsor_name'>>> {
  const ids = [...new Set(rows.map((row) => row.bounty_id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await db.from('bounties').select('id,slug,slug_en,title_i18n,sponsor_name').in('id', ids);
  if (error) throw new Error(`bounties: ${error.message}`);
  return new Map(((data ?? []) as Array<Pick<BountyRow, 'id' | 'slug' | 'slug_en' | 'title_i18n' | 'sponsor_name'>>).map((bounty) => [bounty.id, bounty]));
}

/** The `sponsor` block of a Tera object. */
export function sponsorBlock(row: SponsorTeraRow, bounty: Pick<BountyRow, 'slug' | 'title_i18n'> | undefined, lang: Lang) {
  return {
    brand: row.brand,
    accent: row.accent,
    base: row.base,
    bounty_slug: bounty?.slug ?? '',
    bounty_title: pickText(bounty?.title_i18n, lang),
    bounty_url: bounty ? bountyPageUrl(bounty.slug) : null,
    payout_tx: row.payout_signature,
    payout_explorer_url: `https://explorer.solana.com/tx/${row.payout_signature}?cluster=devnet`,
  };
}

/** A sponsor Tera as an entry of `learner-profile.avatars[]`: the same keys as any Tera, `origin: "sponsor"`. */
export function sponsorProfileEntry(row: SponsorTeraRow, bounty: Pick<BountyRow, 'slug' | 'title_i18n'> | undefined, onchain: OnchainAsset | undefined, config: Record<string, string>, lang: Lang) {
  const asset = row.asset_address as string;
  const image = sponsorImageUrl(functionsBase(), row.id);
  return {
    origin: 'sponsor' as const,
    transferable: false,
    proof: teraProof(asset),
    sponsor: sponsorBlock(row, bounty, lang),
    frozen: onchain?.frozen ?? null,
    key: row.base,
    title: row.brand,
    lore: null,
    rarity: SPONSOR_RARITY,
    tier_name: SPONSOR_TIER_NAME[lang],
    serial: row.edition,
    supply_cap: row.edition_size,
    asset,
    verified: onchain !== undefined && onchain.owner === row.wallet && Boolean(config.collection_avatars) && onchain.collection === config.collection_avatars && onchain.update_authority === config.authority && onchain.frozen,
    image_url: image,
    thumb_url: image,
    chip_url: image,
    page_url: teraProof(asset).page_url,
    explorer_url: teraProof(asset).explorer_url,
  };
}
