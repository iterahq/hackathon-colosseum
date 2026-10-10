import { describe, expect, it } from 'vitest';
import * as slots from './gift';
import {
  ACTION_VERSION,
  SOLANA_DEVNET_CHAIN_ID,
  actionError,
  actionHeaders,
  cleanName,
  dialToUrl,
  findPayment,
  giftActionCompleted,
  giftActionGet,
  giftActionPost,
  giftActionUrl,
  giftPhase,
  isAbandoned,
  memoCarries,
  publicLabel,
  shortWallet,
  solAmount,
} from './gift';

const WALLET = 'BNCkAhpDgLhzncCYNTnENCzRZDvo2iLPdUSMm89qBoqH';
const INTENT = '8ba48490-1111-4222-8333-444455556666';
const BASE = 'https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1';
const T0 = new Date('2026-10-10T12:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('action headers', () => {
  it('carry what the Actions specification requires on every answer', () => {
    const headers = actionHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    for (const method of ['GET', 'POST', 'OPTIONS']) expect(headers['Access-Control-Allow-Methods']).toContain(method);
    for (const header of ['Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding', 'X-Action-Version', 'X-Blockchain-Ids']) {
      expect(headers['Access-Control-Allow-Headers']).toContain(header);
    }
    expect(headers['Access-Control-Expose-Headers']).toBe('X-Action-Version, X-Blockchain-Ids');
    expect(headers['X-Action-Version']).toBe(ACTION_VERSION);
    expect(headers['X-Blockchain-Ids']).toBe(SOLANA_DEVNET_CHAIN_ID);
    expect(SOLANA_DEVNET_CHAIN_ID).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  });
});

describe('names', () => {
  it('shortens a wallet and prefers a nickname', () => {
    expect(shortWallet(WALLET)).toBe('BNCk…BoqH');
    expect(publicLabel('Duda', WALLET)).toBe('Duda');
    expect(publicLabel(null, WALLET)).toBe('BNCk…BoqH');
  });

  it('cleans a nickname for a public title', () => {
    expect(cleanName('  Duda \n Lima ')).toBe('Duda Lima');
    expect(cleanName('a\u0000b\u0085c')).toBe('abc');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName('x'.repeat(60))).toHaveLength(24);
  });
});

describe('finding a payment by its memo', () => {
  it('reads the node memo format', () => {
    expect(memoCarries(`[36] ${INTENT}`, INTENT)).toBe(true);
    expect(memoCarries(`[5] hello; [36] ${INTENT}`, INTENT)).toBe(true);
    expect(memoCarries(`[37] ${INTENT}x`, INTENT)).toBe(false);
    expect(memoCarries(`[40] gift ${INTENT}`, INTENT)).toBe(false);
    expect(memoCarries(null, INTENT)).toBe(false);
  });

  it('takes the successful transaction and ignores failed or foreign ones', () => {
    const recent = [
      { signature: 'other', memo: '[36] 00000000-0000-4000-8000-000000000000', err: null },
      { signature: 'failed', memo: `[36] ${INTENT}`, err: { InstructionError: [0, 'Custom'] } },
      { signature: 'paid', memo: `[36] ${INTENT}`, err: null },
    ];
    expect(findPayment(recent, INTENT)).toBe('paid');
    expect(findPayment(recent.slice(0, 2), INTENT)).toBeNull();
    expect(findPayment([], INTENT)).toBeNull();
  });
});

describe('gift timing', () => {
  const gift = (status: string) => ({ status, expires_at: T0.toISOString() });

  it('accepts a payment up to a day after the blockhash died, then never', () => {
    expect(giftPhase(gift('pending'), at(-10))).toBe('payable');
    expect(giftPhase(gift('expired'), at(3600))).toBe('payable');
    expect(giftPhase(gift('pending'), at(24 * 3600 + 1))).toBe('expired');
    expect(giftPhase(gift('paid'), at(999_999))).toBe('settled');
    expect(giftPhase(gift('delivered'), at(999_999))).toBe('settled');
  });

  it('gives up on an unpaid gift only well past its blockhash', () => {
    expect(isAbandoned(gift('pending'), at(60))).toBe(false);
    expect(isAbandoned(gift('pending'), at(121))).toBe(true);
    expect(isAbandoned(gift('paid'), at(999))).toBe(false);
  });
});

describe('links', () => {
  it('builds the action url and the dial.to link around it', () => {
    const url = giftActionUrl(BASE, WALLET);
    expect(url).toBe(`${BASE}/action-gift?to=${WALLET}`);
    expect(giftActionUrl(BASE, WALLET, 'pt')).toBe(`${url}&lang=pt`);
    const dial = new URL(dialToUrl(url));
    expect(dial.origin).toBe('https://dial.to');
    expect(dial.searchParams.get('action')).toBe(`solana-action:${url}`);
    expect(dial.searchParams.get('cluster')).toBe('devnet');
  });

  it('prints the exact SOL amount', () => {
    expect(solAmount(550_000)).toBe('0.00055 SOL');
    expect(solAmount(1_000_000_000n)).toBe('1 SOL');
    expect(solAmount(2_750_000)).toBe('0.00275 SOL');
  });
});

describe('action payloads', () => {
  const input = { lang: 'en' as const, who: 'Duda', icon: `${BASE}/credential-meta/companion/x/image.svg`, price: '0.00055 SOL', href: `${BASE}/action-gift?to=${WALLET}&lang=en` };

  it('GET is an ActionGetResponse with one transaction action', () => {
    const body = giftActionGet(input);
    expect(body).toEqual({
      type: 'action',
      icon: input.icon,
      title: "Give Duda's Tera a life",
      description: expect.stringContaining('0.00055 SOL'),
      label: 'Gift a life',
      links: { actions: [{ type: 'transaction', label: 'Gift a life · 0.00055 SOL', href: input.href }] },
    });
    expect(body.icon).toMatch(/^https:\/\//);
    expect(giftActionGet({ ...input, lang: 'pt' }).title).toBe('Dê uma vida pro Tera de Duda');
  });

  it('GET is disabled, with the reason, when the recipient cannot receive', () => {
    const body = giftActionGet({ ...input, blocked: 'gift_limit' });
    expect(body.disabled).toBe(true);
    expect(body.error).toEqual(actionError('gift_limit', 'en'));
    expect(body.error?.message.length).toBeGreaterThan(10);
  });

  it('POST is an ActionPostResponse chained to the callback', () => {
    const callbackHref = `${BASE}/action-gift/confirm?gift=${INTENT}&lang=en`;
    expect(giftActionPost({ lang: 'en', who: 'Duda', transactionBase64: 'AQAB', callbackHref })).toEqual({
      type: 'transaction',
      transaction: 'AQAB',
      message: "A life for Duda's Tera",
      links: { next: { type: 'post', href: callbackHref } },
    });
  });

  it('the callback answers a CompletedAction', () => {
    expect(giftActionCompleted({ lang: 'en', who: 'Duda', icon: input.icon, lives: 6, maxLives: 5 })).toEqual({
      type: 'completed',
      icon: input.icon,
      title: 'Life delivered ✓',
      description: "Duda's Tera got a life (6/5), written to the on-chain companion.",
      label: 'Delivered',
    });
  });

  it('every error has a message in both languages', () => {
    expect(actionError('self_gift', 'pt').message).toMatch(/você mesmo/);
    expect(actionError('self_gift', 'en').message).toMatch(/yourself/);
  });
});

describe('gift Action slots (decided before any node call)', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const inMs = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const facts = (patch: Partial<slots.ActionSlotFacts> = {}): slots.ActionSlotFacts => ({ own: null, openOthers: 0, unpaidToday: 0, now, ...patch });
  const own = (patch: Partial<NonNullable<slots.ActionSlotFacts['own']>> = {}) => ({ status: 'pending', expires_at: inMs(60_000), blockhash: 'HASH', ...patch });

  it('opens a new intent while the recipient has a free slot', () => {
    expect(slots.actionSlot(facts())).toBe('open');
    expect(slots.actionSlot(facts({ openOthers: slots.MAX_OPEN_ACTION_GIFTS - 1, unpaidToday: 30 }))).toBe('open');
  });

  it('refuses a new payer when 10 intents are open for the recipient, or 60 unpaid ones were opened today', () => {
    expect(slots.MAX_OPEN_ACTION_GIFTS).toBe(10);
    expect(slots.actionSlot(facts({ openOthers: 10 }))).toBe('too_many');
    expect(slots.actionSlot(facts({ openOthers: 250 }))).toBe('too_many');
    expect(slots.actionSlot(facts({ unpaidToday: slots.MAX_UNPAID_ACTION_GIFTS_PER_DAY }))).toBe('too_many');
  });

  it('hands the same transaction to the same payer while its blockhash lives (no node call, no new row)', () => {
    expect(slots.actionSlot(facts({ own: own() }))).toBe('reuse');
    expect(slots.actionSlot(facts({ own: own({ expires_at: inMs(slots.REUSE_MIN_LEFT_MS) }) }))).toBe('reuse');
    expect(slots.actionSlot(facts({ own: own(), openOthers: 10, unpaidToday: 60 }))).toBe('reuse');
  });

  it('refreshes the payer\'s own intent when its blockhash is about to die: it already holds a slot', () => {
    expect(slots.actionSlot(facts({ own: own({ expires_at: inMs(slots.REUSE_MIN_LEFT_MS - 1) }) }))).toBe('refresh');
    expect(slots.actionSlot(facts({ own: own({ expires_at: inMs(-30_000) }), openOthers: 10 }))).toBe('refresh');
  });

  it('answers a payer whose attempt seconds ago gave no transaction without asking the node again', () => {
    const justHeld = own({ blockhash: null, expires_at: inMs(slots.SLOT_HOLD_MS - 2_000) });
    expect(slots.actionSlot(facts({ own: justHeld }))).toBe('wait');
    const heldAWhileAgo = own({ blockhash: null, expires_at: inMs(slots.SLOT_HOLD_MS - slots.RETRY_AFTER_MS) });
    expect(slots.actionSlot(facts({ own: heldAWhileAgo }))).toBe('refresh');
  });

  it('makes a payer whose intent died take a free slot again, like anyone else', () => {
    const dead = own({ expires_at: inMs(-10 * 60_000) });
    expect(slots.actionSlot(facts({ own: dead }))).toBe('refresh');
    expect(slots.actionSlot(facts({ own: dead, openOthers: 10 }))).toBe('too_many');
    expect(slots.actionSlot(facts({ own: own({ status: 'expired' }), openOthers: 10 }))).toBe('too_many');
    expect(slots.actionSlot(facts({ own: own({ status: 'expired' }), unpaidToday: 60 }))).toBe('refresh');
  });

  it('counts an intent as open only while its window, plus the margin, is alive', () => {
    expect(slots.occupiesSlot({ status: 'pending', expires_at: inMs(1_000) }, now)).toBe(true);
    expect(slots.occupiesSlot({ status: 'pending', expires_at: inMs(-60_000) }, now)).toBe(true);
    expect(slots.occupiesSlot({ status: 'pending', expires_at: inMs(-3 * 60_000) }, now)).toBe(false);
    expect(slots.occupiesSlot({ status: 'expired', expires_at: inMs(60_000) }, now)).toBe(false);
    expect(slots.occupiesSlot({ status: 'delivered', expires_at: inMs(60_000) }, now)).toBe(false);
  });

  it('never closes an unpaid row blindly while the callback could still settle it', () => {
    expect(slots.BLIND_EXPIRY_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });
});
