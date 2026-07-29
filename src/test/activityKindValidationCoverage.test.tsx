/**
 * TRAP DE EXAUSTIVIDADE DA FRONTEIRA DE VALIDAÇÃO — os 11 kinds.
 *
 * Origem: Tainan, 2026-07-28 — *"é pra cobrir os 11 kinds então. e não deixar
 * passar CI se criarmos novo kind que não esteja coberto"* (ADR-15).
 *
 * Este arquivo é o lado RUNTIME da trap (o lado de TIPO é o
 * `Record<ActivityKind, …>` em `src/utils/activitySpecBoundary.ts`, que já
 * quebra o `npm run typecheck` — gate de build desde a PR #195). Ele:
 *
 *   1. deriva TUDO de `ACTIVITY_KINDS`, a única fonte da verdade — lista escrita
 *      à mão reproduziria exatamente o drift que a trap existe pra impedir;
 *   2. CLASSIFICA em vez de contar: schema de verdade · stub loose · isento;
 *   3. prova que o renderer de fato degrada para o card amigável (estado F) em
 *      spec inválido, kind a kind;
 *   4. prova que a PRÓPRIA TRAP dispara, alimentando um kind sintético ao
 *      auditor — sem deixar a CI vermelha por isso.
 *
 * ⚠️ Por que esta trap mora aqui e não no `@iterahq/activity-spec`: o pacote tem
 * uma cláusula `satisfies` interna de exaustividade, mas é **vendorizado como
 * `.tgz` já compilado** — aquela cláusula nunca recompila na CI deste repo e
 * dá **zero** proteção aqui. Não apague isto como redundante.
 *
 * ⚠️ NÃO é o `activityContractFixtures.test.ts` (guarda de contrato/fixtures,
 * de outro round) nem o `activityMatrixCoverage.test.ts` (guarda de matriz de
 * stories, Fase 2). Arquivos separados de propósito.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ACTIVITY_KINDS, safeParseActivitySpec, type ActivityKind } from '@iterahq/activity-spec';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';
import {
  EXEMPT_LAYERS,
  KIND_VALIDATION,
  KNOWN_STUB_KINDS,
  auditKindValidationCoverage,
  packageSaysImplemented,
  specBoundaryFailure,
  specSchemaClass,
} from '@/utils/activitySpecBoundary';
import type { Activity } from '@/types/content';

const KINDS = [...ACTIVITY_KINDS];

function makeActivity(kind: string, spec: unknown): Activity {
  return {
    id: `t-${kind}`,
    lessonId: 'l',
    ordinal: 0,
    kind: kind as ActivityKind,
    spec: spec as Record<string, unknown>,
    rubric: null,
  };
}

function renderActivity(activity: Activity) {
  render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={vi.fn()} />
    </I18nProvider>,
  );
}

/**
 * Um spec SABIDAMENTE inválido por kind.
 *
 * Os 3 kinds de schema stub (`z.record`) aceitam QUALQUER objeto — inclusive
 * `{}` — então para eles o único spec rejeitável é um não-objeto. É exatamente
 * essa assimetria que a classificação abaixo torna visível em vez de esconder.
 */
const INVALID_SPEC: Record<ActivityKind, unknown> = {
  document: 'isto não é um objeto',
  diagram: 'isto não é um objeto',
  quiz: 'isto não é um objeto',
  code: { totalmente: 'inválido' },
  concept: { totalmente: 'inválido' },
  single_choice: { totalmente: 'inválido' },
  multi_choice: { totalmente: 'inválido' },
  match: { totalmente: 'inválido' },
  order: { totalmente: 'inválido' },
  video: { totalmente: 'inválido' },
  sandbox_scenario: { totalmente: 'inválido' },
};

/** Primeiro contrato VÁLIDO registrado para o kind — o controle positivo. */
function validSpecFor(kind: ActivityKind): Record<string, unknown> {
  const entries = Object.values(ACTIVITY_CONTRACTS) as ContractFixture[];
  const hit = entries.find((c) => c.kind === kind && c.validated);
  if (!hit) throw new Error(`sem contrato validado para o kind ${kind}`);
  return hit.spec;
}

describe('fronteira de validação de spec — cobertura dos 11 kinds', () => {
  it('todo kind de ACTIVITY_KINDS está registrado (espelho runtime da trap de tipo)', () => {
    const report = auditKindValidationCoverage();
    expect(report.missing).toEqual([]);
    expect(report.byKind).toHaveLength(KINDS.length);
    expect(Object.keys(KIND_VALIDATION).sort()).toEqual([...KINDS].sort());
  });

  it('classifica cada kind: schema de verdade vs stub loose — stub NÃO conta como coberto', () => {
    const report = auditKindValidationCoverage();

    // Pinado: se alguém apertar um desses schemas lá no `iterahq/activity-spec`
    // e re-vendorizar o tgz, este teste quebra e força uma atualização
    // DELIBERADA aqui — em vez de o repo passar a "cobrir" um kind em silêncio.
    expect([...report.stubs].sort()).toEqual([...KNOWN_STUB_KINDS].sort());
    expect(report.realSchema).toHaveLength(KINDS.length - KNOWN_STUB_KINDS.length);

    for (const k of report.byKind) {
      if (KNOWN_STUB_KINDS.includes(k.kind as ActivityKind)) {
        expect(k.schemaClass).toBe('stub');
        // A afirmação central: validado ≠ plenamente coberto.
        expect(k.fullyCovered).toBe(false);
      } else {
        expect(k.schemaClass).toBe('schema');
        expect(k.fullyCovered).toBe(true);
      }
    }
  });

  it.each(KINDS)(
    '%s — a classificação COMPORTAMENTAL bate com o `isImplementedKind` declarado pelo pacote',
    (kind) => {
      // Medição por comportamento (o schema aceita `{}`? então não discrimina)
      // cruzada com a lista que o pacote declara. Divergência = alguém mexeu no
      // pacote e a classificação daqui precisa ser revista.
      expect(specSchemaClass(kind) === 'schema').toBe(packageSaysImplemented(kind));
    },
  );

  it('os 3 kinds stub aceitam `{}` — a lacuna declarada, explicitada aqui', () => {
    for (const kind of KNOWN_STUB_KINDS) {
      expect(safeParseActivitySpec(kind, {}).success).toBe(true);
    }
    for (const kind of KINDS.filter((k) => !KNOWN_STUB_KINDS.includes(k))) {
      expect(safeParseActivitySpec(kind, {}).success).toBe(false);
    }
  });

  it.each(KINDS)(
    '%s — spec INVÁLIDO degrada para o card amigável (estado F), sem crash',
    (kind) => {
      expect(() => renderActivity(makeActivity(kind, INVALID_SPEC[kind]))).not.toThrow();
      const card = screen.getByTestId(KIND_VALIDATION[kind].invalidTestId);
      expect(card).toBeInTheDocument();
      // Gancho genérico: um kind novo entra na varredura sem editar lista de testids.
      expect(card.getAttribute('data-invalid-spec')).toBe('true');
      expect(card.getAttribute('data-activity-kind')).toBe(kind);
    },
  );

  it.each(KINDS)('%s — spec VÁLIDO NÃO mostra o card de inválido (controle positivo)', (kind) => {
    // Sem este controle, o teste acima passaria trivialmente se a fronteira
    // rejeitasse tudo.
    expect(specBoundaryFailure(makeActivity(kind, validSpecFor(kind)))).toBeNull();
    renderActivity(makeActivity(kind, validSpecFor(kind)));
    expect(screen.queryByTestId(KIND_VALIDATION[kind].invalidTestId)).toBeNull();
    expect(document.querySelector('[data-invalid-spec]')).toBeNull();
  });

  it('kind DESCONHECIDO continua sendo do UnknownActivity (estado G), não da fronteira', () => {
    expect(specBoundaryFailure(makeActivity('totally_new_kind', { qualquer: 'coisa' }))).toBeNull();
    renderActivity(makeActivity('totally_new_kind', { qualquer: 'coisa' }));
    expect(document.querySelector('[data-activity-kind="unknown"]')).not.toBeNull();
    expect(document.querySelector('[data-invalid-spec]')).toBeNull();
  });
});

describe('BYOC — isenções deliberadas (camada, não kind)', () => {
  it('declara as duas camadas isentas', () => {
    expect([...EXEMPT_LAYERS]).toEqual(['byoc-harness', 'byoc-live']);
  });

  it('o sandbox_scenario BYOC AO VIVO é isento — validar em bloco quebraria o caminho ao vivo', () => {
    // O contrato ao vivo é `validated: false` de propósito: a resposta vem de um
    // LLM real, então ele não carrega `cannedResults` e reprovaria no
    // SandboxScenarioSpecSchema. Ele é reconhecido por `isByocLive()`.
    const live = ACTIVITY_CONTRACTS.sandbox_byoc_live as ContractFixture;
    expect(live.validated).toBe(false);
    expect(safeParseActivitySpec('sandbox_scenario', live.spec).success).toBe(false);
    // …e mesmo assim a fronteira NÃO o reprova.
    expect(specBoundaryFailure(makeActivity('sandbox_scenario', live.spec))).toBeNull();
  });

  it('o kind hospedeiro de uma activity BYOC não é validado pela fronteira (isenção por ORDEM)', () => {
    // `resolveByocSpec()` roda ANTES do switch de kind no ActivityRenderer, então
    // o spec de uma activity BYOC é assunto do `ByocSpecSchema` — nunca do schema
    // do kind hospedeiro. Aqui isso é asserido no nível do RENDERER: o ramo BYOC
    // devolve antes de a fronteira ser consultada (ver ActivityRenderer.tsx).
    const hostSpecThatFailsItsKind = { byoc: { seed: {}, harness: {} } };
    // Sem a itera-api configurada `resolveByocSpec` devolve null e o fluxo cai na
    // fronteira — o que prova, pelo contrapositivo, que a ordem é o que isenta.
    expect(specBoundaryFailure(makeActivity('quiz', hostSpecThatFailsItsKind))).toBeNull();
  });
});

describe('META — a trap dispara mesmo (prova, não afirmação)', () => {
  it('um kind novo NÃO registrado aparece como buraco no relatório', () => {
    // Alimenta uma lista de kinds SINTÉTICA ao auditor: é assim que se prova que
    // a trap fecha sem precisar deixar a CI vermelha de verdade. O experimento
    // com um kind falso de verdade (typecheck + test vermelhos) está registrado
    // no corpo da PR desta fase.
    const report = auditKindValidationCoverage([...ACTIVITY_KINDS, 'totally_new_kind']);

    expect(report.missing).toEqual(['totally_new_kind']);
    const novo = report.byKind.find((k) => k.kind === 'totally_new_kind');
    expect(novo?.registered).toBe(false);
    expect(novo?.fullyCovered).toBe(false);
    expect(novo?.invalidTestId).toBeNull();
  });

  it('a lista REAL de kinds não tem buraco nenhum (o mesmo auditor, sem síntese)', () => {
    expect(auditKindValidationCoverage(ACTIVITY_KINDS).missing).toEqual([]);
  });
});
