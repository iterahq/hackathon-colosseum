import type { ArweaveTag } from './arweave.ts';
import { ARWEAVE_GATEWAYS } from './arweave.ts';

export type ArchiveKind = 'metadata' | 'image' | 'evidence';

export interface ArchiveRow {
  kind: ArchiveKind;
  ref: string;
  sha256: string;
  arweave_id: string;
  bytes: number;
  signer: string;
  created_at: string;
}

export const ARCHIVE_APP = 'Itera';
const CONTENT_TYPES: Record<ArchiveKind, string> = { metadata: 'application/json', image: 'image/svg+xml', evidence: 'application/json' };

/**
 * The tags of a copy. They carry no time and no counter: the same content of
 * the same asset always gets the same tags, so the same data item id.
 */
export function archiveTags(input: { asset: string; kind: ArchiveKind; ref: string; sha256: string; cluster: string }): ArweaveTag[] {
  return [
    { name: 'Content-Type', value: CONTENT_TYPES[input.kind] },
    { name: 'App-Name', value: ARCHIVE_APP },
    { name: 'Itera-Asset', value: input.asset },
    { name: 'Itera-Kind', value: input.kind },
    ...(input.ref ? [{ name: 'Itera-Claim', value: input.ref }] : []),
    { name: 'Itera-Cluster', value: input.cluster },
    { name: 'Itera-SHA-256', value: input.sha256 },
  ];
}

interface Metadata {
  image: string;
  properties: { category: string; files: Array<{ uri: string; type: string }> };
  [key: string]: unknown;
}

/**
 * The metadata as it is archived: the picture is the archived one (so the copy
 * needs nothing of ours), and it says which asset and which live address it
 * was copied from. Keys keep one order: the same facts give the same bytes.
 */
export function archivedMetadata(metadata: Metadata, input: { asset: string; cluster: string; liveUri: string; imageId: string; imageSha256: string }): string {
  const image = `${ARWEAVE_GATEWAYS[1]}/${input.imageId}`;
  return JSON.stringify({
    ...metadata,
    image,
    properties: {
      ...metadata.properties,
      files: [{ uri: image, type: 'image/svg+xml' }],
      itera: { asset: input.asset, cluster: input.cluster, copied_from: input.liveUri, image_sha256: input.imageSha256 },
    },
  });
}

/** The public answer: every copy of an asset, newest first, and how to find them without Itera. */
export function archiveView(asset: string, signer: string, rows: readonly ArchiveRow[], uploading: boolean) {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const item = (row: ArchiveRow) => ({
    kind: row.kind,
    claim: row.ref || null,
    sha256: row.sha256,
    arweave_id: row.arweave_id,
    bytes: row.bytes,
    archived_at: row.created_at,
    signer: row.signer,
    urls: ARWEAVE_GATEWAYS.map((gateway) => `${gateway}/${row.arweave_id}`),
  });
  const latest = (kind: ArchiveKind) => sorted.find((row) => row.kind === kind);
  const metadata = latest('metadata');
  const image = latest('image');
  return {
    asset,
    signer,
    uploads_enabled: uploading,
    current: { metadata: metadata ? item(metadata) : null, image: image ? item(image) : null },
    evidence: sorted.filter((row) => row.kind === 'evidence').map(item),
    history: sorted.filter((row) => row.kind !== 'evidence').map(item),
    find: {
      endpoint: `${ARWEAVE_GATEWAYS[1]}/graphql`,
      query: `{ transactions(tags: [{ name: "App-Name", values: ["${ARCHIVE_APP}"] }, { name: "Itera-Asset", values: ["${asset}"] }]) { edges { node { id owner { address } tags { name value } } } } }`,
    },
  };
}
