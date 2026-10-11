import { describe, expect, it } from 'vitest';
import { archiveTags, archiveView, archivedMetadata, type ArchiveRow } from './credential-archive';

const ASSET = '9xRfj1YMw7QAeK5znr9PtPDpVqwqwBUrVFmp9mFi6eeY';
const SIGNER = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const SHA = 'a'.repeat(64);
const row = (overrides: Partial<ArchiveRow>): ArchiveRow => ({ kind: 'metadata', ref: '', sha256: SHA, arweave_id: 'x'.repeat(43), bytes: 10, signer: SIGNER, created_at: '2026-10-11T12:00:00Z', ...overrides });

describe('archiveTags', () => {
  it('names the asset, the kind, the cluster and the hash, and nothing that changes between two uploads', () => {
    const tags = archiveTags({ asset: ASSET, kind: 'evidence', ref: 'html-tags', sha256: SHA, cluster: 'devnet' });
    expect(Object.fromEntries(tags.map((tag) => [tag.name, tag.value]))).toEqual({
      'Content-Type': 'application/json',
      'App-Name': 'Itera',
      'Itera-Asset': ASSET,
      'Itera-Kind': 'evidence',
      'Itera-Claim': 'html-tags',
      'Itera-Cluster': 'devnet',
      'Itera-SHA-256': SHA,
    });
    expect(archiveTags({ asset: ASSET, kind: 'image', ref: '', sha256: SHA, cluster: 'devnet' }).some((tag) => tag.name === 'Itera-Claim')).toBe(false);
    expect(archiveTags({ asset: ASSET, kind: 'image', ref: '', sha256: SHA, cluster: 'devnet' })[0].value).toBe('image/svg+xml');
  });
});

describe('archivedMetadata', () => {
  const live = { name: 'Certification', image: 'https://itera.example/fn/credential-meta/1/image.svg', attributes: [{ trait_type: 'Days done', value: 3 }], properties: { category: 'image', files: [{ uri: 'https://itera.example/fn/credential-meta/1/image.svg', type: 'image/svg+xml' }] } };
  const text = archivedMetadata(live, { asset: ASSET, cluster: 'devnet', liveUri: 'https://itera.example/fn/credential-meta/1', imageId: 'IMG', imageSha256: SHA });

  it('points the picture at the archived copy, so the copy depends on nothing of ours', () => {
    const parsed = JSON.parse(text);
    expect(parsed.image).toBe('https://turbo-gateway.com/IMG');
    expect(parsed.properties.files).toEqual([{ uri: 'https://turbo-gateway.com/IMG', type: 'image/svg+xml' }]);
    expect(text).not.toContain('image.svg');
  });

  it('keeps the facts and says where it was copied from', () => {
    const parsed = JSON.parse(text);
    expect(parsed.attributes).toEqual(live.attributes);
    expect(parsed.properties.itera).toEqual({ asset: ASSET, cluster: 'devnet', copied_from: 'https://itera.example/fn/credential-meta/1', image_sha256: SHA });
  });

  it('gives the same bytes for the same facts', () => {
    expect(archivedMetadata(live, { asset: ASSET, cluster: 'devnet', liveUri: 'https://itera.example/fn/credential-meta/1', imageId: 'IMG', imageSha256: SHA })).toBe(text);
  });
});

describe('archiveView', () => {
  it('answers the newest metadata and picture as current, every evidence copy, and both gateways', () => {
    const view = archiveView(
      ASSET,
      SIGNER,
      [
        row({ created_at: '2026-10-11T10:00:00Z', arweave_id: 'o'.repeat(43) }),
        row({ created_at: '2026-10-11T12:00:00Z', arweave_id: 'n'.repeat(43), sha256: 'b'.repeat(64) }),
        row({ kind: 'image', arweave_id: 'i'.repeat(43) }),
        row({ kind: 'evidence', ref: 'html-tags', arweave_id: 'e'.repeat(43) }),
      ],
      true,
    );
    expect(view.current.metadata?.arweave_id).toBe('n'.repeat(43));
    expect(view.current.image?.urls).toEqual([`https://turbo-gateway.com/${'i'.repeat(43)}`, `https://arweave.net/${'i'.repeat(43)}`]);
    expect(view.evidence.map((item) => item.claim)).toEqual(['html-tags']);
    expect(view.history).toHaveLength(3);
    expect(view.find.query).toContain(ASSET);
    expect(view.signer).toBe(SIGNER);
  });

  it('answers an asset with no copy yet', () => {
    const view = archiveView(ASSET, SIGNER, [], false);
    expect(view.current).toEqual({ metadata: null, image: null });
    expect(view.uploads_enabled).toBe(false);
  });
});
