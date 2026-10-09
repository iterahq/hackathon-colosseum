import { describe, expect, it } from 'vitest';
import { changeLine, shortSignature } from '@/utils/purchaseProof';

const proof = (over = {}) => ({ signature: 's', imageUrl: null, written: [], lives: null, ...over });

describe('purchaseProof', () => {
  it('shortens a long signature', () => {
    expect(shortSignature('abcdefgh0123456789uvwxyz')).toBe('abcdefgh…uvwxyz');
    expect(shortSignature('abc')).toBe('abc');
  });
  it('life: lives from written, else from the lives block', () => {
    expect(changeLine('life', 'Refill', proof({ written: [{ attribute: 'lives', value: '5' }], lives: { current: 5, max: 5 } }))).toEqual({ key: 'purchase.proof.lives', params: { current: 5, max: 5 } });
    expect(changeLine('life', 'Refill', proof({ lives: { current: 5, max: 5 } }))?.params).toEqual({ current: 5, max: 5 });
    expect(changeLine('life', 'Refill', null)).toBeNull();
  });
  it('cosmetic: written attribute wins, outfit and ink have their own fallback', () => {
    expect(changeLine('ink', 'Emerald', proof({ written: [{ attribute: 'ink', value: 'emerald' }] }))?.key).toBe('purchase.proof.written');
    expect(changeLine('outfit', 'Crown', proof())?.key).toBe('purchase.proof.outfit');
    expect(changeLine('frame', 'Gold', proof())?.key).toBe('purchase.proof.cosmetic');
  });
});
