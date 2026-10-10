import { describe, expect, it } from 'vitest';
import { inSeason, seasonData, seasonView, type SeasonData } from './seasons.ts';

const halloween: SeasonData = { key: 'halloween', from: '10-01', to: '10-31', label: { pt: 'Halloween', en: 'Halloween' } };
const natal: SeasonData = { key: 'natal', from: '12-01', to: '12-31', label: { pt: 'Natal', en: 'Christmas' } };
const verao: SeasonData = { key: 'verao', from: '12-21', to: '03-20', label: { pt: 'Verão', en: 'Summer' } };
const at = (iso: string) => new Date(iso);

describe('seasonData', () => {
  it('reads a stored season and falls back on the label', () => {
    expect(seasonData({ season: { key: 'x', from: '01-01', to: '01-02' } })).toEqual({ key: 'x', from: '01-01', to: '01-02', label: { pt: 'x', en: 'x' } });
    expect(seasonData({ season: { key: 'natal', from: '12-01', to: '12-31', label: { pt: 'Natal', en: 'Christmas' } } })).toEqual(natal);
  });
  it('rejects no season and malformed ones', () => {
    expect(seasonData({})).toBeNull();
    expect(seasonData(null)).toBeNull();
    expect(seasonData({ season: 'halloween' })).toBeNull();
    expect(seasonData({ season: { key: 'x', from: '13-01', to: '01-02' } })).toBeNull();
    expect(seasonData({ season: { key: 'x', from: '1-1', to: '01-02' } })).toBeNull();
  });
});

describe('inSeason', () => {
  it('an avatar with no season is always buyable', () => expect(inSeason(null, at('2026-06-15T12:00:00Z'))).toBe(true));
  it('halloween covers the whole of October, both edges', () => {
    expect(inSeason(halloween, at('2026-10-01T00:00:00Z'))).toBe(true);
    expect(inSeason(halloween, at('2026-10-31T23:59:59Z'))).toBe(true);
    expect(inSeason(halloween, at('2026-09-30T23:59:59Z'))).toBe(false);
    expect(inSeason(halloween, at('2026-11-01T00:00:00Z'))).toBe(false);
  });
  it('natal is December only', () => {
    expect(inSeason(natal, at('2026-12-01T00:00:00Z'))).toBe(true);
    expect(inSeason(natal, at('2026-12-31T23:59:59Z'))).toBe(true);
    expect(inSeason(natal, at('2027-01-01T00:00:00Z'))).toBe(false);
  });
  it('verao wraps the new year: 21 December to 20 March', () => {
    expect(inSeason(verao, at('2026-12-20T23:59:59Z'))).toBe(false);
    expect(inSeason(verao, at('2026-12-21T00:00:00Z'))).toBe(true);
    expect(inSeason(verao, at('2027-01-15T10:00:00Z'))).toBe(true);
    expect(inSeason(verao, at('2027-03-20T23:59:59Z'))).toBe(true);
    expect(inSeason(verao, at('2027-03-21T00:00:00Z'))).toBe(false);
    expect(inSeason(verao, at('2026-10-10T12:00:00Z'))).toBe(false);
  });
});

describe('seasonView', () => {
  it('no season is null', () => expect(seasonView(null, 'pt', at('2026-10-10T00:00:00Z'))).toBeNull());
  it('inside the window: the running window, available', () => {
    expect(seasonView(halloween, 'en', at('2026-10-10T08:00:00Z'))).toEqual({
      key: 'halloween',
      label: 'Halloween',
      starts_at: '2026-10-01T00:00:00.000Z',
      ends_at: '2026-10-31T23:59:59.999Z',
      available: true,
    });
  });
  it('outside: the next window, not available, in the requested language', () => {
    expect(seasonView(natal, 'en', at('2026-10-10T08:00:00Z'))).toEqual({
      key: 'natal',
      label: 'Christmas',
      starts_at: '2026-12-01T00:00:00.000Z',
      ends_at: '2026-12-31T23:59:59.999Z',
      available: false,
    });
    expect(seasonView(halloween, 'pt', at('2026-11-02T00:00:00Z'))).toMatchObject({ starts_at: '2027-10-01T00:00:00.000Z', available: false });
  });
  it('the wrapping window reports its own year-crossing end', () => {
    expect(seasonView(verao, 'pt', at('2027-02-01T00:00:00Z'))).toMatchObject({ starts_at: '2026-12-21T00:00:00.000Z', ends_at: '2027-03-20T23:59:59.999Z', available: true });
    expect(seasonView(verao, 'pt', at('2027-05-01T00:00:00Z'))).toMatchObject({ starts_at: '2027-12-21T00:00:00.000Z', available: false });
  });
});
