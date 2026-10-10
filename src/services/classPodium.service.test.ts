import { describe, expect, it } from 'vitest';
import { toPodiumChain, toPodiumRecord } from './classPodium.service';

describe('class-podium normalisers', () => {
  it('reads the instructor answer', () => {
    const record = toPodiumRecord({
      session_id: 's1',
      already_recorded: false,
      places: [
        { position: 1, key: 'podium_1', title: '1º lugar na aula ao vivo', user_id: 'u1', name: 'Ana', correct: 3, answered: 3, wallet: 'W1', mint_status: 'minted', asset_address: 'A1', explorer_url: 'https://explorer/a1', image_url: 'https://img/1' },
        { position: 3, key: 'podium_3', title: '3º', user_id: 'u3', name: null, correct: 1, answered: 3, wallet: null, mint_status: 'unclaimed', asset_address: null, explorer_url: null, image_url: null },
        { position: 9, key: 'x' },
      ],
    });
    expect(record.alreadyRecorded).toBe(false);
    expect(record.places).toHaveLength(2);
    expect(record.places[0]).toMatchObject({ position: 1, name: 'Ana', mintStatus: 'minted', explorerUrl: 'https://explorer/a1' });
    expect(record.places[1]).toMatchObject({ position: 3, name: null, wallet: null, mintStatus: 'unclaimed' });
  });

  it('reads the participant view and tolerates a malformed answer', () => {
    expect(toPodiumChain({ places: [{ position: 1, user_id: 'u1', mint_status: 'minted', explorer_url: 'https://e/1' }, { position: 2, user_id: 'u2', mint_status: 'unclaimed' }, { position: 3 }] })).toEqual([
      { position: 1, userId: 'u1', minted: true, explorerUrl: 'https://e/1' },
      { position: 2, userId: 'u2', minted: false, explorerUrl: null },
    ]);
    expect(toPodiumChain(null)).toEqual([]);
    expect(toPodiumRecord(undefined).places).toEqual([]);
  });
});
