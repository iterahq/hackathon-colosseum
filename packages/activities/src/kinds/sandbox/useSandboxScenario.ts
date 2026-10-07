import { useRef, useState } from 'react';
import {
  chooseOption,
  collectNeeds,
  composeUserText,
  evaluate,
  initialModel,
  isSuccess,
  resetInputs,
  sendPrompt,
  setSlot,
  t,
  type ChatModel,
  type Locale,
  type Quality,
  type Scenario,
  type StepNeeds,
} from '@iterahq/activity-spec/runtime';
import { seedFallbackRun } from './seedFallbackRun.js';

const NO_NEEDS: StepNeeds = {
  send: false,
  evaluate: false,
  run: false,
  slots: new Set(),
  choices: new Set(),
};

/**
 * Owns the scenario's local `ChatModel` and derives everything the view needs
 * (current step, its mode, per-step gating needs, exposed slots/choices, the
 * composed input text, success). All the judging is the runtime's — this hook
 * only wires reducers to React state and is a no-op once `readOnly` (success
 * reached, revealed, or already completed).
 */
export function useSandboxScenario(
  scenario: Scenario,
  locale: Locale,
  reveal: boolean,
  isDone: boolean,
  /**
   * `chat_rate_reply` (T25): start from ONE seeded run — the author's fallback
   * reply is on screen and the rate panel is up before any send.
   */
  seedRun = false,
) {
  const [model, setModel] = useState<ChatModel>(() => {
    const initial = initialModel(scenario, locale);
    return seedRun ? seedFallbackRun(scenario, initial, locale) : initial;
  });
  // Which compose steps the learner has explicitly clicked the seed chip for —
  // "sempre o usuário tem que inserir" (Tainan): the composer NEVER starts
  // pre-filled with the step's fixed basePrompt. The base prompt only shows up
  // as a clickable chip BELOW the sandbox window; clicking it is what actually
  // inserts it into the composer. Keyed by step id so a later compose step
  // (if the spec ever has one) starts fresh.
  const [seedInsertedSteps, setSeedInsertedSteps] = useState<Set<string>>(() => new Set());

  const won = isSuccess(scenario, model);
  // An activity finished earlier re-opens settled — recap up, nothing left to
  // operate — not as a first step nobody has started.
  const done = won || reveal || isDone;
  const readOnly = done;

  const currentStep = scenario.steps.find((s) => !model.completedSteps.has(s.id)) ?? null;
  const stepIdx = currentStep ? scenario.steps.indexOf(currentStep) : scenario.steps.length;
  const mode = currentStep?.mode ?? 'compose';
  const needs = done ? NO_NEEDS : currentStep ? collectNeeds(currentStep.unlock) : { ...NO_NEEDS, send: true };

  // Exposed choices are shown all at once WITH distractors so the learner has to
  // think, not tap the one right answer; a step may narrow the set via `expose`.
  const exposedSlotIds = currentStep?.expose?.slots ?? [...needs.slots];
  const exposedChoiceIds = currentStep?.expose?.choices ?? [...needs.choices];
  const slots = (scenario.slots ?? []).filter((s) => exposedSlotIds.includes(s.id));
  const choices = (scenario.choices ?? []).filter((c) => exposedChoiceIds.includes(c.id));

  const anySlotFilled = exposedSlotIds.some((id) => (model.slots[id] ?? '').trim() !== '');
  const anyChoiceChosen = exposedChoiceIds.some((id) => model.choicesMade.has(id));
  const slotsReady = slots.every((s) => (model.slots[s.id] ?? '') !== '');
  const choicesReady = choices.length === 0 || choices.some((c) => model.choicesMade.has(c.id));

  // A "pure seed" compose step is one with nothing to build (no exposed
  // slots/choices) — its only content is the scenario's fixed `basePrompt`.
  // That fixed text must NEVER appear pre-filled in the composer; the learner
  // has to click the seed chip below the window first.
  const needsSeedClick = mode === 'compose' && exposedSlotIds.length === 0 && exposedChoiceIds.length === 0;
  const seedInserted = !!currentStep && seedInsertedSteps.has(currentStep.id);
  const seedText = needsSeedClick ? t(scenario.initialState.basePrompt, locale) : undefined;

  // "sempre o usuário tem que inserir" (Tainan) applies to EVERY compose step,
  // not just pure-seed ones: a step that exposes choices/slots must not show
  // the composed preview (which always starts with the fixed `basePrompt`)
  // until the learner has actually picked/filled something — otherwise the
  // base prompt sits there pre-filled the instant the step mounts, before any
  // chip/slot interaction. Once the learner has acted, the full composed text
  // (base + their pick) is exactly what's about to be sent — showing it then
  // is the intended live preview, not a pre-fill.
  const hasComposedSomething = needsSeedClick ? seedInserted : anyChoiceChosen || anySlotFilled;

  const canSend = !readOnly && needs.send && slotsReady && choicesReady && (!needsSeedClick || seedInserted);

  // Whether there's any in-progress compose state (a filled slot, a chosen
  // choice, or an inserted seed, for the CURRENTLY exposed set) worth clearing
  // — the "Limpar" affordance (plan 20260717-iterahq-activities-visual-ux-redesign,
  // P4f). Never touches messages/evaluations/success — purely resets the
  // not-yet-sent composition, mirroring the Git-sandbox LIMPAR pattern.
  const canClear = !readOnly && (anySlotFilled || anyChoiceChosen || (needsSeedClick && seedInserted));

  const revealLines = scenario.reveal.masterLine ?? [];

  const runIndex = model.runs.length - 1;
  const lastRun = model.runs[runIndex] ?? null;
  const lastEval = model.evaluations.find((e) => e.runIndex === runIndex) ?? null;
  const evalWrong = !!lastEval && !lastEval.correct;
  const lastKey = model.lastResultKey;
  const critique = lastKey ? scenario.initialState.cannedResults[lastKey]?.critique : undefined;

  // "só vai mandando" fix — a compose step that demands context (`withContext:
  // true`) silently loops when the learner picks a distractor: the sandbox just
  // replies weakly and the step never advances, with NO "that was weak" signal.
  // We flag a weak send made SINCE arriving at the current step so the compose
  // panel can surface the canned critique + keep the choices open for a re-pick,
  // instead of leaving the learner sending into the void. A step that ACCEPTS a
  // weak send (e.g. the opening "send it as-is" step) advances on it, so `mode`
  // is no longer 'compose' by the time we'd flag — naturally excluding it.
  const stepId = currentStep?.id ?? null;
  const stepEntryRunsRef = useRef(model.runs.length);
  const prevStepIdRef = useRef(stepId);
  if (prevStepIdRef.current !== stepId) {
    prevStepIdRef.current = stepId;
    stepEntryRunsRef.current = model.runs.length;
  }
  const sentThisStep = model.runs.length > stepEntryRunsRef.current;
  const composeWeak = mode === 'compose' && sentThisStep && !!lastRun && !lastRun.withContext;

  const guard = (fn: () => ChatModel) => {
    if (!readOnly) setModel(fn());
  };

  // Toggle the seed chip for the CURRENT compose step — clicking it inserts
  // the fixed basePrompt into the (previously empty) composer; clicking again
  // (or "Limpar") removes it. Mirrors `onChoose`'s toggle semantics.
  const onToggleSeed = () => {
    if (readOnly || !currentStep) return;
    setSeedInsertedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(currentStep.id)) next.delete(currentStep.id);
      else next.add(currentStep.id);
      return next;
    });
  };

  return {
    model,
    won,
    done,
    readOnly,
    currentStep,
    stepIdx,
    mode,
    needs,
    slots,
    choices,
    exposedSlotIds,
    exposedChoiceIds,
    needsSeedClick,
    seedInserted,
    seedText,
    canSend,
    canClear,
    revealLines,
    lastEval,
    evalWrong,
    composeWeak,
    critique,
    // Never pre-filled: until the learner has clicked the seed chip / picked a
    // choice / filled a slot, the composer shows nothing, regardless of what
    // `composeUserText` would produce (it always starts with the fixed
    // basePrompt).
    inputText: hasComposedSomething ? composeUserText(scenario, model, locale) : '',
    onSet: (slot: string, value: string) => guard(() => setSlot(scenario, model, slot, value)),
    // Exposed choices are single-select: picking one clears the siblings so the
    // learner adds ONE thing; tapping the active chip clears it.
    onChoose: (id: string) =>
      guard(() => {
        const cleared = resetInputs(scenario, model, { choices: exposedChoiceIds });
        return model.choicesMade.has(id) ? cleared : chooseOption(scenario, cleared, id);
      }),
    onToggleSeed,
    send: () =>
      guard(() =>
        resetInputs(scenario, sendPrompt(scenario, model, locale), {
          slots: exposedSlotIds,
          choices: exposedChoiceIds,
        }),
      ),
    rate: (q: Quality) => guard(() => evaluate(scenario, model, q)),
    // Clear the current answer's rating so the learner can judge again.
    retry: () => guard(() => ({ ...model, evaluations: model.evaluations.filter((e) => e.runIndex !== runIndex) })),
    // "Limpar" — reset the CURRENTLY exposed slots/choices (and the seed
    // insertion, if any) without sending.
    clear: () => {
      if (readOnly) return;
      if (currentStep && seedInsertedSteps.has(currentStep.id)) {
        setSeedInsertedSteps((prev) => {
          const next = new Set(prev);
          next.delete(currentStep.id);
          return next;
        });
      }
      setModel(resetInputs(scenario, model, { slots: exposedSlotIds, choices: exposedChoiceIds }));
    },
  };
}
