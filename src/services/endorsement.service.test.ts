import { describe, expect, it } from 'vitest';
import { toEndorseResult, toPublicEndorsements, toStudentCertifications } from './endorsement.service';

describe('endorse normalisers', () => {
  it('reads the instructor list and drops rows without an asset', () => {
    const list = toStudentCertifications({
      wallet: 'W',
      certifications: [
        { user_achievement_id: 'r1', learner_name: 'Ana', trail: 'Semana 1 · HTML', days_done: 2, total_days: 5, tier: 'bronze', asset_address: 'A1', image_url: 'https://img', endorsements: 1, endorsed_by_me: true },
        { user_achievement_id: 'r2', asset_address: null },
      ],
    });
    expect(list.wallet).toBe('W');
    expect(list.certifications).toEqual([{ id: 'r1', learnerName: 'Ana', trail: 'Semana 1 · HTML', daysDone: 2, totalDays: 5, tier: 'bronze', assetAddress: 'A1', imageUrl: 'https://img', endorsements: 1, endorsedByMe: true }]);
    expect(toStudentCertifications(null)).toEqual({ wallet: null, certifications: [] });
  });

  it('reads public endorsements as wallets and links only', () => {
    expect(toPublicEndorsements([{ wallet: 'W1', at: '2026-10-10T03:00:00.000Z', tx_signature: 'S', explorer_url: 'https://e/tx', name: 'never shown' }, { at: 'x' }])).toEqual([{ wallet: 'W1', at: '2026-10-10T03:00:00.000Z', explorerUrl: 'https://e/tx' }]);
    expect(toPublicEndorsements(undefined)).toEqual([]);
  });

  it('reads the result of an endorsement', () => {
    expect(toEndorseResult({ already_endorsed: false, asset: 'A1', endorsement: { explorer_url: 'https://e/tx' }, endorsements: [{ wallet: 'W1', at: 't' }] })).toEqual({ alreadyEndorsed: false, assetAddress: 'A1', explorerUrl: 'https://e/tx', endorsements: [{ wallet: 'W1', at: 't', explorerUrl: null }] });
  });
});
