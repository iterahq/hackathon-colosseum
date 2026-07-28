/**
 * T2 — SMOKE DE RENDER DE TODAS AS STORIES (plano 20260728-itera-activity-testing, Fase 2).
 *
 * Monta CADA story canônica do repo e falha se ela lançar, se um error boundary
 * pegar alguma coisa, ou se ela escrever em `console.error`. É o tier mais barato
 * que existe: roda no mesmo `npm test` jsdom que já roda em todo PR (ADR-2 /
 * ADR-8 / ADR-9 — zero dependência nova, zero job novo).
 *
 * ⚠️ O QUE ESTE TESTE PROVA — E O QUE NÃO PROVA.
 *   Prova: MONTAGEM. Toda story monta sem lançar e sem `console.error`.
 *   NÃO prova: INTERAÇÃO (clicar → enviar → veredito). Isso é o tier T1 e chega
 *   na Fase 3, quando as stories ganharem `play` e as props `initial*` morrerem.
 *   NÃO prova nada sobre spec ARBITRÁRIO vindo do banco: `safeParseActivitySpec`
 *   só é chamado em 2 dos 11 kinds (ADR-5 / ADR-13 / drift signal #3), então o
 *   invariante "spec válido ⇒ renderiza" está provado aqui apenas contra as
 *   fixtures Zod-validadas de `src/stories/contractFixtures.ts`.
 *
 * A enumeração das stories (e a razão de `design-playground/**` ficar de fora)
 * vive em `./storyIndex.ts`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { indexStories } from './storyIndex';

/**
 * Stories que comprovadamente NÃO montam em jsdom, com o motivo de CADA uma.
 *
 * **Hoje está vazia** — as 165 stories de `src/**` montam, `code` (Monaco) e
 * `match` (@dnd-kit) inclusive, porque montar não é interagir.
 *
 * Regra se um dia precisar de entrada aqui: é DÍVIDA declarada, não erro
 * engolido. O teste `toda entrada da skip list ainda resolve para uma story
 * real` impede que a lista apodreça em silêncio (story renomeada/removida ⇒
 * vermelho) e o teto `SKIP_CAP` impede que ela cresça sem alguém perceber.
 * ADR-8 já manda `match` (drag) e `code` (iframe + Monaco) para o browser mode
 * na Fase 3 — é lá que a INTERAÇÃO desses dois passa a ser coberta.
 */
const SKIPPED: Record<string, string> = {};

/** Teto do débito: a skip list não cresce sem revisão explícita. */
const SKIP_CAP = 8;

const ALL_STORIES = indexStories();
const RUNNABLE = ALL_STORIES.filter((s) => !(s.id in SKIPPED));

describe('smoke de render — toda story de src/** monta sem erro', () => {
  const captured: string[] = [];

  beforeAll(() => {
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      captured.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    });
    return () => spy.mockRestore();
  });

  afterEach(() => {
    cleanup();
    captured.length = 0;
  });

  it('encontra stories (a enumeração por glob não está vazia)', () => {
    expect(ALL_STORIES.length).toBeGreaterThan(50);
    expect(new Set(ALL_STORIES.map((s) => s.id)).size).toBe(ALL_STORIES.length);
  });

  it('toda entrada da skip list ainda resolve para uma story real', () => {
    const known = new Set(ALL_STORIES.map((s) => s.id));
    expect(Object.keys(SKIPPED).filter((id) => !known.has(id))).toEqual([]);
  });

  it('a skip list não passa do teto acordado', () => {
    expect(Object.keys(SKIPPED).length).toBeLessThanOrEqual(SKIP_CAP);
  });

  it.each(RUNNABLE.map((s) => [s.id, s] as const))('%s monta', (_id, story) => {
    expect(() => render(<story.Component />)).not.toThrow();
    expect(captured, `${story.file} → ${story.exportName} escreveu em console.error`).toEqual([]);
  });
});
