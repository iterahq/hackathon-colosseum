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
import {
  ACTIVITY_CONTRACTS,
  DEGENERATE_SPECS,
  UNGUARDED_INVALID_SPECS,
  type ContractFixture,
} from '@/stories/contractFixtures';

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

  /**
   * As fixtures de BORDA (Fase 2) declaram de que LADO do Zod elas estão. Essa
   * classificação não pode ser prosa: se um schema mudar e um spec trocar de
   * lado, a story de borda passa a mostrar outra coisa — e ninguém perceberia.
   */
  it.each(Object.entries(DEGENERATE_SPECS))(
    'DEGENERATE_SPECS.%s é VÁLIDO no Zod (eixo H: degenerado, não inválido)',
    (_key, fixture) => {
      const parsed = safeParseActivitySpec(fixture.kind, fixture.spec);
      expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
    },
  );

  it.each(Object.entries(UNGUARDED_INVALID_SPECS))(
    'UNGUARDED_INVALID_SPECS.%s é REJEITADO pelo Zod do seu kind',
    (_key, fixture) => {
      expect(safeParseActivitySpec(fixture.kind, fixture.spec).success).toBe(false);
    },
  );

  /**
   * A fronteira de validação, escrita como asserção em vez de comentário —
   * drift signal #3 / ADR-5 / ADR-13. Hoje só `code` e `sandbox_scenario`
   * chamam `safeParseActivitySpec`; para os outros 9 kinds um spec inválido
   * atravessa e vai renderizar. Quando o plano irmão
   * `20260728-itera-back-office` fechar essa fronteira, ESTE teste fica
   * vermelho — que é o sinal desejado, não um incômodo.
   */
  it('a fronteira de validação ainda não existe para os kinds fora de code/sandbox_scenario', () => {
    const unguarded = Object.entries(UNGUARDED_INVALID_SPECS).filter(
      ([, f]) => !('guarded' in f && f.guarded),
    );
    expect(unguarded.map(([, f]) => f.kind).sort()).toEqual(['concept', 'video']);
    const guarded = Object.entries(UNGUARDED_INVALID_SPECS).filter(
      ([, f]) => 'guarded' in f && f.guarded,
    );
    expect(guarded.map(([, f]) => f.kind).sort()).toEqual(['concept_reveal', 'sandbox_scenario']);
  });

  it('o starter do contrato `code` não usa import (o iframe de preview não tem require)', () => {
    const code = ACTIVITY_CONTRACTS.code;
    const starter = String((code.spec as { starter?: string }).starter ?? '');
    expect(starter).not.toMatch(/^\s*import\s/m);
    expect(starter).toMatch(/export default/);
  });
});
