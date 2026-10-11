import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('__iteraBoard')) ?? '';

function requestsFor(pathname: string): string[] {
  const urls: string[] = [];
  const fetchStub = (u: string) => {
    urls.push(u);
    return Promise.resolve(new Response('{}'));
  };
  const win: Record<string, unknown> = {};
  const code = script.replace('%VITE_SUPABASE_URL%', 'https://x.supabase.co');
  new Function('location', 'fetch', 'localStorage', 'navigator', 'window', code)({ pathname }, fetchStub, { getItem: () => 'en' }, { languages: ['en'] }, win);
  return urls;
}

describe('index.html preload', () => {
  it('finds the inline preload script', () => {
    expect(script).not.toBe('');
  });

  it('asks for a bounty by its slug', () => {
    expect(requestsFor('/bounties/write-the-faq')).toEqual([
      'https://x.supabase.co/functions/v1/bounty-board/write-the-faq?lang=en',
      'https://x.supabase.co/functions/v1/bounty-board/write-the-faq?lang=en&read=record',
    ]);
  });

  it('asks for the board on /bounties', () => {
    expect(requestsFor('/bounties')).toEqual(['https://x.supabase.co/functions/v1/bounty-board?lang=en']);
  });

  it.each(['/bounties/post', '/bounties/mine', '/bounties/manage', '/bounties/post/'])('does not ask for %s as if it were a bounty', (path) => {
    expect(requestsFor(path)).toEqual([]);
  });
});
