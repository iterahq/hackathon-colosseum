#!/usr/bin/env node
// End-to-end check of the social on-chain features on Solana devnet, against the hackathon
// project: the earned-or-bought laurel, live-class podium medals, teacher endorsements and the
// Circuito counter. Throwaway wallets play an instructor and the learners.
//
//   node scripts/hackathon/social-e2e.mjs [--only laurel,podium,endorse,circuit]
//
// Environment (source ~/.config/itera-hackathon/supabase.env): HACKATHON_DB_PASSWORD,
// SUPABASE_ACCESS_TOKEN (or HACKATHON_ANON_KEY), HACKATHON_AUTHORITY_KEYFILE (default
// ~/.config/itera-hackathon/devnet-authority.json).
//
// A full pass spends less than 0.06 SOL of the authority and leaves its throwaway users behind.
// Never touches the owner's wallet account or the demo e-mail user.
import { anonKey, balance, loadAuthority, psql, sol, summary } from './social-e2e.lib.mjs';
import { laurel } from './social-e2e.laurel.mjs';

const FEATURES = { laurel };

async function main() {
  const flag = process.argv.indexOf('--only');
  const only = flag > 0 ? process.argv[flag + 1].split(',') : Object.keys(FEATURES);
  const apikey = await anonKey();
  const authority = loadAuthority();
  const treasury = psql(`select value from itera.onchain_config where key = 'treasury';`);
  const before = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`before: authority ${authority.address} ${sol(before.authority)} SOL · treasury ${treasury} ${sol(before.treasury)} SOL`);

  const context = { apikey, authority, treasury };
  for (const name of only) {
    if (!FEATURES[name]) throw new Error(`unknown feature ${name}`);
    console.log(`\n== ${name} ==`);
    await FEATURES[name](context);
  }

  const after = { authority: await balance(authority.address), treasury: await balance(treasury) };
  console.log(`\nauthority: ${sol(before.authority)} -> ${sol(after.authority)} SOL (${sol(after.authority - before.authority)})`);
  console.log(`treasury:  ${sol(before.treasury)} -> ${sol(after.treasury)} SOL (${sol(after.treasury - before.treasury)})`);
  const { total, failed } = summary();
  console.log(`\n${total - failed.length}/${total} checks passed`);
  if (failed.length > 0) {
    console.log(failed.map((name) => `  FAILED: ${name}`).join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
