/**
 * Activity renderer — dispatches an `itera.activities` row to the right view by
 * `kind`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS LEFT IN THIS FILE, AFTER FASE D
 * ─────────────────────────────────────────────────────────────────────────────
 * This file used to be ~700 lines, and most of them were not dispatch: three
 * kinds (`document`, `diagram`, `quiz`) lived here as inline FUNCTIONS rather
 * than files, which is exactly why Fase C of plan
 * `20260803-itera-player-activities-lib` moved seven kinds and left those three
 * behind — `packages/activities/CONTRACT.md` finding 4 recorded that lifting
 * them touches the one file every other open PR touches.
 *
 * Fase D lifted them. What remains here is the Player's own dispatch, and every
 * line of it is a PLAYER concern that ADR-1 keeps out of the package:
 *
 *  · the BYOC layer resolution — BYOC is a LAYER over any host kind, resolved
 *    from the spec before the kind switch;
 *  · the fail-closed spec VALIDATION boundary (`activitySpecBoundary`), which
 *    belongs BEFORE a renderer: `PortableActivity.spec` is documented as
 *    already validated;
 *  · the kinds that have NOT crossed (`code`, the live/AI sandbox half) and the
 *    sandbox guard.
 *
 * ⚠️ THE KIND SWITCH BELOW IS NOT THE PACKAGE'S DISPATCHER, AND MUST NOT BECOME
 * IT BY DRIFT. `@iterahq/activities` exports its own `<ActivityRenderer>` with
 * the same name; this one wraps the app's extra layers around it. When the last
 * un-extracted kind crosses, this file should DELEGATE to the package's
 * dispatcher rather than keep a parallel switch — a second switch that agrees
 * today is a second switch that disagrees later, silently, for one kind.
 *
 * `spec` shapes for the three that just moved now live with them, as declared
 * interfaces, in `packages/activities/src/specs.ts` — no longer as `as` casts
 * written at the top of a function.
 */
import { useMemo } from 'react';
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import { KIND_VALIDATION, specBoundaryFailure } from '@/utils/activitySpecBoundary';
import type { ActivityCompleteDetail } from './activityFeedbackKinds';
// v1 general learning-activity taxonomy (plan 20260703). These CONVERGE on the
// shared InstructionPanel primitive + the `onComplete(correct)` contract.
import { ConceptActivity } from './ConceptActivity';
import { ConceptRevealActivity } from './ConceptRevealActivity';
import { VideoActivity } from './VideoActivity';
import { SingleChoiceActivity } from './SingleChoiceActivity';
import { MultiChoiceActivity } from './MultiChoiceActivity';
import { MatchActivity } from './MatchActivity';
import { OrderActivity } from './OrderActivity';
import { ChatSandboxActivity } from './ChatSandboxActivity';
import { TerminalSandboxActivity } from './TerminalSandboxActivity';
// Fase D — the three that were inline in this file until now. Imported through
// the app's own paths (one-line re-exports of `@iterahq/activities`) for the
// same reason every Fase C kind is: the extraction is meant to be invisible
// here, and a PR that also rewrote the import sites would have mixed "did the
// move change behaviour?" with "did the rename change behaviour?".
import { DocumentActivity } from './DocumentActivity';
import { DiagramActivity } from './DiagramActivity';
import { QuizActivity } from './QuizActivity';
import { QuestionActivity } from './QuestionActivity';
import { XrayActivity } from './XrayActivity';
import { LiveTypeActivity } from './LiveTypeActivity';
import { InspectActivity } from './InspectActivity';
import { CodeSnackActivity } from './code/CodeSnackActivity';
import {
  ChatComposeActivity,
  ChatFillSelectActivity,
  ChatFillTypeActivity,
  ChatPickContextActivity,
  ChatRateReplyActivity,
  CodeEditorChecksActivity,
  CodeEditorUngradedActivity,
  CodeFillBankActivity,
  CodeFillSelectActivity,
  CodeFillTypeActivity,
  DocumentAiJudgeActivity,
  DocumentReadActivity,
  DocumentReflectActivity,
  QuestionPickManyActivity,
  QuestionPickOneActivity,
  QuestionWriteActivity,
  TerminalBuildCommandActivity,
  TerminalPickCommandActivity,
  TerminalTypeCommandActivity,
} from './OneBehaviourKindActivities';
import { ByocKindActivity, isByocKind } from './byoc/ByocKindActivity';
import { ByocActivity } from './byoc/ByocActivity';
import { PersonalizationGate } from './PersonalizationGate';
import { usePersonalization } from '@/personalization/personalizationPort';
import { usePersonalizedActivity } from '@/personalization/usePersonalizedActivity';
import { missingFields } from '@/utils/personalization';
import { InvalidSpecCard } from './InvalidSpecCard';
import { resolveByocSpec } from './byoc/byocSpec';
import { isByocLive } from './sandbox-live/byocLive';
import { SandboxScenarioLiveActivity } from './sandbox-live/SandboxScenarioLiveActivity';
import { iteraApiConfigured } from '@/api/iteraApi';

export function ActivityRenderer({
  activity: authored,
  onComplete,
  reveal = false,
  live = false,
}: {
  activity: Activity;
  /**
   * `detail` carries the richer verdict AND the produced content / answer
   * summary. It was already being passed by the document activities since PR
   * #191, but the type said otherwise — a latent `TS2554` that only stayed
   * invisible because `npm run build` is `vite build` (no typecheck).
   */
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
  /** Reveal the correct answer (timer stopped/expired) even without a submission. */
  reveal?: boolean;
  /**
   * Live class vs. self-paced. Only the `code` snack reads it today, to gate the
   * "seguir mesmo assim" skip on a failed practical (live only).
   */
  live?: boolean;
}) {
  const { locale } = useI18n();
  const { values, mayAsk } = usePersonalization();

  /*
   * PERSONALIZAÇÃO POR PREENCHIMENTO — a via rápida do "conteúdo com a cara do
   * aluno". O autor escreveu `{{familiar.nome}}`; aqui isso vira o nome que o
   * aluno deu, em TODO o spec de uma vez (varredura de strings em qualquer
   * profundidade). Sem modelo, sem chamada de rede, sem espera — ao contrário
   * do BYOC gerativo, que mede 26–73s por atividade.
   *
   * Fica ANTES do BYOC e antes da fronteira de validação porque o que corre daí
   * pra baixo tem que ser o texto que o aluno vai LER: um token cru vazando
   * para o schema, para o judge ou para a tela é o mesmo defeito.
   */
  const activity = usePersonalizedActivity(authored);

  /*
   * Só o que ESTA atividade cita e o aluno ainda não preencheu.
   *
   * NUNCA ao vivo: lá o cronômetro já está correndo, e três campos entre o aluno
   * e o exercício custam a atividade inteira. Na aula o elenco cai no fallback e
   * a pergunta espera o /profile.
   */
  const missing = useMemo(
    () => (mayAsk && !live ? missingFields(authored.spec, values) : []),
    [mayAsk, live, authored.spec, values]
  );
  if (missing.length > 0) {
    return <PersonalizationGate fields={missing} />;
  }

  // The three BYOC KINDS (T13) come BEFORE the layer: their spec carries
  // `byoc` too, and the layer below would otherwise take them — and, with the
  // itera-api unconfigured, hand them to the host kind's card. The kind renders
  // its own interaction or an explicit state, never another kind.
  if (isByocKind(activity.kind)) {
    return <ByocKindActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
  }

  // BYOC is a LAYER, not a kind: an activity of ANY kind whose spec carries an
  // authored harness is generated from the learner's own context first.
  // ⚠️ DEPRECATED (plan `20260924-activity-type-one-behavior-rule`, ADR-4): the
  // layer stays for the transition window only; new content uses `byoc_*`.
  const byoc = resolveByocSpec(activity, locale);
  if (byoc) {
    return <ByocActivity activity={activity} spec={byoc} onComplete={onComplete} reveal={reveal} />;
  }

  // FRONTEIRA DE VALIDAÇÃO DE SPEC — fail-closed nos 13 kinds (estado F).
  // Fica DEPOIS do ramo BYOC de propósito: BYOC é uma CAMADA, não um kind, e o
  // spec dele é validado pelo `ByocSpecSchema`, não pelo schema do kind
  // hospedeiro. `code` e os dois sandboxes continuam validando dentro do
  // próprio componente (`site: 'component'`), com os testids históricos
  // intactos. Racional completo + medição (246/246 specs reais passam) em
  // `src/utils/activitySpecBoundary.ts`.
  const invalidSpec = specBoundaryFailure(activity);
  if (invalidSpec) {
    return (
      <InvalidSpecCard
        kind={invalidSpec.kind}
        testId={invalidSpec.invalidTestId}
        messageKey={invalidSpec.messageKey}
      />
    );
  }

  switch (activity.kind) {
    case 'document':
      return <DocumentActivity activity={activity} onComplete={onComplete} />;
    case 'diagram':
      return <DiagramActivity activity={activity} onComplete={onComplete} />;
    case 'quiz':
      return <QuizActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'code':
      // O `reveal` só tem efeito no `code` GUIADO, onde `blanks[].answer` é um
      // gabarito escrito pelo autor; no editor aberto ele morre dentro do
      // componente, porque não existe solução a mostrar. Passar sempre mantém a
      // decisão num lugar só (`CodeActivity`) em vez de espalhar a mesma
      // pergunta pelo dispatcher.
      return <CodeSnackActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    // v1 general learning-activity taxonomy:
    case 'concept':
      return <ConceptActivity activity={activity} onComplete={onComplete} />;
    case 'concept_reveal':
      return (
        <ConceptRevealActivity
          activity={activity}
          onComplete={onComplete}
          live={live}
          reveal={reveal}
        />
      );
    case 'video':
      return <VideoActivity activity={activity} onComplete={onComplete} />;
    case 'single_choice':
      return <SingleChoiceActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'multi_choice':
      return <MultiChoiceActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'match':
      return <MatchActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'order':
      return <OrderActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'chat_sandbox':
    case 'terminal_sandbox':
      return <SandboxScenarioGuard activity={activity} onComplete={onComplete} reveal={reveal} />;
    // `reveal` NÃO é passado, e a omissão é o contrato: uma pergunta não tem
    // resposta certa, então não há gabarito a expor. `hasRevealableAnswer`
    // devolve false pro kind, logo o botão do professor nem aparece.
    case 'question':
      return <QuestionActivity activity={activity} onComplete={onComplete} />;
    // The scene kinds: ungraded, gesture-gated, no `reveal` (nothing to expose).
    case 'xray':
      return <XrayActivity activity={activity} onComplete={onComplete} />;
    case 'live_type':
      return <LiveTypeActivity activity={activity} onComplete={onComplete} />;
    case 'inspect':
      return <InspectActivity activity={activity} onComplete={onComplete} />;
    // ── The ONE-BEHAVIOUR kinds (plan `20260924-activity-type-one-behavior-rule`,
    // T9–T14). The KIND names the surface; nothing below sniffs the spec. All
    // of them passed the boundary above (`site: 'boundary'`).
    // code (T9) — `reveal` reaches the fill kinds (an authored answer exists)
    // and stops at the open editor, exactly as in `CodeActivity`.
    case 'code_editor_checks':
      return <CodeEditorChecksActivity activity={activity} onComplete={onComplete} />;
    case 'code_editor_ungraded':
      return <CodeEditorUngradedActivity activity={activity} onComplete={onComplete} />;
    case 'code_fill_bank':
      return <CodeFillBankActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'code_fill_select':
      return <CodeFillSelectActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'code_fill_type':
      return <CodeFillTypeActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    // chat (T10) — the deterministic runtime only: these kinds refuse the
    // live-model layer, so the live branch of `SandboxScenarioGuard` is not here.
    case 'chat_compose':
      return <ChatComposeActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'chat_fill_select':
      return <ChatFillSelectActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'chat_fill_type':
      return <ChatFillTypeActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'chat_pick_context':
      return <ChatPickContextActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'chat_rate_reply':
      return <ChatRateReplyActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    // terminal (T11)
    case 'terminal_type_command':
      return <TerminalTypeCommandActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'terminal_pick_command':
      return <TerminalPickCommandActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    case 'terminal_build_command':
      return <TerminalBuildCommandActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
    // document (T12) — `document_ai_judge` with no judge port is an explicit
    // "unavailable" card, never the reflection.
    case 'document_read':
      return <DocumentReadActivity activity={activity} onComplete={onComplete} />;
    case 'document_reflect':
      return <DocumentReflectActivity activity={activity} onComplete={onComplete} />;
    case 'document_ai_judge':
      return <DocumentAiJudgeActivity activity={activity} onComplete={onComplete} />;
    // question (T14) — no `reveal`: no correct answer to expose.
    case 'question_pick_one':
      return <QuestionPickOneActivity activity={activity} onComplete={onComplete} />;
    case 'question_pick_many':
      return <QuestionPickManyActivity activity={activity} onComplete={onComplete} />;
    case 'question_write':
      return <QuestionWriteActivity activity={activity} onComplete={onComplete} />;
    default:
      return <UnknownActivity activity={activity} />;
  }
}

/**
 * Validate the sandbox `spec` against the shared per-kind Zod schema before
 * handing it to the runtime — an authoring mistake renders a friendly card
 * instead of a runtime crash. Valid specs pass straight through.
 */
function SandboxScenarioGuard({
  activity,
  onComplete,
  reveal,
}: {
  activity: Activity;
  onComplete: (c: boolean) => void;
  reveal?: boolean;
}) {
  // Valida pelo kind da própria activity: uma row `terminal_sandbox` reprovaria
  // no schema do chat, que é justamente o que a divisão dos dois kinds existe
  // para separar.
  const kind = activity.kind as 'chat_sandbox' | 'terminal_sandbox';
  // Mesma isenção de camada que `specBoundaryFailure` já aplica: o BYOC ao vivo
  // não tem contrato Zod, e o `system` dele é o bag bilíngue que o schema de chat
  // declara `z.string()`. No 0.9.0 as chaves da camada eram descartadas em
  // silêncio e a row passava; com `.strict()` ela reprovaria — e é esta a porta
  // por onde o aluno entra (`LiveActivityRenderer` só é usado pelo harness de
  // autor). Sem isto, a row `273e631e` da trilha BYOC vira card de spec inválido.
  // O destino é o componente AO VIVO, não o runtime determinístico: este spec não
  // tem `initialState`, e o runtime compartilhado quebra sem ele. Sem a API de
  // resultados configurada não há caminho ao vivo — cai no parse, fail-closed.
  if (isByocLive(activity) && iteraApiConfigured()) {
    return (
      <SandboxScenarioLiveActivity activity={activity} onComplete={onComplete} reveal={reveal} />
    );
  }
  const parsed = safeParseActivitySpec(kind, activity.spec);
  if (!parsed.success) {
    // Mesmo card, mesmo testid — agora pela primitiva compartilhada (a mensagem
    // saiu do literal PT hardcoded para o i18n, sem mudar o texto pt-BR).
    return (
      <InvalidSpecCard
        kind={kind}
        testId={KIND_VALIDATION[kind].invalidTestId}
        messageKey={KIND_VALIDATION[kind].messageKey}
      />
    );
  }
  if (kind === 'terminal_sandbox') {
    return <TerminalSandboxActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
  }
  return <ChatSandboxActivity activity={activity} onComplete={onComplete} reveal={reveal} />;
}

function UnknownActivity({ activity }: { activity: Activity }) {
  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-activity-kind="unknown"
    >
      Unsupported activity kind: {activity.kind}
    </div>
  );
}
