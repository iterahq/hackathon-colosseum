import { CONFIRM_GRACE_MS } from './purchase-verify.ts';

export type Lang = 'pt' | 'en';

/** CAIP-2 id of Solana devnet, the only cluster these actions run on. */
export const SOLANA_DEVNET_CHAIN_ID = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const ACTION_VERSION = '2.4';
/** A pending gift younger than this may still be on its way through the normal confirm. */
export const RECONCILE_MIN_AGE_MS = 15_000;
/** Past its blockhash by this much, an unpaid gift can no longer be paid. */
export const EXPIRY_MARGIN_MS = 2 * 60_000;
const NAME_MAX = 24;

/**
 * Headers every answer of a Solana Action carries (GET, POST and OPTIONS), as
 * the specification asks: open CORS, the action version and the chain id.
 */
export function actionHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids, X-Accept-Action-Version, X-Accept-Blockchain-Ids',
    'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
    'Access-Control-Max-Age': '86400',
    'X-Action-Version': ACTION_VERSION,
    'X-Blockchain-Ids': SOLANA_DEVNET_CHAIN_ID,
  };
}

export function shortWallet(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** A nickname fit for a public title: one line, no control characters, clipped. `null` when nothing is left. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const text = [...name]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length <= NAME_MAX ? text : `${text.slice(0, NAME_MAX - 1).trimEnd()}…`;
}

const GENERATED_WORDS: ReadonlyArray<readonly [pt: string, en: string]> = [
  ['Curioso', 'Curious'], ['Focado', 'Focused'], ['Veloz', 'Swift'], ['Criativo', 'Creative'], ['Atento', 'Alert'],
  ['Valente', 'Brave'], ['Sereno', 'Calm'], ['Esperto', 'Clever'], ['Ligeiro', 'Quick'], ['Firme', 'Steady'],
  ['Brilhante', 'Bright'], ['Paciente', 'Patient'], ['Ousado', 'Bold'], ['Tranquilo', 'Easygoing'], ['Sagaz', 'Sharp'],
  ['Dedicado', 'Dedicated'], ['Animado', 'Lively'], ['Constante', 'Constant'], ['Engenhoso', 'Inventive'], ['Gentil', 'Kind'],
];

/**
 * How a learner is named in public: a nickname they typed as typed; the name provisioning generated ("Tera Focado 496")
 * in the reader's language; else the short wallet. A generated name whose word is in neither list falls back to the wallet.
 */
export function publicLabel(name: string | null, wallet: string, lang?: Lang): string {
  if (name === null) return shortWallet(wallet);
  const generated = lang ? /^Tera\s+(\p{L}+)\s+(\d{3})$/u.exec(name) : null;
  if (!lang || !generated) return name;
  const pair = GENERATED_WORDS.find(([pt, en]) => pt === generated[1] || en === generated[1]);
  return pair ? `Tera ${pair[lang === 'en' ? 1 : 0]} ${generated[2]}` : shortWallet(wallet);
}

/** One entry of the RPC `getSignaturesForAddress` answer, as far as it is read here. */
export interface SignatureInfo {
  signature: string;
  memo: string | null;
  err: unknown;
}

/** The node reports memos as `[<length>] <text>`, several joined by `; `. */
export function memoCarries(memo: string | null, intentId: string): boolean {
  if (!memo) return false;
  return memo.split('; ').some((entry) => entry.replace(/^\[\d+\]\s/, '') === intentId);
}

/** The successful transaction among a wallet's recent ones that carries the intent id as its memo. */
export function findPayment(signatures: SignatureInfo[], intentId: string): string | null {
  return signatures.find((entry) => entry.err === null && memoCarries(entry.memo, intentId))?.signature ?? null;
}

export interface GiftTiming {
  status: string;
  expires_at: string;
}

/** `payable`: a payment may still be accepted. `settled`: one already was. `expired`: none ever will be. */
export function giftPhase(gift: GiftTiming, now: Date, graceMs = CONFIRM_GRACE_MS): 'payable' | 'settled' | 'expired' {
  if (gift.status === 'paid' || gift.status === 'delivered') return 'settled';
  return now.getTime() <= new Date(gift.expires_at).getTime() + graceMs ? 'payable' : 'expired';
}

/** A pending gift nobody paid inside its blockhash window: safe to stop looking for it. */
export function isAbandoned(gift: GiftTiming, now: Date, marginMs = EXPIRY_MARGIN_MS): boolean {
  return gift.status === 'pending' && now.getTime() > new Date(gift.expires_at).getTime() + marginMs;
}

/** Open Action intents one recipient may have at a time, counted before any node call. */
export const MAX_OPEN_ACTION_GIFTS = 10;
/** Unpaid Action intents one recipient may collect in 24 hours. */
export const MAX_UNPAID_ACTION_GIFTS_PER_DAY = 60;
/** A transaction is handed out again only while its blockhash has at least this long to live. */
export const REUSE_MIN_LEFT_MS = 20_000;
/** How long a slot is held while the node is asked for a blockhash (replaced by the real window right after). */
export const SLOT_HOLD_MS = 90_000;
/** Past its grace window even the callback refuses a gift: only then is an unpaid row closed without asking the chain. */
export const BLIND_EXPIRY_MS = CONFIRM_GRACE_MS + 60 * 60_000;

/** An intent still occupies one of the recipient's slots while its window (plus the margin) is alive. */
export function occupiesSlot(gift: GiftTiming, now: Date, marginMs = EXPIRY_MARGIN_MS): boolean {
  return gift.status === 'pending' && now.getTime() <= new Date(gift.expires_at).getTime() + marginMs;
}

/** After an attempt that produced no transaction (no funds, node down) the same payer is answered from the database for this long. */
export const RETRY_AFTER_MS = 15_000;

export interface ActionSlotFacts {
  /** The unpaid intent this payer already has for this recipient, if any. */
  own: (GiftTiming & { blockhash: string | null }) | null;
  /** Open intents of OTHER payers for this recipient (`occupiesSlot`). */
  openOthers: number;
  /** Unpaid Action intents opened for this recipient in the last 24 hours, this payer's included. */
  unpaidToday: number;
  now: Date;
}

/**
 * What a POST to the gift Action may do, decided from the database alone,
 * before any call to the Solana node:
 * - `reuse`: the payer's own intent has a live blockhash; the same transaction is returned and the node is not asked.
 * - `wait`: the payer's last attempt, seconds ago, produced no transaction; it is answered again without the node.
 * - `refresh`: the payer's own intent gets a new blockhash (it holds a slot, or takes a free one again).
 * - `open`: a new intent, which takes one of the recipient's free slots.
 * - `too_many`: the recipient's slots are taken, or too many unpaid intents were opened today. Refused.
 * Only `refresh` and `open` reach the node, and each of them holds one of the recipient's few slots.
 */
export function actionSlot(facts: ActionSlotFacts): 'reuse' | 'wait' | 'refresh' | 'open' | 'too_many' {
  const { own, now } = facts;
  if (own && own.status === 'pending') {
    const left = new Date(own.expires_at).getTime() - now.getTime();
    if (own.blockhash && left >= REUSE_MIN_LEFT_MS) return 'reuse';
    // A slot held without a transaction was taken `SLOT_HOLD_MS` before it expires.
    if (!own.blockhash && left > SLOT_HOLD_MS - RETRY_AFTER_MS) return 'wait';
  }
  if (own && occupiesSlot(own, now)) return 'refresh';
  if (facts.openOthers >= MAX_OPEN_ACTION_GIFTS) return 'too_many';
  if (!own && facts.unpaidToday >= MAX_UNPAID_ACTION_GIFTS_PER_DAY) return 'too_many';
  return own ? 'refresh' : 'open';
}

export function giftActionUrl(functionsBase: string, wallet: string, lang?: Lang): string {
  return `${functionsBase}/action-gift?to=${wallet}${lang ? `&lang=${lang}` : ''}`;
}

/** The link that opens an action in Dialect's public blink client, which needs no registry approval. */
export function dialToUrl(actionUrl: string, cluster = 'devnet'): string {
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}&cluster=${cluster}`;
}

const TEXT = {
  pt: {
    title: (who: string) => `Dê uma vida ao Tera de ${who}`,
    description: (price: string) =>
      `Uma vida (${price}, devnet) para o Tera companheiro desta pessoa na Itera. A vida fica gravada on-chain no NFT do companheiro dela.`,
    label: 'Dar uma vida',
    button: (price: string) => `Dar uma vida · ${price}`,
    message: (who: string) => `Uma vida pro Tera de ${who}`,
    doneTitle: 'Vida entregue ✓',
    doneDescription: (who: string, lives: string) => `O Tera de ${who} ganhou uma vida (${lives}), gravada no companheiro on-chain.`,
    doneLabel: 'Entregue',
    errors: {
      invalid_address: 'Este link de presente não tem uma carteira válida.',
      recipient_not_found: 'Esta carteira ainda não estuda na Itera.',
      invalid_account: 'A carteira que paga não é um endereço Solana válido.',
      self_gift: 'Não dá para dar uma vida para você mesmo.',
      recipient_full: 'O Tera desta pessoa já está com todas as vidas e a vida bônus.',
      gift_limit: 'Esta pessoa já recebeu o máximo de vidas de presente por hoje.',
      too_many_pending: 'Há presentes demais em aberto para esta pessoa agora. Tente de novo em alguns minutos.',
      insufficient_funds: 'Saldo insuficiente em devnet para pagar a vida e a taxa.',
      gift_not_found: 'Este presente não existe.',
      gift_expired: 'Este presente expirou. Abra o link de novo.',
      payer_mismatch: 'A transação não foi paga pela carteira que abriu este presente.',
      tx_not_found: 'A transação ainda não apareceu na rede. Tente de novo em alguns segundos.',
      tx_failed: 'A transação falhou na rede.',
      payment_mismatch: 'A transação não corresponde a este presente.',
      signature_reused: 'Esta transação já pagou outro presente.',
      unavailable: 'A rede Solana (devnet) não respondeu. Tente de novo.',
      invalid_body: 'Pedido inválido.',
    },
  },
  en: {
    title: (who: string) => `Give a life to ${who}'s Tera`,
    description: (price: string) =>
      `One life (${price}, devnet) for this learner's Tera companion at Itera. The life is written on-chain to their companion NFT.`,
    label: 'Gift a life',
    button: (price: string) => `Gift a life · ${price}`,
    message: (who: string) => `A life for ${who}'s Tera`,
    doneTitle: 'Life delivered ✓',
    doneDescription: (who: string, lives: string) => `${who}'s Tera got a life (${lives}), written to the on-chain companion.`,
    doneLabel: 'Delivered',
    errors: {
      invalid_address: 'This gift link has no valid wallet.',
      recipient_not_found: 'This wallet is not learning at Itera yet.',
      invalid_account: 'The paying wallet is not a valid Solana address.',
      self_gift: 'You cannot gift a life to yourself.',
      recipient_full: "This learner's Tera already has every life and the bonus life.",
      gift_limit: 'This learner already received the maximum of gifted lives for today.',
      too_many_pending: 'Too many gifts are open for this learner right now. Try again in a few minutes.',
      insufficient_funds: 'Not enough devnet SOL to pay for the life and the fee.',
      gift_not_found: 'This gift does not exist.',
      gift_expired: 'This gift expired. Open the link again.',
      payer_mismatch: 'The transaction was not paid by the wallet that opened this gift.',
      tx_not_found: 'The transaction is not visible on the network yet. Try again in a few seconds.',
      tx_failed: 'The transaction failed on the network.',
      payment_mismatch: 'The transaction does not match this gift.',
      signature_reused: 'This transaction already paid for another gift.',
      unavailable: 'Solana (devnet) did not answer. Try again.',
      invalid_body: 'Invalid request.',
    },
  },
} as const;

export type GiftErrorCode = keyof (typeof TEXT)['en']['errors'];

/** The `ActionError` body of the specification. */
export function actionError(code: GiftErrorCode, lang: Lang): { message: string } {
  return { message: TEXT[lang].errors[code] };
}

export interface GiftActionInput {
  lang: Lang;
  /** The recipient as shown in public. */
  who: string;
  icon: string;
  /** The exact SOL price, e.g. `0.00055 SOL`. */
  price: string;
  /** Where the wallet POSTs `{ account }`. */
  href: string;
  /** Why the gift cannot be made right now, when it cannot. */
  blocked?: GiftErrorCode | null;
}

/** `ActionGetResponse`: what a blink client draws before anything is signed. */
export function giftActionGet(input: GiftActionInput) {
  const text = TEXT[input.lang];
  const blocked = input.blocked ?? null;
  return {
    type: 'action' as const,
    icon: input.icon,
    title: text.title(input.who),
    description: text.description(input.price),
    label: text.label,
    ...(blocked ? { disabled: true, error: actionError(blocked, input.lang) } : {}),
    links: {
      actions: [{ type: 'transaction' as const, label: text.button(input.price), href: input.href }],
    },
  };
}

/** `ActionPostResponse`: the unsigned transaction and the callback the client posts the signature to. */
export function giftActionPost(input: { lang: Lang; who: string; transactionBase64: string; callbackHref: string }) {
  return {
    type: 'transaction' as const,
    transaction: input.transactionBase64,
    message: TEXT[input.lang].message(input.who),
    links: { next: { type: 'post' as const, href: input.callbackHref } },
  };
}

/** `CompletedAction`: the last step of the chain, nothing left to sign. */
export function giftActionCompleted(input: { lang: Lang; who: string; icon: string; lives: number; maxLives: number }) {
  const text = TEXT[input.lang];
  return {
    type: 'completed' as const,
    icon: input.icon,
    title: text.doneTitle,
    description: text.doneDescription(input.who, `${input.lives}/${input.maxLives}`),
    label: text.doneLabel,
  };
}

/** The SOL amount of a price in lamports, exact, without trailing zeros. */
export function solAmount(lamports: number | bigint): string {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} SOL`;
}
