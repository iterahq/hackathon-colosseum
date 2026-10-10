import { describe, expect, it } from 'vitest';
import { lamportsToSol, paidCopy, shortSignature, showTechnicalDetail } from '@/utils/purchaseProof';

const proof = (over = {}) => ({ signature: 's', imageUrl: null, written: [], lives: null, ...over });
const FRIENDLY = new Set(['already_owned', 'payment_mismatch', 'broadcast_failed', 'rpc_unavailable']);

describe('purchaseProof', () => {
  it('shortens a long signature', () => {
    expect(shortSignature('abcdefgh0123456789uvwxyz')).toBe('abcdefgh…uvwxyz');
    expect(shortSignature('abc')).toBe('abc');
  });

  it('life: count from written, else from the lives block; note only when written says so', () => {
    expect(paidCopy('life', { itemTitle: 'Refill' }, proof({ written: [{ attribute: 'lives', value: '5' }], lives: { current: 5, max: 5 } }))).toEqual({
      body: { key: 'purchase.paid.life', params: { current: 5, max: 5 } },
      note: { key: 'purchase.note.life', params: {} },
    });
    const noWrite = paidCopy('life', { itemTitle: 'Refill' }, proof({ lives: { current: 4, max: 5 } }));
    expect(noWrite.body.params).toEqual({ current: 4, max: 5 });
    expect(noWrite.note).toBeNull();
    expect(paidCopy('life', { itemTitle: 'Refill' }, null).body.key).toBe('purchase.paid.lifeBare');
  });

  it('outfit: bought, not equipped, never "written"', () => {
    const copy = paidCopy('outfit', { itemTitle: 'Glasses' }, proof({ written: [{ attribute: 'outfit', value: 'glasses' }] }));
    expect(copy.body).toEqual({ key: 'purchase.paid.outfit', params: { name: 'Glasses' } });
    expect(copy.note).toBeNull();
  });

  it('ink and frame: applied to the named certification, note only when written', () => {
    const ink = paidCopy('ink', { itemTitle: 'Emerald ink', targetTitle: 'HTML' }, proof({ written: [{ attribute: 'ink', value: 'emerald' }] }));
    expect(ink.body).toEqual({ key: 'purchase.paid.cosmetic', params: { name: 'Emerald ink', trail: 'HTML' } });
    expect(ink.note?.key).toBe('purchase.note.cosmetic');
    const frame = paidCopy('frame', { itemTitle: 'Gold frame', targetTitle: 'HTML' }, proof());
    expect(frame.body.key).toBe('purchase.paid.cosmetic');
    expect(frame.note).toBeNull();
    expect(paidCopy('ink', { itemTitle: 'Emerald ink' }, proof()).body.key).toBe('purchase.paid.cosmeticBare');
  });

  it('technical details only for unexpected failures', () => {
    expect(showTechnicalDetail('insufficient', null, FRIENDLY)).toBe(false);
    expect(showTechnicalDetail('failed', 'already_owned', FRIENDLY)).toBe(false);
    expect(showTechnicalDetail('failed', null, FRIENDLY)).toBe(true);
    expect(showTechnicalDetail('failed', 'internal_error', FRIENDLY)).toBe(true);
    expect(showTechnicalDetail('failed', 'payment_mismatch', FRIENDLY)).toBe(true);
    expect(showTechnicalDetail('failed', 'broadcast_failed', FRIENDLY)).toBe(true);
  });

  it('formats lamports as SOL', () => {
    expect(lamportsToSol(1_445_880)).toBe('0.00145');
    expect(lamportsToSol(50_000_000)).toBe('0.050');
  });
});
