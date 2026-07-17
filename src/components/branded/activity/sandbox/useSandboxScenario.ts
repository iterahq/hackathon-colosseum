import { useState } from 'react';
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
  type ChatModel,
  type Locale,
  type Quality,
  type Scenario,
  type StepNeeds,
} from '@iterahq/activity-spec/runtime';

const NO_NEEDS: StepNeeds = { send: false, evaluate: false, slots: new Set(), choices: new Set() };

/**
 * Owns the scenario's local `ChatModel` and derives everything the view needs
 * (current step, its mode, per-step gating needs, exposed slots/choices, the
 * composed input text, success). All the judging is the runtime's — this hook
 * only wires reducers to React state and is a no-op once `readOnly` (success
 * reached, revealed, or already completed).
 */
export function useSandboxScenario(scenario: Scenario, locale: Locale, reveal: boolean, isDone: boolean) {
  const [model, setModel] = useState<ChatModel>(() => initialModel(scenario, locale));

  const won = isSuccess(scenario, model);
  const done = won || reveal;
  const readOnly = done || isDone;

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

  const slotsReady = slots.every((s) => (model.slots[s.id] ?? '') !== '');
  const choicesReady = choices.length === 0 || choices.some((c) => model.choicesMade.has(c.id));
  const canSend = !readOnly && needs.send && slotsReady && choicesReady;

  const revealLines = scenario.reveal.masterLine ?? [];

  const runIndex = model.runs.length - 1;
  const lastEval = model.evaluations.find((e) => e.runIndex === runIndex) ?? null;
  const evalWrong = !!lastEval && !lastEval.correct;
  const lastKey = model.lastResultKey;
  const critique = lastKey ? scenario.initialState.cannedResults[lastKey]?.critique : undefined;

  const guard = (fn: () => ChatModel) => {
    if (!readOnly) setModel(fn());
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
    canSend,
    revealLines,
    lastEval,
    evalWrong,
    critique,
    inputText: composeUserText(scenario, model, locale),
    onSet: (slot: string, value: string) => guard(() => setSlot(scenario, model, slot, value)),
    // Exposed choices are single-select: picking one clears the siblings so the
    // learner adds ONE thing; tapping the active chip clears it.
    onChoose: (id: string) =>
      guard(() => {
        const cleared = resetInputs(scenario, model, { choices: exposedChoiceIds });
        return model.choicesMade.has(id) ? cleared : chooseOption(scenario, cleared, id);
      }),
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
  };
}
