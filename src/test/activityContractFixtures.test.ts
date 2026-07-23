/**
 * Guarda de contrato das fixtures do Storybook.
 *
 * As stories de activity são organizadas POR CONTRATO (o `spec`/`rubric` que a
 * ferramenta de autoria precisa entregar). Este teste garante que cada contrato
 * registrado em `src/stories/contractFixtures.ts`:
 *
 *   1. passa no schema Zod do seu `kind` (`safeParseActivitySpec`) — assim uma
 *      story nunca "renderiza bonito" com um spec que a produção rejeitaria;
 *   2. declara uma função pedagógica válida (o agrupamento da sidebar);
 *   3. cobre TODOS os kinds do enum `itera.activity_kind` — se alguém adicionar
 *      um kind novo sem story, este teste quebra.
 *
 * A única entrada com `validated: false` é o BYOC ao vivo, cujo contrato é
 * reconhecido por `isByocLive()` e não pelo `SandboxScenarioSpecSchema` (a
 * resposta vem de um LLM real, então ele não carrega `cannedResults`).
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, safeParseActivitySpec } from '@iterahq/activity-spec';
import { isByocLive } from '@/components/branded/activity/sandbox-live/byocLive';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';

const entries = Object.entries(ACTIVITY_CONTRACTS) as [string, ContractFixture][];

const FUNCTIONS = new Set([
  '1 · Exposição',
  '2 · Escolha',
  '3 · Associação',
  '4 · Ordenação',
  '5 · Produção',
  '6 · Cenário com IA',
]);

describe('fixtures de story por contrato de activity', () => {
  it('registra pelo menos um contrato para CADA kind do enum', () => {
    const covered = new Set(entries.map(([, c]) => c.kind));
    expect([...ACTIVITY_KINDS].filter((k) => !covered.has(k))).toEqual([]);
  });

  it.each(entries)('%s declara uma função pedagógica conhecida', (_key, contract) => {
    expect(FUNCTIONS.has(contract.fn)).toBe(true);
    expect(contract.label.length).toBeGreaterThan(0);
    expect(contract.note.length).toBeGreaterThan(0);
  });

  it.each(entries.filter(([, c]) => c.validated))(
    '%s passa no safeParseActivitySpec do seu kind',
    (_key, contract) => {
      const parsed = safeParseActivitySpec(contract.kind, contract.spec);
      expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
    },
  );

  it('o único contrato não-validado pelo Zod é o BYOC ao vivo, e ele é reconhecido por isByocLive', () => {
    const loose = entries.filter(([, c]) => !c.validated);
    expect(loose.map(([key]) => key)).toEqual(['sandbox_byoc_live']);
    for (const [, contract] of loose) {
      expect(isByocLive({ kind: contract.kind, spec: contract.spec })).toBe(true);
    }
  });

  it('o starter do contrato `code` não usa import (o iframe de preview não tem require)', () => {
    const code = ACTIVITY_CONTRACTS.code;
    const starter = String((code.spec as { starter?: string }).starter ?? '');
    expect(starter).not.toMatch(/^\s*import\s/m);
    expect(starter).toMatch(/export default/);
  });
});
