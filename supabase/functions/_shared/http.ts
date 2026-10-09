import { APP_URL } from './credential.ts';

const APP_ORIGINS = [APP_URL, 'https://hackathon.iterahq.dev'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `public`: readable from anywhere, no credentials. `app`: only the web app and local dev. */
export function corsHeaders(
  request: Request,
  audience: 'public' | 'app',
  methods = audience === 'app' ? 'POST, OPTIONS' : 'GET, OPTIONS',
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '86400',
  };
  if (audience === 'public') return { ...headers, 'Access-Control-Allow-Origin': '*' };
  const origin = request.headers.get('origin') ?? '';
  const allowed = APP_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
  return { ...headers, 'Access-Control-Allow-Origin': allowed ? origin : APP_URL, Vary: 'Origin' };
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Path segments after the function name, whatever prefix the gateway kept. */
export function pathAfter(request: Request, functionName: string): string[] {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.slice(segments.lastIndexOf(functionName) + 1);
}

export function langOf(request: Request, fallback: 'pt' | 'en'): 'pt' | 'en' {
  const lang = new URL(request.url).searchParams.get('lang');
  return lang === 'pt' || lang === 'en' ? lang : fallback;
}

export function functionsBase(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
}

/** The request body as a JSON object. An empty body reads as `{}`; anything else malformed as `null`. */
export async function readJsonObject(request: Request, maxBytes = 2048): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  if (!text.trim()) return {};
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}
