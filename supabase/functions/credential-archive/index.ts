import { ArweaveUploadError, FREE_UPLOAD_BYTES, buildDataItem, uploadDataItem } from '../_shared/arweave.ts';
import { isSolanaAddress } from '../_shared/address.ts';
import { archiveTags, archiveView, archivedMetadata, type ArchiveKind, type ArchiveRow } from '../_shared/credential-archive.ts';
import { loadCredential } from '../_shared/credential-store.ts';
import { CLUSTER, artInput, buildMetadata } from '../_shared/credential.ts';
import { renderArt } from '../_shared/art.ts';
import { sha256Hex } from '../_shared/claims.ts';
import { loadConfig, serviceClient, type IteraClient } from '../_shared/db.ts';
import { corsHeaders, functionsBase, json, pathAfter } from '../_shared/http.ts';
import { callerAddress, takeRate, tooMany, type RateLimit } from '../_shared/ratelimit.ts';
import { base58Decode } from '../_shared/solana-tx.ts';
import { authorityAddress, authoritySigner, signMessage } from '../_shared/treasury.ts';

/**
 * Permanent copies of a credential on Arweave: its picture, its metadata and
 * the evidence documents behind its claims, each signed by the mint authority.
 *
 *   GET  /credential-archive/<asset>   the copies that exist
 *   POST /credential-archive/<asset>   uploads what is new, then the same answer
 *
 * Public: a copy holds nothing the credential's own page does not already
 * show. An upload happens once per distinct content of an asset, whoever asks.
 */
const READ_RATE: RateLimit = { limit: 120, windowMs: 60_000 };
const WRITE_RATE: RateLimit = { limit: 12, windowMs: 60_000 };
const COLUMNS = 'kind,ref,sha256,arweave_id,bytes,signer,created_at';
const MAX_EVIDENCE = 40;
const encoder = new TextEncoder();

async function loadRows(db: IteraClient, asset: string): Promise<ArchiveRow[]> {
  const { data, error } = await db.from('credential_archives').select(COLUMNS).eq('asset_address', asset).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(`credential_archives: ${error.message}`);
  return (data ?? []) as ArchiveRow[];
}

interface Copy {
  kind: ArchiveKind;
  ref: string;
  sha256: string;
  data: Uint8Array;
}

/** Uploads `copy` unless this exact content of this asset is already archived. Answers its Arweave id. */
async function archive(db: IteraClient, asset: string, known: ArchiveRow[], copy: Copy): Promise<string> {
  const existing = known.find((row) => row.kind === copy.kind && row.ref === copy.ref && row.sha256 === copy.sha256);
  if (existing) return existing.arweave_id;
  if (copy.data.length > FREE_UPLOAD_BYTES) throw new ArweaveUploadError(`${copy.kind} is ${copy.data.length} bytes, over the bundler's free size`);
  const signer = await authoritySigner();
  const publicKey = base58Decode(signer.address, 32);
  if (!publicKey) throw new Error('authority address is not a key');
  const item = await buildDataItem({
    publicKey,
    sign: (message) => signMessage(signer, message),
    tags: archiveTags({ asset, kind: copy.kind, ref: copy.ref, sha256: copy.sha256, cluster: CLUSTER }),
    data: copy.data,
  });
  const id = await uploadDataItem(item);
  const row = { asset_address: asset, kind: copy.kind, ref: copy.ref, sha256: copy.sha256, arweave_id: id, bytes: copy.data.length, signer: signer.address };
  const { error } = await db.from('credential_archives').upsert(row, { onConflict: 'asset_address,kind,ref,sha256', ignoreDuplicates: true });
  if (error) throw new Error(`credential_archives insert: ${error.message}`);
  known.push({ ...row, created_at: new Date().toISOString() });
  return id;
}

/** Brings the copies of one asset up to date. Answers how many could not be uploaded. */
async function bringUpToDate(db: IteraClient, asset: string, rowId: string, known: ArchiveRow[]): Promise<number> {
  const credential = await loadCredential(db, rowId);
  if (!credential) return 0;
  const { row, catalog, passport } = credential;
  let failed = 0;
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof ArweaveUploadError)) throw error;
      failed += 1;
      console.error('credential-archive upload failed', asset, error.message);
    }
  };

  await attempt(async () => {
    const image = encoder.encode(renderArt(artInput(row, catalog, 'en', passport)));
    const imageSha256 = await sha256Hex(new TextDecoder().decode(image));
    const imageId = await archive(db, asset, known, { kind: 'image', ref: '', sha256: imageSha256, data: image });
    const live = buildMetadata(row, catalog, 'en', functionsBase(), passport);
    const text = archivedMetadata(live, { asset, cluster: CLUSTER, liveUri: `${functionsBase()}/credential-meta/${row.id}`, imageId, imageSha256 });
    await archive(db, asset, known, { kind: 'metadata', ref: '', sha256: await sha256Hex(text), data: encoder.encode(text) });
  });

  const { data, error } = await db.from('claim_proofs').select('claim_id,evidence,evidence_hash').eq('user_achievement_id', row.id).limit(MAX_EVIDENCE);
  if (error) throw new Error(`claim_proofs: ${error.message}`);
  const proofs = (data ?? []) as Array<{ claim_id: string; evidence: string; evidence_hash: string }>;
  await Promise.all(
    proofs.map((proof) =>
      attempt(async () => {
        // Only a document whose bytes still hash to what was written on chain is worth keeping forever.
        if ((await sha256Hex(proof.evidence)) !== proof.evidence_hash) return;
        await archive(db, asset, known, { kind: 'evidence', ref: proof.claim_id, sha256: proof.evidence_hash, data: encoder.encode(proof.evidence) });
      }),
    ),
  );
  return failed;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request, 'public');
  const headers = { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, headers);
  try {
    const db = serviceClient();
    const writing = request.method === 'POST';
    const verdict = await takeRate(db, writing ? 'credential-archive-write' : 'credential-archive', callerAddress(request), writing ? WRITE_RATE : READ_RATE);
    if (!verdict.allowed) return tooMany(verdict, headers);
    const [asset, ...rest] = pathAfter(request, 'credential-archive');
    if (!asset || rest.length > 0 || !isSolanaAddress(asset)) return json({ error: 'invalid_address' }, 400, headers);

    // A certification and its day stamps share one asset: the certification row is the one that describes it.
    const { data: rows, error } = await db.from('user_achievements').select('id,achievement_key').eq('asset_address', asset).eq('mint_status', 'minted').limit(40);
    if (error) throw new Error(`user_achievements: ${error.message}`);
    const owners = (rows ?? []) as Array<{ id: string; achievement_key: string }>;
    const minted = owners.find((row) => row.achievement_key === 'trail_pass') ?? owners[0];
    if (!minted) return json({ error: 'not_found' }, 404, headers);

    const uploading = (await loadConfig(db)).credential_archive === 'on';
    const known = await loadRows(db, asset);
    let failed = 0;
    if (writing && uploading) failed = await bringUpToDate(db, asset, minted.id, known);
    return json({ ...archiveView(asset, authorityAddress(), known, uploading), failed_uploads: failed }, 200, writing ? headers : { ...headers, 'Cache-Control': 'public, max-age=30' });
  } catch (error) {
    console.error('credential-archive failed', error);
    return json({ error: 'internal_error' }, 500, headers);
  }
});
