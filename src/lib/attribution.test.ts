import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureAttribution,
  readAttribution,
  readFromLocation,
  attributionMetadata,
  sanitizeValue,
  clearAttribution,
} from './attribution';
import { clearIteraStorage } from '@/utils/storageScope';

const LANDING = 'https://app.iterahq.dev/catalog';

describe('sanitizeValue', () => {
  it('accepts ordinary campaign values', () => {
    expect(sanitizeValue('youtube')).toBe('youtube');
    expect(sanitizeValue('lancamento-2026')).toBe('lancamento-2026');
    expect(sanitizeValue(' aula ao vivo ')).toBe('aula ao vivo');
  });

  it('drops anything that is not plain campaign text', () => {
    // The value is attacker-chosen and ends up on a dashboard; a partial
    // sanitize would store a value that misreports the origin.
    expect(sanitizeValue('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeValue('a'.repeat(65))).toBeNull();
    expect(sanitizeValue('')).toBeNull();
    expect(sanitizeValue(null)).toBeNull();
    expect(sanitizeValue(42)).toBeNull();
  });
});

describe('readFromLocation', () => {
  it('reads the utm keys it knows and ignores the rest', () => {
    const a = readFromLocation(
      `${LANDING}?utm_source=youtube&utm_medium=video&utm_campaign=aula1&nope=x`,
      null
    );
    expect(a?.utm).toEqual({
      utm_source: 'youtube',
      utm_medium: 'video',
      utm_campaign: 'aula1',
    });
    expect(a?.landing).toBe('/catalog');
  });

  it('keeps only the referrer host, never the full URL', () => {
    const a = readFromLocation(LANDING, 'https://www.google.com/search?q=segredo');
    expect(a?.referrer).toBe('www.google.com');
  });

  it('attributes nothing to an internal navigation', () => {
    expect(readFromLocation(LANDING, 'https://app.iterahq.dev/lesson/1')).toBeNull();
  });

  it('does NOT credit the identity provider for a sign-in', () => {
    // Quem chega direto e entra com o Google ficaria atribuído a
    // accounts.google.com — o provedor de auth viraria canal de aquisição.
    expect(readFromLocation(LANDING, 'https://accounts.google.com/o/oauth2/v2/auth')).toBeNull();
    expect(readFromLocation(LANDING, 'https://login.microsoftonline.com/')).toBeNull();
  });

  it('ignores the OAuth/magic-link return, with or without referrer', () => {
    expect(readFromLocation(`${LANDING}?code=abc123`, 'https://mail.google.com/')).toBeNull();
    expect(readFromLocation(`${LANDING}#access_token=xyz`, null)).toBeNull();
    expect(readFromLocation(`${LANDING}?error_description=denied`, null)).toBeNull();
  });

  it('keeps a campaign utm even when the link also carries a code', () => {
    // Link de campanha com cupom (`?code=`) tem a mesma forma da volta do
    // OAuth. Descartar a captura inteira perderia a origem real.
    const a = readFromLocation(`${LANDING}?utm_source=youtube&code=PROMO10`, null);
    expect(a?.utm.utm_source).toBe('youtube');
    expect(a?.referrer).toBeNull();
  });

  it('credits GitHub as a channel, since the OAuth return is caught by the code param', () => {
    // Produto de educação em dev: link em README/gist é aquisição de verdade.
    expect(readFromLocation(LANDING, 'https://github.com/iterahq/readme')?.referrer).toBe(
      'github.com'
    );
    expect(readFromLocation(`${LANDING}?code=abc123`, 'https://github.com/login')).toBeNull();
  });

  it('still credits a real campaign that happens to come from an IdP domain link', () => {
    // O UTM é intencional e vence: só o referrer sozinho é que não conta.
    const a = readFromLocation(`${LANDING}?utm_source=newsletter`, 'https://accounts.google.com/');
    expect(a?.utm.utm_source).toBe('newsletter');
    expect(a?.referrer).toBeNull();
  });

  it('rejects a utm value that is not campaign text', () => {
    const a = readFromLocation(`${LANDING}?utm_source=%3Cimg%20src%3Dx%3E&utm_medium=cpc`, null);
    expect(a?.utm.utm_source).toBeUndefined();
    expect(a?.utm.utm_medium).toBe('cpc');
  });
});

describe('captureAttribution', () => {
  beforeEach(() => clearAttribution());

  it('keeps the FIRST touch when the learner comes back by another route', () => {
    captureAttribution(`${LANDING}?utm_source=youtube`, null);
    captureAttribution(`${LANDING}?utm_source=instagram`, null);
    // Someone can see an ad today and subscribe months later; the credit
    // belongs to the campaign that brought them, not to the last click.
    expect(readAttribution()?.utm.utm_source).toBe('youtube');
  });

  it('stores nothing when there is no origin to attribute', () => {
    expect(captureAttribution(LANDING, null)).toBeNull();
    expect(readAttribution()).toBeNull();
  });

  it('re-sanitizes on the way out, so a tampered store cannot smuggle a value', () => {
    localStorage.setItem(
      'itera_attribution',
      JSON.stringify({
        utm: { utm_source: '<script>alert(1)</script>', utm_medium: 'cpc' },
        referrer: null,
        landing: '/catalog',
        capturedAt: new Date().toISOString(),
      })
    );
    const a = readAttribution();
    expect(a?.utm.utm_source).toBeUndefined();
    expect(a?.utm.utm_medium).toBe('cpc');
  });

  it('does not throw on a href that is not a URL', () => {
    expect(() => captureAttribution('not a url', null)).not.toThrow();
  });

  it('does not let a record emptied by sanitize shadow the real origin', () => {
    localStorage.setItem(
      'itera_attribution',
      JSON.stringify({
        utm: { utm_source: '<script>alert(1)</script>' },
        referrer: null,
        landing: '/catalog',
        capturedAt: new Date().toISOString(),
      })
    );
    expect(readAttribution()).toBeNull();
    expect(captureAttribution(`${LANDING}?utm_source=youtube`, null)?.utm.utm_source).toBe(
      'youtube'
    );
  });

  it('lets the first touch expire, so a shared machine does not credit it forever', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      'itera_attribution',
      JSON.stringify({ utm: { utm_source: 'youtube' }, referrer: null, landing: '/', capturedAt: old })
    );
    expect(readAttribution()).toBeNull();
    expect(captureAttribution(`${LANDING}?utm_source=instagram`, null)?.utm.utm_source).toBe(
      'instagram'
    );
  });

  it('discards a record whose capturedAt is not a date', () => {
    localStorage.setItem(
      'itera_attribution',
      JSON.stringify({ utm: { utm_source: 'youtube' }, referrer: null, landing: '/', capturedAt: 'x' })
    );
    expect(readAttribution()).toBeNull();
  });

  it('survives the sign-out sweep, which is a normal event inside the window', () => {
    // A chave fica FORA do prefixo `itera.` de propósito: perder a origem no
    // logout derrubaria em silêncio justamente as conversões medidas.
    captureAttribution(`${LANDING}?utm_source=youtube`, null);
    clearIteraStorage();
    expect(readAttribution()?.utm.utm_source).toBe('youtube');
  });
});

describe('attributionMetadata', () => {
  it('flattens to the string map Stripe metadata accepts', () => {
    const a = readFromLocation(`${LANDING}?utm_source=youtube&utm_campaign=aula1`, null);
    const meta = attributionMetadata(a);
    expect(meta).toMatchObject({
      utm_source: 'youtube',
      utm_campaign: 'aula1',
      landing: '/catalog',
    });
    expect(Object.values(meta).every((v) => typeof v === 'string')).toBe(true);
  });

  it('is empty when there is nothing attributed, so the caller can omit it', () => {
    expect(attributionMetadata(null)).toEqual({});
  });
});
