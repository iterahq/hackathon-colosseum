// Puts the Metaplex Core Royalties plugin on the "Itera Avatars" collection, paying the treasury, and
// records the rate in `itera.onchain_config.avatar_royalty_bps` (what `shop-items` states on a card).
// Safe to run again: a collection that already has the plugin at this rate is left alone.
//
//   source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
//   DENO_NO_PACKAGE_JSON=1 deno run -A scripts/hackathon/avatars-royalties.deno.ts          # add or check
//   DENO_NO_PACKAGE_JSON=1 deno run -A scripts/hackathon/avatars-royalties.deno.ts --check  # read only
//
// One transaction signed and paid by the mint authority (the collection's update authority): the fee
// plus the rent of the plugin, well under 0.002 SOL. Royalties on Core are paid by the marketplaces
// that honour the plugin; `ruleSet: None` restricts no program, and a plain wallet-to-wallet transfer
// pays nothing. The soulbound Teras of the same collection cannot move at all.
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@1.6.0';
import { keypairIdentity, publicKey } from 'npm:@metaplex-foundation/umi@1.6.0';
import { base58 } from 'npm:@metaplex-foundation/umi@1.6.0/serializers';
import { addCollectionPlugin, fetchCollection, mplCore, ruleSet, updateCollectionPlugin } from 'npm:@metaplex-foundation/mpl-core@1.10.0';

const PROJECT_REF = 'nyzcbnnbffsizshiolbh';
const ROYALTY_BPS = 500;
const AUTHORITY_FLOOR_LAMPORTS = 620_000_000;
const checkOnly = Deno.args.includes('--check');

async function sql<Row>(query: string): Promise<Row[]> {
  const token = Deno.env.get('SUPABASE_ACCESS_TOKEN');
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sql: ${JSON.stringify(body).slice(0, 300)}`);
  return body as Row[];
}

const config = Object.fromEntries((await sql<{ key: string; value: string }>(`select key, value from itera.onchain_config where key in ('collection_avatars', 'treasury', 'authority', 'cluster')`)).map((row) => [row.key, row.value]));
if (config.cluster !== 'devnet' || !config.collection_avatars || !config.treasury) throw new Error('onchain_config is not the devnet one this script is for');

const umi = createUmi(Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com', 'confirmed').use(mplCore());
const secret = Uint8Array.from(JSON.parse(await Deno.readTextFile(`${Deno.env.get('HOME')}/.config/itera-hackathon/devnet-authority.json`)));
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
if (umi.identity.publicKey !== config.authority) throw new Error('the key file is not the authority recorded in onchain_config');

const read = async () => {
  const collection = await fetchCollection(umi, publicKey(config.collection_avatars));
  const royalties = collection.royalties ?? null;
  return {
    name: collection.name,
    update_authority: collection.updateAuthority,
    minted: collection.numMinted,
    royalties: royalties && { basis_points: royalties.basisPoints, creators: royalties.creators.map((creator) => ({ address: creator.address, percentage: creator.percentage })), rule_set: royalties.ruleSet.type },
  };
};

const before = await read();
console.log('before', JSON.stringify(before));
const wanted = { basisPoints: ROYALTY_BPS, creators: [{ address: publicKey(config.treasury), percentage: 100 }], ruleSet: ruleSet('None') };
const matches = before.royalties?.basis_points === ROYALTY_BPS && before.royalties.creators.length === 1 && before.royalties.creators[0].address === config.treasury && before.royalties.creators[0].percentage === 100;

if (!checkOnly && !matches) {
  const balance = Number((await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints);
  if (balance < AUTHORITY_FLOOR_LAMPORTS + 5_000_000) throw new Error('the authority is at its floor: nothing was sent');
  const builder = before.royalties
    ? updateCollectionPlugin(umi, { collection: publicKey(config.collection_avatars), plugin: { type: 'Royalties', ...wanted } })
    : addCollectionPlugin(umi, { collection: publicKey(config.collection_avatars), plugin: { type: 'Royalties', ...wanted } });
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
  console.log('transaction', base58.deserialize(signature)[0]);
}

const after = await read();
console.log('after', JSON.stringify(after));
const live = after.royalties?.basis_points === ROYALTY_BPS && after.royalties.creators[0]?.address === config.treasury;
if (!checkOnly && live) {
  await sql(`insert into itera.onchain_config (key, value) values ('avatar_royalty_bps', '${ROYALTY_BPS}') on conflict (key) do update set value = excluded.value, updated_at = now()`);
  console.log(`onchain_config.avatar_royalty_bps = ${ROYALTY_BPS}`);
}
console.log(live ? 'ROYALTIES LIVE' : 'ROYALTIES NOT SET');
Deno.exit(live || checkOnly ? 0 : 1);
