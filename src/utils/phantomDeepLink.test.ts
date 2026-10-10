import { describe, expect, it } from 'vitest';
import { phantomBrowseUrl } from './phantomDeepLink';

describe('phantomBrowseUrl', () => {
  it('builds the universal link that reopens the page inside Phantom', () => {
    expect(phantomBrowseUrl('https://app.example/login?next=/shop', 'https://app.example')).toBe(
      'https://phantom.app/ul/browse/https%3A%2F%2Fapp.example%2Flogin%3Fnext%3D%2Fshop?ref=https%3A%2F%2Fapp.example',
    );
  });
});
