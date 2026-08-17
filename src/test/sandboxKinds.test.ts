/**
 * SÃO DOIS KINDS DE SANDBOX — E QUEM TESTA UM LITERAL SÓ PERDE O OUTRO.
 *
 * `chat_sandbox` e `terminal_sandbox` compartilham comportamento em vários
 * sites, e todo site que decide comparando com UM literal trata o irmão como um
 * kind comum.
 *
 * A falha nunca é um crash — é perda silenciosa do comportamento daquele site.
 * O pior caso, medido abaixo, é o `mapActivity` dos dois services: eles colapsam
 * os bags bilíngues de todo kind NÃO-sandbox, e o runtime do sandbox precisa
 * deles não colapsados. Virar a coluna `kind` num UPDATE (que é exatamente como
 * a migração acontece) transformaria os 24 sandboxes vivos em card de spec
 * inválido, sem uma linha de log.
 *
 * Este arquivo é a rede: se alguém escrever um terceiro site com o literal, o
 * teste de `isScenarioKind` continua verde, mas o de baixo — que mede o efeito
 * REAL sobre o spec — não.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, safeParseActivitySpec, type ActivityKind } from '@iterahq/activity-spec';
import { isScenarioKind, kindsOfFamily } from '@/utils/activityFamilies';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';
import terminalScenarios from './fixtures/terminal-scenarios.json';

const SANDBOX_KINDS = ['chat_sandbox', 'terminal_sandbox'] as const;

describe('isScenarioKind cobre os dois kinds de sandbox', () => {
  it.each(SANDBOX_KINDS)('%s é sandbox', (kind) => {
    expect(isScenarioKind(kind)).toBe(true);
  });

  it('e nenhum outro kind do enum é', () => {
    const naoSandbox = ACTIVITY_KINDS.filter(
      (k) => !(SANDBOX_KINDS as readonly string[]).includes(k)
    );
    for (const kind of naoSandbox) expect(isScenarioKind(kind)).toBe(false);
  });

  it('a família `scenario` e a lista deste arquivo são a MESMA coisa', () => {
    // Se um terceiro sandbox entrar, a trap de tipo do ACTIVITY_FAMILY obriga a
    // classificá-lo — e esta linha obriga a lembrar deste arquivo.
    expect([...kindsOfFamily('scenario')].sort()).toEqual([...SANDBOX_KINDS].sort());
  });

  it('kind desconhecido não explode nem passa', () => {
    expect(isScenarioKind('totally_new_kind')).toBe(false);
  });
});

/**
 * A MEDIÇÃO, não a intenção: prova que colapsar o bag REPROVA o spec de todo
 * sandbox. É o que dá sentido ao `isScenarioKind` nos dois `mapActivity` — sem
 * este teste, "colapsa demais" é uma afirmação sobre um schema de outro repo.
 */
describe('colapsar o bag bilíngue reprova o spec de qualquer sandbox', () => {
  const fixtures = (Object.entries(ACTIVITY_CONTRACTS) as [string, ContractFixture][]).filter(
    ([, c]) => isScenarioKind(c.kind) && c.validated
  );

  it('há fixture de sandbox para medir', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s: cru passa, colapsado reprova', (_name, contract) => {
    const kind = contract.kind as ActivityKind;
    expect(safeParseActivitySpec(kind, contract.spec).success).toBe(true);

    const collapsed = resolveLocalizedSpec(
      contract.spec as Record<string, unknown>
    ) as Record<string, unknown>;
    expect(
      safeParseActivitySpec(kind, collapsed).success,
      `o spec de "${kind}" sobreviveu ao colapso — se o runtime do sandbox passou a ` +
        'aceitar bag colapsado, o `isScenarioKind` nos dois mapActivity deixou de ser ' +
        'necessário e este arquivo é que precisa mudar.'
    ).toBe(false);
  });
});

/**
 * `terminal_sandbox` EXIGE O SPEC LIMPO — a terminal-idade é o KIND agora.
 *
 * O schema é `.strict()` e REPROVA o `sandboxKind` depreciado: repetir no spec
 * o que o kind já diz seria a mesma informação em dois lugares, e é ela que
 * poderia divergir. As fixtures locais ainda o carregam porque são o retrato do
 * corpus de conformidade do pacote.
 */
describe('`terminal_sandbox` exige o spec sem `sandboxKind`', () => {
  const specs = Object.entries(terminalScenarios as Record<string, Record<string, unknown>>);

  it('há fixture de terminal para medir', () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const [, spec] of specs) expect(spec.sandboxKind).toBe('terminal');
  });

  it.each(specs)('%s: só passa sem `sandboxKind`', (_slug, spec) => {
    expect(
      safeParseActivitySpec('terminal_sandbox', spec).success,
      'o `terminal_sandbox` passou a tolerar `sandboxKind` — se isso foi de propósito, ' +
        'a migração ficou mais simples e este teste é que precisa mudar.'
    ).toBe(false);

    const { sandboxKind: _dropped, ...stripped } = spec;
    expect(safeParseActivitySpec('terminal_sandbox', stripped).success).toBe(true);
  });
});
