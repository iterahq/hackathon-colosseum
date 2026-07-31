/**
 * FRONTEIRA DE VALIDAÇÃO DE SPEC — os 12 kinds, fail-closed.
 *
 * Origem: Tainan, 2026-07-28 — *"é pra cobrir os 11 kinds então. e não deixar
 * passar CI se criarmos novo kind que não esteja coberto"*. Isto SUPERSEDE a
 * parte do ADR-13 que mandava esta fronteira para o plano irmão de back-office
 * (ver ADR-15 do plano `20260728-itera-activity-testing`).
 *
 * Antes disto, `safeParseActivitySpec` era chamado em apenas 2 dos 11 kinds
 * (`code` em `CodeSnackActivity`, `sandbox_scenario` no `SandboxScenarioGuard`);
 * os outros 9 faziam cast cru (`activity.spec as unknown as SingleChoiceSpec`) —
 * ou seja, um spec mal-autorado virava crash de runtime em vez do card amigável
 * (estado de borda **F** da matriz do plano).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MEDIÇÃO DE RISCO ANTES DE LIGAR (2026-07-28, DB Itera `kjefmwlopzeaqgqtlbdn`)
 * ────────────────────────────────────────────────────────────────────────────
 * `itera.activities` = 123 rows; `itera.activity_defs` = as mesmas 123 →
 * **246/246 specs reais PASSAM** no schema do seu kind. Zero falhas. Por isso
 * a fronteira entra **direto em fail-closed**, sem fase "observa e depois
 * enforça": o risco que essa fase mitigaria mediu exatamente zero.
 * ⚠️ Limite declarado: `video` tem **0 rows** no banco inteiro — o caminho de
 * validação dele NÃO foi exercido por dado de produção.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE "VALIDADO" SIGNIFICA — 8 kinds de verdade, 3 são stub
 * ────────────────────────────────────────────────────────────────────────────
 * `SPEC_SCHEMAS` do `@iterahq/activity-spec` mapeia `document`, `diagram` e
 * `quiz` para `z.record(z.string(), z.unknown())` — stubs LOOSE deliberados
 * (`src/schemas/stubs.ts` do pacote: *"they keep the historical loose
 * `z.record` contract … but they are NOT validated"*). Consequência prática:
 * `safeParseActivitySpec('quiz', {})` **passa**. Para esses 3 kinds,
 * "validado" hoje quer dizer apenas **"é um objeto JSON"** — o que ainda pega
 * `null` / string / array, mas não pega um quiz sem `options`.
 *
 * Por isso `auditKindValidationCoverage()` CLASSIFICA em vez de só contar: um
 * kind stub NUNCA é reportado como plenamente coberto. Apertar esses 3 schemas
 * é mudança de forma no repo `iterahq/activity-spec` (vendorizado aqui como
 * `vendor/iterahq-activity-spec-0.6.0.tgz`), exige bump de versão + re-vendor,
 * e está FORA de escopo aqui — só declarado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BYOC É UMA CAMADA, NÃO UM KIND — as duas isenções deliberadas
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **BYOC harness** (`resolveByocSpec`) roda ANTES do switch de kind no
 *    `ActivityRenderer`: o spec de uma activity BYOC é validado pelo
 *    `ByocSpecSchema`, não pelo schema do kind hospedeiro. A isenção é por
 *    ORDEM (a fronteira só é consultada depois que o ramo BYOC não pegou).
 * 2. **BYOC ao vivo** (`isByocLive`) — o contrato do `sandbox_scenario` ao vivo
 *    é deliberadamente NÃO validado por Zod: a resposta vem de um LLM real,
 *    então ele não carrega `cannedResults` e reprovaria no
 *    `SandboxScenarioSpecSchema`. Ele é reconhecido por `isByocLive()` e o
 *    `contractFixtures.ts` o marca `validated: false`. **Validar
 *    `sandbox_scenario` em bloco quebraria o BYOC ao vivo** — daí a isenção
 *    explícita abaixo.
 */
import {
  ACTIVITY_KINDS,
  SPEC_SCHEMAS,
  isActivityKind,
  isImplementedKind,
  safeParseActivitySpec,
  type ActivityKind,
} from '@iterahq/activity-spec';
// Módulo PURO, React-free (o próprio arquivo se documenta assim) — importável
// de `src/utils` sem arrastar componente nenhum junto.
import { isByocLive } from '@/components/branded/activity/sandbox-live/byocLive';

/**
 * ONDE o `safeParseActivitySpec` daquele kind acontece.
 *
 * - `boundary` — no `ActivityRenderer`, antes do switch (os 9 kinds que não
 *   validavam nada);
 * - `component` — dentro do próprio componente, do jeito histórico. Vale só
 *   para `code` (`CodeSnackActivity`) e `sandbox_scenario`
 *   (`SandboxScenarioGuard`). **Não mover para `boundary` sem antes resolver o
 *   BYOC ao vivo** — esses dois já tinham comportamento e testids que outros
 *   testes (e o e2e) dependem.
 */
export type ValidationSite = 'boundary' | 'component';

export interface KindValidation {
  site: ValidationSite;
  /** testid do card amigável de spec inválido (estado F). */
  invalidTestId: string;
  /** chave i18n da mensagem do card. */
  messageKey: string;
}

/**
 * ⛔ TRAP DE EXAUSTIVIDADE, NÍVEL DE TIPO ⛔
 *
 * `Record<ActivityKind, …>` sobre o `ActivityKind` do `@iterahq/activity-spec`:
 * adicionar um valor ao enum canônico sem registrar aqui é **erro de
 * compilação** — e `npm run typecheck` é gate de build desde a PR #195.
 *
 * Por que esta trap precisa morar no itera-player e não no pacote: o
 * `@iterahq/activity-spec` documenta uma cláusula `satisfies` interna de
 * exaustividade, mas ele é **vendorizado como `.tgz` já compilado**
 * (`vendor/iterahq-activity-spec-0.6.0.tgz`) — aquela cláusula NUNCA recompila
 * na CI deste repo e nos dá **zero** proteção aqui. Não apague isto como
 * redundante; não é.
 */
export const KIND_VALIDATION: Record<ActivityKind, KindValidation> = {
  // — validados na fronteira (antes: cast cru, zero validação) —
  document: { site: 'boundary', invalidTestId: 'document-invalid', messageKey: 'activity.specInvalid' },
  diagram: { site: 'boundary', invalidTestId: 'diagram-invalid', messageKey: 'activity.specInvalid' },
  quiz: { site: 'boundary', invalidTestId: 'quiz-invalid', messageKey: 'activity.specInvalid' },
  concept: { site: 'boundary', invalidTestId: 'concept-invalid', messageKey: 'activity.specInvalid' },
  concept_reveal: {
    site: 'boundary',
    invalidTestId: 'concept-reveal-invalid',
    messageKey: 'activity.specInvalid',
  },
  single_choice: {
    site: 'boundary',
    invalidTestId: 'single-choice-invalid',
    messageKey: 'activity.specInvalid',
  },
  multi_choice: {
    site: 'boundary',
    invalidTestId: 'multi-choice-invalid',
    messageKey: 'activity.specInvalid',
  },
  match: { site: 'boundary', invalidTestId: 'match-invalid', messageKey: 'activity.specInvalid' },
  order: { site: 'boundary', invalidTestId: 'order-invalid', messageKey: 'activity.specInvalid' },
  video: { site: 'boundary', invalidTestId: 'video-invalid', messageKey: 'activity.specInvalid' },
  // — já validados dentro do componente, comportamento e testid PRESERVADOS —
  code: { site: 'component', invalidTestId: 'code-invalid', messageKey: 'activity.codeInvalid' },
  sandbox_scenario: {
    site: 'component',
    invalidTestId: 'sandbox-invalid',
    messageKey: 'activity.sandboxInvalid',
  },
};

/** As camadas deliberadamente isentas da fronteira (ver cabeçalho). */
export const EXEMPT_LAYERS = ['byoc-harness', 'byoc-live'] as const;
export type ExemptLayer = (typeof EXEMPT_LAYERS)[number];

/**
 * Classe do schema do kind — medida por COMPORTAMENTO, não por lista escrita à
 * mão: um schema que aceita `{}` não discrimina nada, logo é stub.
 */
export type SpecSchemaClass = 'schema' | 'stub';

export function specSchemaClass(kind: ActivityKind): SpecSchemaClass {
  // Mensagem explícita em vez do `TypeError` críptico de dentro do Zod quando um
  // kind do enum não tem schema no pacote — é o cenário exato que a trap existe
  // pra denunciar, e ele merece falhar legível.
  if (!(kind in SPEC_SCHEMAS)) {
    throw new Error(`kind "${kind}" está no enum mas não tem schema em SPEC_SCHEMAS`);
  }
  return safeParseActivitySpec(kind, {}).success ? 'stub' : 'schema';
}

/**
 * Os 3 kinds cujo schema é stub loose HOJE. **Pinado de propósito:** se alguém
 * apertar um desses schemas lá no `iterahq/activity-spec` e re-vendorizar, o
 * teste de cobertura quebra e força uma atualização deliberada aqui (em vez de
 * o repo silenciosamente passar a "cobrir" um kind que ninguém revisou).
 */
export const KNOWN_STUB_KINDS: readonly ActivityKind[] = ['document', 'diagram', 'quiz'];

export interface KindCoverage {
  kind: string;
  /** Há entrada no registro? (false ⇒ kind novo sem cobertura) */
  registered: boolean;
  site: ValidationSite | null;
  invalidTestId: string | null;
  schemaClass: SpecSchemaClass | null;
  /**
   * `true` SÓ quando o kind é validado E o schema realmente discrimina. Um kind
   * stub é validado, mas **não** plenamente coberto.
   */
  fullyCovered: boolean;
}

export interface CoverageReport {
  byKind: KindCoverage[];
  /** Kinds sem entrada no registro — qualquer item aqui deve deixar a CI VERMELHA. */
  missing: string[];
  /** Kinds validados por um schema loose (`z.record`) — cobertura PARCIAL. */
  stubs: string[];
  /** Kinds com schema de verdade. */
  realSchema: string[];
  exemptLayers: readonly ExemptLayer[];
}

/**
 * Audita a cobertura de validação de uma lista de kinds.
 *
 * Recebe a lista por PARÂMETRO (default = `ACTIVITY_KINDS`, a única fonte da
 * verdade) justamente para que o meta-teste consiga provar que a trap dispara,
 * alimentando um kind sintético sem quebrar a CI.
 */
export function auditKindValidationCoverage(
  kinds: readonly string[] = ACTIVITY_KINDS,
): CoverageReport {
  const byKind: KindCoverage[] = kinds.map((kind) => {
    if (!isActivityKind(kind) || !(kind in KIND_VALIDATION)) {
      return {
        kind,
        registered: false,
        site: null,
        invalidTestId: null,
        schemaClass: null,
        fullyCovered: false,
      };
    }
    const entry = KIND_VALIDATION[kind];
    const schemaClass = specSchemaClass(kind);
    return {
      kind,
      registered: true,
      site: entry.site,
      invalidTestId: entry.invalidTestId,
      schemaClass,
      fullyCovered: schemaClass === 'schema',
    };
  });

  return {
    byKind,
    missing: byKind.filter((k) => !k.registered).map((k) => k.kind),
    stubs: byKind.filter((k) => k.schemaClass === 'stub').map((k) => k.kind),
    realSchema: byKind.filter((k) => k.schemaClass === 'schema').map((k) => k.kind),
    exemptLayers: EXEMPT_LAYERS,
  };
}

export interface SpecBoundaryFailure {
  kind: ActivityKind;
  invalidTestId: string;
  messageKey: string;
}

/**
 * O veredito da fronteira. `null` = renderiza normal (spec válido, kind
 * desconhecido — que é do `UnknownActivity`, estado G — camada isenta, ou kind
 * que valida dentro do próprio componente).
 */
export function specBoundaryFailure(activity: {
  kind: string;
  spec: Record<string, unknown>;
}): SpecBoundaryFailure | null {
  // Estado G: kind fora do enum é do `UnknownActivity`, não desta fronteira.
  if (!isActivityKind(activity.kind)) return null;

  // Isenção de camada #2 (ver cabeçalho): o BYOC ao vivo não tem contrato Zod.
  // Hoje `sandbox_scenario` já é `site: 'component'`, então esta linha é rede de
  // segurança — mas é ELA que impede que uma futura promoção do sandbox para
  // `site: 'boundary'` quebre silenciosamente o caminho ao vivo.
  if (isByocLive(activity)) return null;

  // Cinto de segurança: um kind que entrou no enum mas não no registro NÃO pode
  // estourar em runtime na cara do aluno. Ele cai no `default` do switch →
  // `UnknownActivity` (estado G). Quem grita é a trap — `npm run typecheck` e o
  // `activityKindValidationCoverage.test.tsx` — não a tela do aluno.
  const entry = KIND_VALIDATION[activity.kind] as KindValidation | undefined;
  if (!entry || entry.site !== 'boundary') return null;

  const parsed = safeParseActivitySpec(activity.kind, activity.spec);
  if (parsed.success) return null;

  return {
    kind: activity.kind,
    invalidTestId: entry.invalidTestId,
    messageKey: entry.messageKey,
  };
}

/**
 * Espelho em runtime do que `isImplementedKind` do pacote afirma. Usado pelo
 * teste de cobertura para cruzar a lista declarada do pacote com a medição
 * comportamental — se as duas divergirem, alguém mexeu no pacote e a
 * classificação daqui precisa ser revista.
 */
export function packageSaysImplemented(kind: ActivityKind): boolean {
  return isImplementedKind(kind);
}
