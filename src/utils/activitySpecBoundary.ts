/**
 * FRONTEIRA DE VALIDAÇÃO DE SPEC — os 13 kinds, fail-closed.
 *
 * Origem: Tainan, 2026-07-28 — *"é pra cobrir os 11 kinds então. e não deixar
 * passar CI se criarmos novo kind que não esteja coberto"*. Isto SUPERSEDE a
 * parte do ADR-13 que mandava esta fronteira para o plano irmão de back-office
 * (ver ADR-15 do plano `20260728-itera-activity-testing`).
 *
 * Antes disto, `safeParseActivitySpec` era chamado em apenas 2 dos 11 kinds
 * (`code` em `CodeSnackActivity`, o sandbox no `SandboxScenarioGuard`);
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
 * **REMEDIDO no 0.12.0 (2026-08-09), porque o aperto dos schemas invalida a
 * medição acima:** `itera.activities` = 281 rows, **281 PASSAM**;
 * `itera.activity_defs` = 108 rows, **102 passam e 6 reprovam** — os 6 são
 * sandboxes com `initialState.systemPrompt` objeto onde o schema quer
 * string, e reprovavam IDÊNTICOS no 0.9.0 (defeito de autoria pré-existente, não
 * do aperto). `video` segue com 0 rows.
 *
 * ⚠️ **CORREÇÃO (2026-08-10), snapshot de 435 rows do pacote:** "nenhuma row de
 * `activities` reprova" ficou FALSO — `273e631e`, a trilha BYOC ao vivo, passava
 * no 0.9.0 e reprova no 0.12.1, porque o `.strict()` parou de descartar as chaves
 * da camada BYOC e o `system` dela é bag bilíngue onde o schema de chat quer
 * `z.string()`. Ela não vira card porque a isenção de camada #2 abaixo cobre o
 * caso — mas a isenção precisou ser REPETIDA no `SandboxScenarioGuard`
 * (`ActivityRenderer.tsx`), que é o caminho real do aluno e chamava o parse
 * direto. `LiveActivityRenderer`, o único que a honrava, só é usado pelo harness
 * de autor. Lá a isenção ROTEIA pro `SandboxScenarioLiveActivity`: o spec BYOC
 * não tem `initialState`, e o runtime determinístico quebra sem ele.
 *
 * Os números batem EXATOS no 0.11.0 e no 0.12.0, medidos separadamente: o alias
 * de chat que o 0.12.0 pôs no sandbox não mudou conformance porque todas as rows
 * do kind legado eram de chat.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE "VALIDADO" SIGNIFICA — 13 kinds, ZERO stub desde 0.10.0
 * ────────────────────────────────────────────────────────────────────────────
 * `document`, `diagram` e `quiz` eram `z.record(z.string(), z.unknown())` —
 * stubs LOOSE que faziam `safeParseActivitySpec('quiz', {})` PASSAR, ou seja um
 * quiz sem `options` chegava ao aluno como tela vazia. O
 * `@iterahq/activity-spec` 0.10.0 derivou os três da produção e os apertou, e
 * `KNOWN_STUB_KINDS` está vazia por isso — a lacuna que este arquivo declarava
 * fechou.
 *
 * `auditKindValidationCoverage()` continua CLASSIFICANDO em vez de só contar:
 * a distinção schema-de-verdade × stub é o que tornaria visível uma REGRESSÃO
 * (alguém afrouxar um schema no pacote), e é ela que cobra a atualização
 * deliberada aqui em vez de o repo passar a "cobrir" um kind em silêncio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BYOC É UMA CAMADA, NÃO UM KIND — as duas isenções deliberadas
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **BYOC harness** (`resolveByocSpec`) roda ANTES do switch de kind no
 *    `ActivityRenderer`: o spec de uma activity BYOC é validado pelo
 *    `ByocSpecSchema`, não pelo schema do kind hospedeiro. A isenção é por
 *    ORDEM (a fronteira só é consultada depois que o ramo BYOC não pegou).
 * 2. **BYOC ao vivo** (`isByocLive`) — o contrato do sandbox ao vivo
 *    é deliberadamente NÃO validado por Zod: a resposta vem de um LLM real,
 *    então ele não carrega `cannedResults` e reprovaria no
 *    `SandboxScenarioSpecSchema`. Ele é reconhecido por `isByocLive()` e o
 *    `contractFixtures.ts` o marca `validated: false`. **Validar o sandbox em
 *    bloco quebraria o BYOC ao vivo** — daí a isenção explícita abaixo.
 */
import { ACTIVITY_KINDS, isActivityKind, isImplementedKind } from '@iterahq/activity-spec';
import {
  ONE_BEHAVIOUR_KINDS,
  isOneBehaviourKind,
  kindInvalidTestId,
  safeParseKindSpec,
  specPackageKnowsKind,
  type OneBehaviourKind,
} from '@iterahq/activities';
import type { ActivityKind } from '@/types/content';
// Módulo PURO, React-free (o próprio arquivo se documenta assim) — importável
// de `src/utils` sem arrastar componente nenhum junto.
import { isByocLive } from '@/components/branded/activity/sandbox-live/byocLive';

/**
 * ONDE o `safeParseActivitySpec` daquele kind acontece.
 *
 * - `boundary` — no `ActivityRenderer`, antes do switch (os 9 kinds que não
 *   validavam nada);
 * - `component` — dentro do próprio componente, do jeito histórico. Vale só
 *   para `code` (`CodeSnackActivity`) e os sandboxes
 *   (`SandboxScenarioGuard`). **Não mover para `boundary` sem antes resolver o
 *   BYOC ao vivo** — esses dois já tinham comportamento e testids que outros
 *   testes (e o e2e) dependem.
 */
export type ValidationSite = 'boundary' | 'component';

/**
 * Every kind the Player renders: the installed spec's `ACTIVITY_KINDS` plus the
 * 22 one-behaviour kinds (plan `20260924-activity-type-one-behavior-rule`).
 * On spec `^1.4.0` the second half is already in the first, and the `Set`
 * removes the duplicates — the list is the same either way.
 */
export const KNOWN_ACTIVITY_KINDS: readonly ActivityKind[] = [
  ...new Set<ActivityKind>([...ACTIVITY_KINDS, ...ONE_BEHAVIOUR_KINDS]),
];

/** `isActivityKind`, widened to the one-behaviour kinds. */
export function isKnownActivityKind(kind: unknown): kind is ActivityKind {
  return isActivityKind(kind) || isOneBehaviourKind(kind);
}

/**
 * The one-behaviour kinds validate at the BOUNDARY, all 22 the same way: the
 * friendly card, testid `<kind-with-dashes>-invalid`. Their components keep a
 * gate of their own (`KindSpecGate`) for hosts with no boundary; it shows the
 * same testid, so the two layers are indistinguishable from a test.
 */
const oneBehaviourEntry = (kind: OneBehaviourKind): KindValidation => ({
  site: 'boundary',
  invalidTestId: kindInvalidTestId(kind),
  messageKey: 'activity.specInvalid',
});

const ONE_BEHAVIOUR_VALIDATION = Object.fromEntries(
  ONE_BEHAVIOUR_KINDS.map((kind) => [kind, oneBehaviourEntry(kind)]),
) as Record<OneBehaviourKind, KindValidation>;

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
 * exaustividade, mas ele é **instalado já compilado** (o pacote publica
 * `dist/`; desde 2026-08-04 vem do GitHub Packages em vez de um `.tgz`
 * vendorizado, o que não muda nada aqui) — aquela cláusula NUNCA recompila
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
  // Os dois kinds de sandbox compartilham `site` e testid porque são a MESMA
  // tela: um e2e ou um teste que procura `sandbox-invalid` não deve passar a
  // depender de qual dos dois kinds a row carrega.
  chat_sandbox: {
    site: 'component',
    invalidTestId: 'sandbox-invalid',
    messageKey: 'activity.sandboxInvalid',
  },
  terminal_sandbox: {
    site: 'component',
    invalidTestId: 'sandbox-invalid',
    messageKey: 'activity.sandboxInvalid',
  },
  // `question` (2026-08-28) valida na FRONTEIRA como os outros kinds sem
  // runtime próprio. O schema dele é `.strict()` e exige `mode`, ≥2 opções e um
  // enunciado, então um spec meio-autorado vira card amigável em vez de uma
  // lista de radio buttons sem pergunta.
  question: {
    site: 'boundary',
    invalidTestId: 'question-invalid',
    messageKey: 'activity.specInvalid',
  },
  // The scene kinds (2026-09-24) validate at the BOUNDARY: their schemas are
  // `.strict()`, close the tag set and pin `live_type.target_id` to a real
  // element, so a half-authored scene becomes the friendly card, not a blank stage.
  xray: { site: 'boundary', invalidTestId: 'xray-invalid', messageKey: 'activity.specInvalid' },
  live_type: { site: 'boundary', invalidTestId: 'live-type-invalid', messageKey: 'activity.specInvalid' },
  inspect: { site: 'boundary', invalidTestId: 'inspect-invalid', messageKey: 'activity.specInvalid' },
  // The 22 one-behaviour kinds (T9–T14) — see `ONE_BEHAVIOUR_VALIDATION`.
  ...ONE_BEHAVIOUR_VALIDATION,
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
  if (!specPackageKnowsKind(kind) && !isOneBehaviourKind(kind)) {
    throw new Error(`kind "${kind}" está no enum mas não tem schema em SPEC_SCHEMAS`);
  }
  return safeParseKindSpec(kind, {}).success ? 'stub' : 'schema';
}

/**
 * Os kinds cujo schema ainda é stub loose. **VAZIA desde o 0.10.0**, que apertou
 * os três últimos (`document`, `diagram`, `quiz`).
 *
 * Continua pinada de propósito, agora no sentido inverso: se alguém AFROUXAR um
 * schema no `iterahq/activity-spec`, o teste de cobertura fica vermelho e cobra
 * uma atualização deliberada aqui — em vez de o repo silenciosamente parar de
 * cobrir um kind que ninguém revisou.
 */
export const KNOWN_STUB_KINDS: readonly ActivityKind[] = [];

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
  kinds: readonly string[] = KNOWN_ACTIVITY_KINDS,
): CoverageReport {
  const byKind: KindCoverage[] = kinds.map((kind) => {
    if (!isKnownActivityKind(kind) || !(kind in KIND_VALIDATION)) {
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
  if (!isKnownActivityKind(activity.kind)) return null;

  // Isenção de camada #2 (ver cabeçalho): o BYOC ao vivo não tem contrato Zod.
  // Hoje os sandboxes já são `site: 'component'`, então esta linha é rede de
  // segurança — mas é ELA que impede que uma futura promoção do sandbox para
  // `site: 'boundary'` quebre silenciosamente o caminho ao vivo.
  if (isByocLive(activity)) return null;

  // Cinto de segurança: um kind que entrou no enum mas não no registro NÃO pode
  // estourar em runtime na cara do aluno. Ele cai no `default` do switch →
  // `UnknownActivity` (estado G). Quem grita é a trap — `npm run typecheck` e o
  // `activityKindValidationCoverage.test.tsx` — não a tela do aluno.
  const entry = KIND_VALIDATION[activity.kind] as KindValidation | undefined;
  if (!entry || entry.site !== 'boundary') return null;

  const parsed = safeParseKindSpec(activity.kind, activity.spec);
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
  // A one-behaviour kind the installed spec does not know yet (spec < 1.4.0) is
  // implemented by the fallback of `safeParseKindSpec`, not by the spec.
  if (!specPackageKnowsKind(kind)) return isOneBehaviourKind(kind);
  return isImplementedKind(kind as Parameters<typeof isImplementedKind>[0]);
}
