/**
 * CHARACTERIZATION BASELINE — what the AI judge is asked, and what it answers,
 * for every production row that phase 3e is about to rewrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE HAD TO EXIST BEFORE ANY DATA MOVED
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan `20260807-itera-activity-defs-registry-restructure` folds the deprecated
 * `rubric` column into a typed `spec.evaluation` (ADR-5, ADR-7). ADR-5 states
 * the precondition in one line: the affected rows "precisa de fixture de
 * caracterização ANTES da dobra".
 *
 * The precondition is not ceremony, and the reason is one line of `itera-api`
 * (`src/judge/judge.ts:75-76`, in the judge's SYSTEM_PROMPT):
 *
 *     "If the rubric is empty, derive 2-4 reasonable criteria from the prompt
 *      yourself and grade against those."
 *
 * So a fold that LOSES the rubric does not raise. It produces a different but
 * entirely plausible grade: no exception, no log, no failed request, a
 * `passed: true` archived in a table with no provenance column. A learner gets
 * a wrong mark that looks right. A baseline asserting only "the judge still
 * returns a verdict" would sail straight through that, which is why this file
 * pins the CONTENT of the grading input and of a recorded verdict instead.
 *
 * ⚠️ `src/test/documentJudgeGate.test.tsx` is NOT this. It characterises which
 * RENDERER gets selected — a real and useful pin, and the reason its cases are
 * not repeated here — but it says nothing about what the judge is asked or what
 * it answers, and it uses invented one-key rubrics rather than production ones.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DETERMINISTIC HERE, AND WHAT IS NOT — read this before trusting it
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC, and therefore asserted:
 *   · the GRADING INPUT of all 35 production rows — mode, the ordered stable
 *     ids of `criteria[]`, `artifact`, `min_words`, and the rubric keys that
 *     have no reader. This is exactly the payload `itera-api` serialises into
 *     the model's prompt (`judge.ts:84,95` JSON.stringify the whole column), so
 *     pinning it pins what the model is asked.
 *   · which of the three `document` renderers each production rubric selects,
 *     asked of the REAL exported component, not of a re-implemented predicate.
 *   · how the player renders a RECORDED verdict: chip count, per-criterion
 *     met/unmet, score, status, and whether completion fires.
 *
 * NOT DETERMINISTIC, and therefore never called:
 *   · the model. No test in this file reaches the network or an LLM. The nine
 *     verdicts replayed below are rows that production already recorded; they
 *     are evidence, not expectations of what a model would say next.
 *
 * The line between the two is itself a finding. Across the 8 criteria-bearing
 * verdicts of `273e631e` — one activity, one rubric, one model, two learner
 * sessions six minutes apart — FOUR echo the authored criteria verbatim and
 * FOUR rewrite all of them. That is asserted below, because it is the measured
 * reason `criterion_id` has to exist: the verdict's own text identifies the
 * authored criterion only half the time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EXPECTATIONS ARE IN THIS FILE, NOT IN THE FIXTURE — DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 * `BASELINE` below is a literal table, and every assertion compares the fixture
 * AGAINST it. If the expected values were derived from the fixture at run time
 * the suite would be a tautology: regenerate the fixture with a criterion
 * missing and it would still pass, which is the precise failure this file
 * exists to prevent. The table is also checked for completeness in both
 * directions, so a row that disappears from the fixture is a failure rather
 * than one fewer iteration.
 *
 * ⚠️ WHEN THE FOLD LANDS, THIS FILE DOES NOT GET DELETED — IT GETS REPOINTED.
 * Phase 3e writes `spec.evaluation` and leaves `rubric` intact (the plan's
 * reversibility property, Verification 21). So after 3e the correct change is
 * to re-capture the fixture and assert that the evaluation-derived signature
 * equals the SAME `BASELINE` table, unchanged. A PR that edits the table is
 * changing what learners are graded on, and should read as exactly that.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ActivityProvider } from '@iterahq/activities';
import type { ActivityApiPort, ActivityJudgeVerdict } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';
import { DocumentActivity } from '@/components/branded/activity/DocumentActivity';
import { isExerciseActivity } from '@/utils/isExerciseActivity';
import type { Activity } from '@/types/content';
import {
  CRITERION_ID_RE,
  criterionIds,
  gradingSignature,
  type RubricCriterion,
} from './support/criterionId';
import fixture from './fixtures/production-grading-inputs.json';

/* ─────────────────────────── the fixture, typed ─────────────────────────── */

interface FixtureRow {
  source: 'activity_defs' | 'activities';
  ref: string;
  kind: string;
  specPromptPresent: boolean;
  rubric: Record<string, unknown>;
}

interface FixtureVerdict {
  ref: string;
  activityRef: string;
  attempt: number;
  passed: boolean;
  score: number | null;
  status: string;
  judgeAvailable: boolean;
  model: string;
  degradedReason: string | null;
  feedbackRedacted: boolean;
  criteria: { criterion: string; met: boolean; noteRedacted: boolean }[];
}

const rows = fixture.rows as FixtureRow[];
const verdicts = fixture.verdicts as FixtureVerdict[];

/* ───────────────────────────── the baseline ─────────────────────────────── */

/**
 * One entry per production row carrying a non-empty `rubric`, as measured on
 * 2026-08-10. `branch` is `'n/a'` for `diagram` and `sandbox_scenario`: their
 * renderers never read the rubric — only `itera-api` does — so for those kinds
 * the grading input IS the whole of the observable behaviour.
 *
 * `legacyKeys` are the rubric keys the plan retires WITHOUT a destination
 * (`tiers`, `parse`, `tests`, `artifact_file`, `template_repo` — §5.6.3, none
 * has a reader anywhere). They are pinned so their removal shows up as an
 * intentional diff on this table instead of vanishing quietly with the column.
 */
const BASELINE: ReadonlyArray<{
  source: 'activity_defs' | 'activities';
  ref: string;
  kind: string;
  mode: 'ai-judge' | 'word-count';
  minWords?: number;
  artifact: boolean;
  criterionIds: readonly string[];
  legacyKeys: readonly string[];
  branch: 'ai-judge' | 'reflection' | 'reading' | 'n/a';
}> = [
  { source: 'activities', ref: '0f240990', kind: 'diagram', mode: 'ai-judge', artifact: false, criterionIds: ['3-entidades-com-chave-primaria', '1-relacionamento-com-cardinalidade-expli', 'usa-chave-estrangeira-nao-copia-atributo'], legacyKeys: ['artifact_file', 'parse', 'template_repo', 'tiers'], branch: 'n/a' },
  { source: 'activities', ref: '1c439644', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['tem-veiculo-viagem-motorista-e-evento-co', 'viagem-agrega-os-sinais-crus-nao-modela', 'relacionamentos-com-cardinalidade-veicul'], legacyKeys: [], branch: 'n/a' },
  { source: 'activities', ref: '53629ad4', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['produtor-e-uma-entidade-unica-com-chave', 'modela-o-relacionamento-produtor-recebiv', 'mostra-a-ligacao-cross-unidade-produtor'], legacyKeys: [], branch: 'n/a' },
  { source: 'activities', ref: 'bf47965a', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['mostra-gatilho-agente-consulta-a-tabela', 'indica-onde-entra-o-humano-escalonamento', 'nomeia-as-ferramentas-sistemas-que-o-age'], legacyKeys: [], branch: 'n/a' },
  { source: 'activities', ref: 'e1f1d27a', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['tem-gatilho-e-resultado-explicitos', 'pelo-menos-1-decisao-losango-e-2-tarefas', 'os-caminhos-da-decisao-estao-rotulados-s'], legacyKeys: [], branch: 'n/a' },
  { source: 'activity_defs', ref: '05e58fa8', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['mostra-gatilho-agente-consulta-a-tabela', 'indica-onde-entra-o-humano-escalonamento', 'nomeia-as-ferramentas-sistemas-que-o-age'], legacyKeys: [], branch: 'n/a' },
  { source: 'activity_defs', ref: '251c7568', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['tem-veiculo-viagem-motorista-e-evento-co', 'viagem-agrega-os-sinais-crus-nao-modela', 'relacionamentos-com-cardinalidade-veicul'], legacyKeys: [], branch: 'n/a' },
  { source: 'activity_defs', ref: '34f65f33', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['produtor-e-uma-entidade-unica-com-chave', 'modela-o-relacionamento-produtor-recebiv', 'mostra-a-ligacao-cross-unidade-produtor'], legacyKeys: [], branch: 'n/a' },
  { source: 'activity_defs', ref: 'b131c808', kind: 'diagram', mode: 'ai-judge', artifact: false, criterionIds: ['3-entidades-com-chave-primaria', '1-relacionamento-com-cardinalidade-expli', 'usa-chave-estrangeira-nao-copia-atributo'], legacyKeys: ['artifact_file', 'parse', 'template_repo', 'tiers'], branch: 'n/a' },
  { source: 'activity_defs', ref: 'd2649461', kind: 'diagram', mode: 'ai-judge', artifact: true, criterionIds: ['tem-gatilho-e-resultado-explicitos', 'pelo-menos-1-decisao-losango-e-2-tarefas', 'os-caminhos-da-decisao-estao-rotulados-s'], legacyKeys: [], branch: 'n/a' },
  { source: 'activities', ref: '0160948f', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-em-1-frase-focado-em-resultado', 'lista-2-ferramentas-concretas-sistemas-r', 'inclui-a-tabela-de-decisao-politica', 'tem-2-guardrails-de-escalonamento-humano', 'tem-2-checagens-de-verificacao'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: '18adeaf3', kind: 'document', mode: 'ai-judge', artifact: false, criterionIds: ['lista-3-correcoes-concretas-ao-modelo-da', 'demonstra-entendimento-de-normalizacao-f', 'clareza-da-especificacao'], legacyKeys: ['artifact_file', 'parse', 'tiers'], branch: 'ai-judge' },
  { source: 'activities', ref: '191a4bc0', kind: 'document', mode: 'word-count', minWords: 10, artifact: false, criterionIds: [], legacyKeys: [], branch: 'reflection' },
  { source: 'activities', ref: '2228e494', kind: 'document', mode: 'ai-judge', artifact: false, criterionIds: ['schema-reflete-o-er', 'normalizacao-correta', 'constraints-fazem-sentido'], legacyKeys: ['artifact_file', 'parse', 'tests', 'tiers'], branch: 'ai-judge' },
  { source: 'activities', ref: '315a4ef5', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['descreve-sinais-entidades-agregacao', 'lista-2-perguntas-de-negocio-respondivei', 'nomeia-a-fonte-dos-sinais-dispositivo-te'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: '721323ea', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['cobre-todas-as-combinacoes-de-condicao-o', 'define-explicitamente-o-que-escala-para', 'sem-regras-conflitantes'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: 'ce2cef0b', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['escolhe-um-processo-concreto', 'justifica-com-criterio-frequencia-dor-cl'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: 'd5d991b2', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['define-usuarios-e-a-visao-consolidada', 'nomeia-as-fontes-de-dados-sistemas-unida', 'inclui-1-sugestao-acionavel-de-ia-sobre'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: 'dc481679', kind: 'document', mode: 'word-count', minWords: 60, artifact: false, criterionIds: [], legacyKeys: [], branch: 'reflection' },
  { source: 'activities', ref: 'dfdf6e05', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['lista-2-decisoes-com-pergunta-clara', 'cada-decisao-nomeia-seus-inputs-dados-si', 'cada-decisao-descreve-a-regra-humana-atu'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: 'eb426dc5', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-claro-ligado-a-recebivel-credit', 'politica-tabela-de-decisao-de-credito', 'guardrail-de-escalonamento-por-exposicao', 'inclui-verificacao-do-resultado'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: 'f6986f48', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-mensuravel-ex-de-parada', '2-ferramentas-concretas-de-frota', 'politica-inclui-manutencao-e-ou-rota', '2-guardrails-2-verificacoes'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '2c269361', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-em-1-frase-focado-em-resultado', 'lista-2-ferramentas-concretas-sistemas-r', 'inclui-a-tabela-de-decisao-politica', 'tem-2-guardrails-de-escalonamento-humano', 'tem-2-checagens-de-verificacao'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '2ca5f72f', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['define-usuarios-e-a-visao-consolidada', 'nomeia-as-fontes-de-dados-sistemas-unida', 'inclui-1-sugestao-acionavel-de-ia-sobre'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '3c8246c6', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['escolhe-um-processo-concreto', 'justifica-com-criterio-frequencia-dor-cl'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '4c961cc8', kind: 'document', mode: 'ai-judge', artifact: false, criterionIds: ['schema-reflete-o-er', 'normalizacao-correta', 'constraints-fazem-sentido'], legacyKeys: ['artifact_file', 'parse', 'tests', 'tiers'], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '4de254b3', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-claro-ligado-a-recebivel-credit', 'politica-tabela-de-decisao-de-credito', 'guardrail-de-escalonamento-por-exposicao', 'inclui-verificacao-do-resultado'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '4ed5c58c', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['objetivo-mensuravel-ex-de-parada', '2-ferramentas-concretas-de-frota', 'politica-inclui-manutencao-e-ou-rota', '2-guardrails-2-verificacoes'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '72e4afa9', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['lista-2-decisoes-com-pergunta-clara', 'cada-decisao-nomeia-seus-inputs-dados-si', 'cada-decisao-descreve-a-regra-humana-atu'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: '797579b9', kind: 'document', mode: 'word-count', minWords: 10, artifact: false, criterionIds: [], legacyKeys: [], branch: 'reflection' },
  { source: 'activity_defs', ref: '9e80de2e', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['cobre-todas-as-combinacoes-de-condicao-o', 'define-explicitamente-o-que-escala-para', 'sem-regras-conflitantes'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activity_defs', ref: 'd4b66be8', kind: 'document', mode: 'ai-judge', artifact: false, criterionIds: ['lista-3-correcoes-concretas-ao-modelo-da', 'demonstra-entendimento-de-normalizacao-f', 'clareza-da-especificacao'], legacyKeys: ['artifact_file', 'parse', 'tiers'], branch: 'ai-judge' },
  { source: 'activity_defs', ref: 'f615c88a', kind: 'document', mode: 'ai-judge', artifact: true, criterionIds: ['descreve-sinais-entidades-agregacao', 'lista-2-perguntas-de-negocio-respondivei', 'nomeia-a-fonte-dos-sinais-dispositivo-te'], legacyKeys: [], branch: 'ai-judge' },
  { source: 'activities', ref: '273e631e', kind: 'sandbox_scenario', mode: 'ai-judge', artifact: true, criterionIds: ['usa-o-contexto-que-o-aluno-deu-pra-quem', 'e-especifica-e-pronta-pra-usar-na-tarefa', 'respeita-o-formato-e-o-tamanho-pedidos-e', 'reprova-quando-a-resposta-e-generica-eva'], legacyKeys: [], branch: 'n/a' },
  { source: 'activity_defs', ref: '0f0a9a9c', kind: 'sandbox_scenario', mode: 'ai-judge', artifact: true, criterionIds: ['usa-o-contexto-que-o-aluno-deu-pra-quem', 'e-especifica-e-pronta-pra-usar-na-tarefa', 'respeita-o-formato-e-o-tamanho-pedidos-e', 'reprova-quando-a-resposta-e-generica-eva'], legacyKeys: [], branch: 'n/a' },
];

const key = (r: { source: string; ref: string }) => `${r.source}:${r.ref}`;
const baselineByKey = new Map(BASELINE.map((b) => [key(b), b]));

/* ────────────────────────────── mounting ────────────────────────────────── */

function Host({ api, children }: { api?: ActivityApiPort; children: ReactNode }) {
  const i18n = useI18n();
  return (
    <ActivityProvider i18n={i18n} api={api} identity={{ authenticated: true }}>
      {children}
    </ActivityProvider>
  );
}

/**
 * The spec is SYNTHETIC and says so. The fixture stores only whether
 * `spec.prompt` was present, because the prompt is authored prose that this
 * baseline has no reason to carry — and presence is the entire contribution the
 * spec makes to the branch (`DocumentActivity`: `Boolean(spec.prompt)`).
 */
function asActivity(row: FixtureRow): Activity {
  return {
    id: `row-${row.ref}`,
    kind: row.kind,
    spec: row.specPromptPresent ? { prompt: 'SYNTHETIC PROMPT — see header' } : {},
    rubric: row.rubric,
    status: 'todo',
  } as unknown as Activity;
}

function mount(row: FixtureRow, api?: ActivityApiPort, onComplete = () => {}) {
  return render(
    <I18nProvider>
      <Host api={api}>
        <DocumentActivity activity={asActivity(row)} onComplete={onComplete} />
      </Host>
    </I18nProvider>
  );
}

/** A host that CAN judge — the production configuration for the Itera player. */
const judgingHost = (): ActivityApiPort => ({
  judge: vi.fn(),
  listSeeds: vi.fn().mockResolvedValue([]),
});

/* ═════════════════════════════════ tests ══════════════════════════════════ */

describe('the fixture is a complete, well-formed snapshot', () => {
  it('carries the counts and the project it claims', () => {
    expect(fixture._project).toBe('kjefmwlopzeaqgqtlbdn');
    expect(rows.length).toBe(fixture._rowCount);
    expect(verdicts.length).toBe(fixture._verdictCount);
  });

  it('holds exactly the 17 defs + 18 activities measured as carrying a rubric', () => {
    expect(rows.filter((r) => r.source === 'activity_defs').length).toBe(17);
    expect(rows.filter((r) => r.source === 'activities').length).toBe(18);
    const byKind = (k: string) => rows.filter((r) => r.kind === k && r.source === 'activities').length;
    expect({ document: byKind('document'), diagram: byKind('diagram'), sandbox: byKind('sandbox_scenario') })
      .toEqual({ document: 12, diagram: 5, sandbox: 1 });
  });

  it('every row has a non-empty rubric with a grading mode we can name', () => {
    const nameless = rows.filter(
      (r) => r.rubric.mode !== 'ai-judge' && typeof r.rubric.min_words !== 'number'
    );
    // A rubric that is neither `ai-judge` nor word-count would be graded by
    // nothing, and `gradingSignature` would silently call it word-count.
    expect(nameless.map(key)).toEqual([]);
    expect(rows.filter((r) => Object.keys(r.rubric).length === 0).map(key)).toEqual([]);
  });

  it('carries no learner prose — notes and feedback are booleans, not text', () => {
    for (const v of verdicts) {
      expect(typeof v.feedbackRedacted).toBe('boolean');
      for (const c of v.criteria) expect(typeof c.noteRedacted).toBe('boolean');
      expect(JSON.stringify(v)).not.toMatch(/"note"|"feedback":\s*"/);
    }
  });
});

describe('the grading input of every production row is pinned', () => {
  it('the baseline table and the fixture describe the same set of rows', () => {
    // Both directions. One direction alone lets a dropped row pass as "one
    // fewer iteration", which is exactly how a fold loses data quietly.
    const inFixture = rows.map(key).sort();
    const inBaseline = BASELINE.map(key).sort();
    expect(inFixture).toEqual(inBaseline);
  });

  it.each(BASELINE.map((b) => [key(b), b] as const))(
    '%s — mode, criteria identity, artifact and legacy keys are unchanged',
    (_k, expected) => {
      const row = rows.find((r) => key(r) === key(expected));
      expect(row, `${key(expected)} is missing from the fixture`).toBeDefined();

      const sig = gradingSignature(row!.rubric);
      expect(sig.mode).toBe(expected.mode);
      expect(sig.criterionIds).toEqual([...expected.criterionIds]);
      expect(sig.artifact).toBe(expected.artifact);
      expect(sig.minWords).toBe(expected.minWords);

      const KNOWN = new Set(['mode', 'criteria', 'artifact', 'min_words']);
      expect(Object.keys(row!.rubric).filter((k) => !KNOWN.has(k)).sort())
        .toEqual([...expected.legacyKeys]);
    }
  );

  it('every derived id is well-formed and unique inside its row', () => {
    const bad: string[] = [];
    for (const row of rows) {
      const ids = criterionIds(row.rubric.criteria as RubricCriterion[] | undefined);
      for (const id of ids) if (!CRITERION_ID_RE.test(id)) bad.push(`${key(row)} — bad id "${id}"`);
      if (new Set(ids).size !== ids.length) bad.push(`${key(row)} — duplicate ids`);
    }
    expect(bad).toEqual([]);
  });

  it('each def and its instance still carry the SAME grading input', () => {
    // 17 of the 18 instances are backfilled 1:1 from a def; the 18th
    // (`dc481679`, draft) has no def. Phase 3e writes the INSTANCE only, so
    // from that moment this equality is expected to break — and it should break
    // HERE, visibly, rather than be discovered by a learner.
    const defs = new Map(rows.filter((r) => r.source === 'activity_defs').map((r) => [
      JSON.stringify(gradingSignature(r.rubric)),
      r.ref,
    ]));
    const unmatched = rows
      .filter((r) => r.source === 'activities')
      .filter((r) => !defs.has(JSON.stringify(gradingSignature(r.rubric))))
      .map((r) => r.ref);
    expect(unmatched).toEqual(['dc481679']);
  });
});

describe('the assertions above can actually fail — sensitivity, not decoration', () => {
  /**
   * A characterization test that never demonstrably fails is decoration. These
   * three cases mutate a copy of a real production rubric and require the
   * signature to move, so the suite proves it is looking at the thing it claims
   * to watch — including the exact mutation the fold risks: a lost criterion.
   */
  const sample = () => rows.find((r) => (r.rubric.criteria as unknown[])?.length >= 3)!;

  it('dropping one criterion changes the signature', () => {
    const row = sample();
    const full = gradingSignature(row.rubric);
    const short = gradingSignature({
      ...row.rubric,
      criteria: (row.rubric.criteria as RubricCriterion[]).slice(1),
    });
    expect(short.criterionIds).not.toEqual(full.criterionIds);
    expect(short.criterionIds.length).toBe(full.criterionIds.length - 1);
  });

  it('reordering the criteria changes the signature', () => {
    const row = sample();
    const reversed = gradingSignature({
      ...row.rubric,
      criteria: [...(row.rubric.criteria as RubricCriterion[])].reverse(),
    });
    expect(reversed.criterionIds).not.toEqual(gradingSignature(row.rubric).criterionIds);
  });

  it('losing the rubric moves EVERY one of the 35 rows off its pinned signature', () => {
    // The literal shape of the failure the plan is guarding against: the column
    // reads `{}` and `judge.ts:75-76` tells the model to invent 2-4 criteria of
    // its own. Asserted row by row rather than in aggregate, because "some rows
    // still differ" is not the property — no row may survive unnoticed.
    const survivors = rows
      .filter((r) => JSON.stringify(gradingSignature({})) === JSON.stringify(gradingSignature(r.rubric)))
      .map(key);
    expect(survivors).toEqual([]);
    expect(gradingSignature({}).criterionIds).toEqual([]);
  });
});

describe('the renderer each production rubric selects', () => {
  const documents = BASELINE.filter((b) => b.kind === 'document');

  it.each(documents.map((b) => [key(b), b] as const))(
    '%s — takes the pinned branch on a judge-capable host',
    (_k, expected) => {
      mount(rows.find((r) => key(r) === key(expected))!, judgingHost());
      if (expected.branch === 'ai-judge') {
        expect(screen.getByTestId('judge-submit')).toBeInTheDocument();
        expect(screen.queryByTestId('document-reflection-input')).toBeNull();
      } else if (expected.branch === 'reflection') {
        expect(screen.getByTestId('document-reflection-input')).toBeInTheDocument();
        expect(screen.queryByTestId('judge-submit')).toBeNull();
      } else {
        expect(screen.queryByTestId('judge-submit')).toBeNull();
        expect(screen.queryByTestId('document-reflection-input')).toBeNull();
      }
    }
  );

  it('losing the rubric would silently demote 10 judged documents to reflection', () => {
    // Not a hypothetical: this is what the 3e window looks like from the
    // PLAYER's side, and it is the LOUD half of the asymmetry in §5.6.1 — the
    // learner still gets a usable activity, so nothing errors, but nobody is
    // grading them any more. The API's half of the same window is silent.
    const judged = documents.filter((b) => b.branch === 'ai-judge');
    expect(judged.length).toBe(20); // 10 instances + 10 defs
    for (const b of judged) {
      const row = rows.find((r) => key(r) === key(b))!;
      mount({ ...row, rubric: {} }, judgingHost());
      expect(screen.getByTestId('document-reflection-input')).toBeInTheDocument();
      expect(screen.queryByTestId('judge-submit')).toBeNull();
      screen.getByTestId('document-reflection-input').ownerDocument.body.innerHTML = '';
    }
  });

  it('the PODIUM would NOT notice the same loss — say so rather than imply coverage', () => {
    // `isExerciseActivity` is the other branch selector on the same rubric, and
    // for this population it is INSENSITIVE: all 12 production documents also
    // carry `spec.prompt`, so `isWrittenDocument` stays true with the rubric
    // emptied. Recording that here is the point — a reader could otherwise
    // assume the podium is a second line of defence. It is not.
    for (const b of documents) {
      const row = rows.find((r) => key(r) === key(b))!;
      expect(isExerciseActivity(asActivity(row))).toBe(true);
      expect(isExerciseActivity(asActivity({ ...row, rubric: {} }))).toBe(true);
    }
  });
});

describe('a RECORDED verdict, replayed — no model is called', () => {
  const judgedRow = () => rows.find((r) => r.ref === '273e631e')!;

  /** The recorded row, widened into the port's verdict shape. */
  function asVerdict(v: FixtureVerdict): ActivityJudgeVerdict {
    return {
      result_id: v.ref,
      activity_id: v.activityRef,
      attempt: v.attempt,
      status: v.status as ActivityJudgeVerdict['status'],
      passed: v.passed,
      score: v.score,
      feedback: v.feedbackRedacted ? 'REDACTED' : '',
      criteria: v.criteria.map((c) => ({ criterion: c.criterion, met: c.met })),
      model: v.model,
      progress_status: v.passed ? 'completed' : 'in_progress',
      judge_available: v.judgeAvailable,
    };
  }

  /**
   * The judged row is a `sandbox_scenario`, whose renderer does not read the
   * rubric — so the replay mounts the AI-judge DOCUMENT surface, which is the
   * only renderer that displays a verdict at all. What is production data here
   * is the VERDICT; the surface is the player's own, and the assertion is that
   * the player shows the recorded verdict faithfully.
   */
  function mountJudging(verdict: ActivityJudgeVerdict, onComplete = vi.fn()) {
    const row = { ...judgedRow(), kind: 'document', specPromptPresent: true };
    const api: ActivityApiPort = {
      judge: vi.fn().mockResolvedValue(verdict),
      listSeeds: vi.fn().mockResolvedValue([]),
    };
    mount(row, api, onComplete);
    return { api, onComplete };
  }

  async function submit(text = 'resposta') {
    await userEvent.type(screen.getByTestId('judge-submission-input'), text);
    await userEvent.click(screen.getByTestId('judge-submit'));
    await waitFor(() => expect(screen.getByTestId('judge-heatmap')).toBeInTheDocument());
  }

  it('production has recorded exactly nine judge verdicts, all on one activity', () => {
    // Small, and that is itself the finding: the whole of the ai-judge path's
    // observed behaviour is nine rows from 2026-07-17/21. Any claim about "the
    // judge in production" rests on this, and should be sized accordingly.
    expect(verdicts.length).toBe(9);
    expect(new Set(verdicts.map((v) => v.activityRef))).toEqual(new Set(['273e631e']));
    expect(verdicts.filter((v) => v.criteria.length > 0).length).toBe(8);
  });

  it.each(verdicts.filter((v) => v.criteria.length > 0).map((v) => [v.ref, v] as const))(
    'verdict %s renders one chip per recorded criterion, with its met flag',
    async (_ref, v) => {
      const { onComplete } = mountJudging(asVerdict(v));
      await submit();

      const chips = screen.getAllByTestId('judge-criterion');
      expect(chips.length).toBe(v.criteria.length);
      expect(chips.map((c) => c.getAttribute('data-met'))).toEqual(
        v.criteria.map((c) => String(c.met))
      );
      expect(chips.map((c) => c.textContent)).toEqual(
        expect.arrayContaining(v.criteria.map((c) => expect.stringContaining(c.criterion)))
      );
      expect(screen.getByTestId('judge-score').textContent).toBe(String(v.score));
      expect(screen.getByTestId('judge-heatmap').getAttribute('data-judge-status')).toBe(v.status);
      // Fluid, not a gate: a fail still records and shows guidance.
      expect(onComplete).toHaveBeenCalledTimes(v.passed ? 1 : 0);
    }
  );

  it('the degraded verdict shows "em revisão" and NO score — the failure that pays nothing', async () => {
    // `bc411231`, 2026-07-21: the judge model 404'd, so the row was stored with
    // `available: false`, `status: pending`, `score: null`, `criteria: []`. It
    // is the one recorded example of the judge not judging, and the player must
    // not present it as a grade of zero.
    const degraded = verdicts.find((v) => v.criteria.length === 0)!;
    expect(degraded.judgeAvailable).toBe(false);
    expect(degraded.score).toBeNull();
    expect(degraded.degradedReason).toContain('judge model HTTP 404');
    // The upstream provider's user id is masked in the fixture, not stored.
    expect(degraded.degradedReason).not.toMatch(/"user_id":"user_/);

    const { onComplete } = mountJudging(asVerdict(degraded));
    await submit();
    expect(screen.queryAllByTestId('judge-criterion')).toEqual([]);
    expect(screen.queryByTestId('judge-score')).toBeNull();
    expect(screen.getByTestId('judge-heatmap').getAttribute('data-judge-status')).toBe('pending');
    // A degraded verdict must not complete the activity either.
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('the verdict does NOT identify the authored criterion — the measured reason for `criterion_id`', () => {
  const authored = () => {
    const row = rows.find((r) => r.ref === '273e631e' && r.source === 'activities')!;
    const texts = new Set<string>();
    for (const c of row.rubric.criteria as RubricCriterion[]) {
      if (typeof c === 'string') texts.add(c);
      else for (const v of Object.values(c)) if (typeof v === 'string') texts.add(v);
    }
    return texts;
  };

  it('four of the eight verdicts echo the rubric verbatim and four rewrite it entirely', () => {
    const texts = authored();
    const perVerdict = verdicts
      .filter((v) => v.criteria.length > 0)
      .map((v) => v.criteria.filter((c) => texts.has(c.criterion)).length);

    // Every verdict is all-or-nothing, and the split is even. Two learner
    // sessions six minutes apart, same activity, same rubric, same model.
    expect(perVerdict.sort()).toEqual([0, 0, 0, 0, 4, 4, 4, 4]);
    expect(perVerdict.filter((n) => n === 4).length).toBe(4);
  });

  it('so matching a verdict to a criterion BY TEXT succeeds exactly half the time', () => {
    // This is the assertion that justifies `feedback.criteria[].criterion_id`
    // in phase 3b. If the fold shipped without it, provenance would be a coin
    // flip — and a coin flip that returns a plausible answer either way.
    const texts = authored();
    const matched = verdicts
      .filter((v) => v.criteria.length > 0)
      .flatMap((v) => v.criteria)
      .filter((c) => texts.has(c.criterion)).length;
    expect(matched).toBe(16);
    expect(matched / (8 * 4)).toBe(0.5);
  });
});
