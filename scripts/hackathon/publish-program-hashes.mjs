#!/usr/bin/env node
// Writes the sha256 of the escrow program's published binary, source and IDL in a memo on Solana devnet,
// signed by Itera's authority key (the program's upgrade authority). The transaction is a record the site
// cannot edit afterwards: /verify links it, and anyone can hash the three files the site serves and compare.
//
//   node scripts/hackathon/publish-program-hashes.mjs          # prints the memo, sends nothing
//   node scripts/hackathon/publish-program-hashes.mjs --send   # sends it (5,000 lamports + 1 lamport)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTransferMessage } from '../../supabase/functions/_shared/solana-tx.ts';
import { loadAuthority, rpc, signAndSend } from './social-e2e.lib.mjs';

/** Itera's treasury on devnet: the one lamport a transfer needs goes from one Itera key to the other. */
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/verify');
const hash = (file) => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
const memo = `itera-escrow so=${hash('itera_bounty_escrow.so')} rs=${hash('bounty-escrow.rs')} idl=${hash('bounty-escrow.idl.json')}`;
console.log(memo);
if (process.argv.includes('--send')) {
  const authority = loadAuthority();
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const signature = await signAndSend(authority, buildTransferMessage({ payer: authority.address, recipient: TREASURY, lamports: 1n, memo, recentBlockhash: blockhash }));
  console.log(JSON.stringify({ signature, signer: authority.address }));
}
