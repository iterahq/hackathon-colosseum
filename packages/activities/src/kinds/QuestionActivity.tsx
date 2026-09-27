/**
 * QUESTION — a NON-GRADING ask. It asks a person something and records what
 * they said. There is no correct answer, no score, and NO VERDICT UI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT DELIBERATELY DOES NOT DO, AND WHY EACH ABSENCE IS LOAD-BEARING
 * ═══════════════════════════════════════════════════════════════════════════
 * This file is a copy of the `single_choice` / `multi_choice` SKELETON — the
 * shell, the option grid, the one-step submit, the action recorder. Four things
 * from that skeleton are missing on purpose. Adding any of them back turns an
 * opinion into a wrong answer.
 *
 *  1. **No `answerMachine`.** That machine exists to decide WHEN a verdict may
 *     reach the screen. There is no verdict here, so there is no question for
 *     it to answer. The only state that matters is: has the person submitted?
 *
 *  2. **No `choiceOptionState`, no green/red, no tick, no cross.** A
 *     `recommended_option_id` renders as a subtle `★ recomendado` marker BEFORE
 *     the submit and stays exactly as subtle after it. It is what the ASKER
 *     leans toward — never a mark against what the person chose.
 *
 *  3. **No `AnswerExplanation`.** `spec.explanation` does not exist on this
 *     kind (the schema rejects it), because "why the answer is the answer"
 *     presumes an answer.
 *
 *  4. **No shuffle.** Every other option-bearing kind calls `learnerShuffle`, to
 *     stop position from being copyable. Here the ORDER IS AUTHORED CONTENT: an
 *     asker puts the leading option first and the fallback last, and the
 *     plans-app addresses the same options by LETTER (`A`, `B`, `C`). Shuffling
 *     would make "option B" mean a different thing per reader.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ANSWER — options AND/OR text, either alone is complete
 * ═══════════════════════════════════════════════════════════════════════════
 * Free text is available unless the CALLER turns it off; `spec.free_text` only
 * relabels the field. The "Outro" toggle is available unless the caller turns
 * it off or `allow_other === false`. So a person can answer with options, with
 * prose, or with both — and both together is the common case ("B, but only if
 * the adapter stays").
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CALLER DECIDES "OUTRO" AND THE NOTES BOX (`callerOptions`, 1.3.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * Plan `20260924-activity-type-one-behavior-rule`, T23, Tainan's answer to
 * Q-R2-4 (2026-09-25): *"deixa customizavel pelo caller (ou seja itera-player
 * nunca usaria isso, mas plans-app consegue 'solicitar' componente dessa forma,
 * com o other)"*. Free typing beside the options is a second input, so an
 * AUTHORED spec may not ask for it on the one-behaviour kinds. A HOST may: it
 * is a property of the surface (the plans-app inbox), not of the content.
 *
 * Precedence, per field: the caller prop wins; when it is absent, today's spec
 * behaviour holds (`allow_other` default true, notes box on). The Itera Player
 * never passes the prop — `ActivityRenderer` does not forward it.
 *
 * `QuestionActivityBody` is the same body as a CONTROLLED component (the
 * option cards, "Outro", the notes box), for a host whose chrome owns the
 * state and the save — the plans-app. `QuestionActivity` renders through it,
 * so the two cannot drift.
 *
 * What travels up on submit:
 *
 *   `response`  the free text VERBATIM. Nothing else.
 *   `actions`   … `answer_submitted` with
 *               `{ option_ids: string[], other: boolean, has_text: boolean }`
 *
 * ⚠️ **THE TEXT IS NOT IN THE TRACE PAYLOAD, AND THAT IS THE REPO'S RULE, NOT A
 * DESIGN PREFERENCE.** `PAYLOADS_CARRY_NO_FREE_TEXT` in the host's
 * `activityFamilies.ts` states it: *"A trace payload carries WHICH thing the
 * learner touched and WHEN, never WHAT they wrote. The learner's answer text has
 * exactly one home … duplicating it into the trace would mean two places to keep
 * in step and two places to purge."* A question's free text is a person's prose
 * — the exact category the rule protects — unlike the terminal sandbox's
 * `command_run.command`, whose documented carve-out rests on a shell command
 * being TOOL VOCABULARY.
 *
 * So the machine-readable half rides in `actions` and the prose rides in
 * `response`, which is where `ActivityCompletion` already puts answer text. The
 * two together are the whole answer, and they map 1:1 onto the plans-app's
 * persistence contract: `option_ids` ↔ `selected_option_letters[]`, `other` ↔
 * the reserved `OTHER` sentinel, `response` ↔ `freeform_notes`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RESTORE (`priorAnswer`)
 * ═══════════════════════════════════════════════════════════════════════════
 * Symmetric with every other kind: the host persists the whole
 * `ActivityCompletion` and hands the same value back down. Selections and the
 * "Outro" flag come from the trace (ids validated against the AUTHORED option
 * list, per `../internal/priorAnswer.ts`); the text comes from `response`.
 *
 * Reading `response` is forbidden for the GRADED kinds and correct here, and
 * the difference is stated in `priorAnswer.ts`: there, `response` is a summary
 * built from localized authored LABELS, so it cannot be keyed back to an option.
 * Here it is the person's own words, verbatim — nothing was summarised, so
 * nothing has to be un-summarised.
 *
 * And the reason it is safe at all is that this kind has NO VERDICT to restore.
 * The whole `priorAnswer` hazard — replaying a state that paints a green tick
 * nobody earned — cannot arise where nothing is ever painted green.
 */
import { useState, type ReactNode } from 'react';
import { MessageCircleQuestion, Star } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { QuestionSpec } from '../specs.js';
import {
  useActivityActionRecorder,
  type InquiryAction,
} from '../internal/actionRecorder.js';
import { priorOptionIds, priorOther, priorText } from '../internal/priorAnswer.js';

import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityTextarea } from '../components/ActivityTextarea.js';
import { RichText } from '../components/RichText.js';
import { ActivityShell, SubmitButton } from '../components/parts.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

/**
 * The reserved id for "Outro". It is not an authored option — it is the escape
 * hatch — so it lives in ONE constant rather than as a string literal in the
 * three places that test for it.
 *
 * Uppercase because that is the sentinel the plans-app already stores in
 * `selected_option_letters[]`. An adapter that has to translate a sentinel is
 * an adapter that can translate it wrongly.
 */
export const QUESTION_OTHER_ID = 'OTHER';

/** Free-text ceiling. The same order of magnitude the plans-app accepts. */
const MAX_QUESTION_TEXT = 4000;

/**
 * What a CALLER (a host, never an author) may ask of the question body.
 * Each field is optional; an absent field keeps the spec behaviour.
 */
export interface QuestionCallerOptions {
  /**
   * Show the "Outro" card. Wins over `spec.allow_other` in BOTH directions.
   * Absent → `spec.allow_other !== false` (the schema default is `true`).
   */
  allowOther?: boolean;
  /**
   * Show the free-text notes box. Absent → shown (today's behaviour).
   * With `false`, text is no longer a way to answer: a selection or "Outro"
   * is required.
   */
  allowNotes?: boolean;
}

/** The two inputs a render shows, after the precedence rule. Pure. */
export function resolveQuestionInputs(
  spec: Pick<QuestionSpec, 'allow_other'> | undefined,
  callerOptions?: QuestionCallerOptions,
): { allowOther: boolean; allowNotes: boolean } {
  return {
    // Absent means allowed: the schema defaults `allow_other` to `true`, and a
    // spec that reached this renderer without going through the schema (a host
    // that composed one by hand) should get the permissive reading too.
    allowOther: callerOptions?.allowOther ?? spec?.allow_other !== false,
    allowNotes: callerOptions?.allowNotes ?? true,
  };
}

/** One option as the controlled body draws it. */
export interface QuestionBodyOption {
  /** What `onToggle` reports and `selected` holds (a plans-app letter, or a spec id). */
  id: string;
  label?: ReactNode;
  description?: ReactNode;
}

export interface QuestionActivityBodyProps {
  /** Authored options, in authored order — never shuffled (order is content). */
  options: QuestionBodyOption[];
  /** true → pick any number; false → pick one. */
  multi: boolean;
  /** Ids that carry the `★ recomendado` marker. A marker, never a verdict. */
  recommendedIds?: readonly string[];
  /** Selected ids, INCLUDING `QUESTION_OTHER_ID` when "Outro" is on. */
  selected: readonly string[];
  /** The notes text. */
  notes: string;
  /** A tap on an option or on "Outro" (`QUESTION_OTHER_ID`). The caller applies it. */
  onToggle: (id: string) => void;
  onNotesChange: (value: string) => void;
  disabled?: boolean;
  /** Caller-level switches — see `QuestionCallerOptions`. */
  callerOptions?: QuestionCallerOptions;
  /**
   * The spec's `allow_other`, when the caller has a spec. Only read when
   * `callerOptions.allowOther` is absent.
   */
  specAllowOther?: boolean;
  notesLabel?: string;
  notesPlaceholder?: string;
  notesRows?: number;
  /** Label for "Outro". Default: the package string (`activity.question.other`). */
  otherLabel?: ReactNode;
  /** Makes the notes `<label htmlFor>` unique per mount. */
  fieldId?: string;
  /**
   * The eyebrow above the options. `with-free-text` (default) keeps the
   * historical "…, or write your own"; `options-only` is for the one-behaviour
   * pick kinds, which carry no free text (T14); `none` hides it
   * (`question_write` has no options to pick).
   */
  pickHint?: 'with-free-text' | 'options-only' | 'none';
}

function OptionBody({ option }: { option: QuestionBodyOption }) {
  return (
    <span className="flex-1 min-w-0">
      <span className="block whitespace-normal break-words">{option.label}</span>
      {option.description && (
        <span className="mt-1 block text-sm text-muted-foreground whitespace-normal break-words">
          {option.description}
        </span>
      )}
    </span>
  );
}

/**
 * The question body as a CONTROLLED component: the pick hint, the option
 * cards, the "Outro" card and the notes box. It owns no state and never
 * submits. `QuestionActivity` renders through it.
 */
export function QuestionActivityBody({
  options,
  multi,
  recommendedIds = [],
  selected,
  notes,
  onToggle,
  onNotesChange,
  disabled = false,
  callerOptions,
  specAllowOther,
  notesLabel,
  notesPlaceholder,
  notesRows = 3,
  otherLabel,
  fieldId = 'question-text',
  pickHint = 'with-free-text',
}: QuestionActivityBodyProps) {
  const { t } = useActivityI18n();
  const { allowOther, allowNotes } = resolveQuestionInputs(
    { allow_other: specAllowOther },
    callerOptions,
  );
  const other = selected.includes(QUESTION_OTHER_ID);
  const label = notesLabel ?? t('activity.question.notesLabel');

  return (
    <>
      {pickHint !== 'none' && (
        <p className="mt-5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {pickHint === 'options-only'
            ? multi
              ? t('activity.question.pickAnyOnly')
              : t('activity.question.pickOneOnly')
            : multi
              ? t('activity.question.pickAny')
              : t('activity.question.pickOne')}
        </p>
      )}

      <div className="mt-3 grid gap-2.5" data-testid="question-options">
        {options.map((o) => {
          const chosen = selected.includes(o.id);
          const recommended = recommendedIds.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(o.id)}
              data-testid="question-option"
              // The AUTHORED id — what the answer records, and what an adapter
              // maps onto a plans-app option letter.
              data-option-id={o.id}
              data-selected={chosen ? 'true' : undefined}
              data-recommended={recommended ? 'true' : undefined}
              className={`w-full flex items-start gap-3 py-4 px-5 rounded-2xl border text-left transition-colors ${
                chosen
                  ? 'border-menta bg-menta/10'
                  : 'border-border bg-card hover:border-verde-tech/50 disabled:opacity-70'
              }`}
            >
              <span
                className={`w-5 h-5 flex-shrink-0 mt-0.5 border flex items-center justify-center ${
                  multi ? 'rounded-md' : 'rounded-full'
                } ${chosen ? 'border-menta bg-menta/20' : 'border-muted-foreground/40'}`}
              >
                {chosen && <span className="w-2 h-2 rounded-full bg-menta" />}
              </span>
              <OptionBody option={o} />
              {recommended && (
                // A MARKER, not a verdict. Same muted weight before and after
                // the submit — see (2) in the header.
                <span
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground"
                  data-testid="question-recommended"
                >
                  <Star className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('activity.question.recommended')}
                </span>
              )}
            </button>
          );
        })}

        {allowOther && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(QUESTION_OTHER_ID)}
            data-testid="question-other"
            data-option-id={QUESTION_OTHER_ID}
            data-selected={other ? 'true' : undefined}
            className={`w-full flex items-start gap-3 py-4 px-5 rounded-2xl border border-dashed text-left transition-colors ${
              other
                ? 'border-menta bg-menta/10'
                : 'border-border bg-card hover:border-verde-tech/50 disabled:opacity-70'
            }`}
          >
            <span
              className={`w-5 h-5 flex-shrink-0 mt-0.5 border flex items-center justify-center ${
                multi ? 'rounded-md' : 'rounded-full'
              } ${other ? 'border-menta bg-menta/20' : 'border-muted-foreground/40'}`}
            >
              {other && <span className="w-2 h-2 rounded-full bg-menta" />}
            </span>
            <span className="flex-1 min-w-0">{otherLabel ?? t('activity.question.other')}</span>
          </button>
        )}

        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('activity.noOptions')}</p>
        )}
      </div>

      {/* Rendered unless the CALLER turns it off. No SPEC field hides it. */}
      {allowNotes && (
        <div className="mt-5">
          <label className="block text-sm text-muted-foreground" htmlFor={fieldId}>
            {label}
          </label>
          <ActivityTextarea
            data-testid="question-text"
            aria-label={label}
            value={notes}
            onChange={onNotesChange}
            rows={notesRows}
            maxLength={MAX_QUESTION_TEXT}
            disabled={disabled}
            placeholder={notesPlaceholder ?? t('activity.question.notesPlaceholder')}
            className="mt-2"
          />
        </div>
      )}
    </>
  );
}

export function QuestionActivity({
  activity,
  onComplete,
  priorAnswer,
  callerOptions,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  priorAnswer?: ActivityCompletion;
  /**
   * Host-level switches for "Outro" and the notes box (1.3.0). The caller
   * wins; absent keeps the spec behaviour. The Itera Player never passes it.
   */
  callerOptions?: QuestionCallerOptions;
}) {
  const spec = activity.spec as unknown as QuestionSpec;
  const { allowOther, allowNotes } = resolveQuestionInputs(spec, callerOptions);
  return (
    <QuestionView
      activity={activity}
      onComplete={onComplete}
      priorAnswer={priorAnswer}
      multi={spec?.mode === 'multi'}
      withOptions
      allowOther={allowOther}
      allowNotes={allowNotes}
    />
  );
}

/**
 * The one screen behind `question` and the three one-behaviour question kinds
 * (T14). Every input is decided by the CALLER of this view — the transition
 * kind reads `mode` / `allow_other` off the spec, the new kinds pin them.
 */
export function QuestionView({
  activity,
  onComplete,
  priorAnswer,
  multi,
  withOptions,
  allowOther,
  allowNotes,
  pickHint = 'with-free-text',
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  priorAnswer?: ActivityCompletion;
  pickHint?: QuestionActivityBodyProps['pickHint'];
  multi: boolean;
  /** `false` only for `question_write`: the free answer is the whole input. */
  withOptions: boolean;
  allowOther: boolean;
  allowNotes: boolean;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as QuestionSpec;
  // AUTHORED ORDER — see (4) in the header. No `learnerShuffle` here.
  const options = withOptions ? (spec?.options ?? []) : [];

  const authoredIds = options.map((o) => o.id);
  // Ids the trace may legitimately name: the authored ones plus the sentinel.
  // Passing the sentinel through `priorOptionIds` would otherwise drop the
  // WHOLE payload, because that helper rejects any id the spec does not declare.
  const [restored] = useState(() => {
    const ids = priorOptionIds(priorAnswer, [...authoredIds, QUESTION_OTHER_ID]);
    const other = priorOther(priorAnswer) || (ids?.includes(QUESTION_OTHER_ID) ?? false);
    return {
      ids: (ids ?? []).filter((id) => id !== QUESTION_OTHER_ID),
      other,
      text: priorText(priorAnswer) ?? '',
      any: Boolean(ids) || other || Boolean(priorText(priorAnswer)),
    };
  });

  const [selected, setSelected] = useState<string[]>(restored.ids);
  const [other, setOther] = useState(restored.other);
  const [text, setText] = useState(restored.text);
  const [submitted, setSubmitted] = useState(false);

  const trace = useActivityActionRecorder<InquiryAction>(activity.id);

  // A `done` activity that carried a replayable answer renders as answered.
  // Without one it renders as a fresh, locked screen — the same degradation
  // every other kind has, and it is NOT a verdict, only a lock.
  const settled = submitted || (activity.status === 'done' && restored.any);
  const locked = submitted || activity.status === 'done';

  // What the answer may hold is what the screen SHOWS: a hidden "Outro" or a
  // hidden notes box cannot carry a restored value into the submit.
  const otherOn = allowOther && other;
  const body = allowNotes ? text.trim() : '';
  // ANY of the three is a complete answer. This is the whole difference from
  // the choice family's `submitDisabled`, which requires a selection.
  const hasAnswer = selected.length > 0 || otherOn || body.length > 0;

  function toggleOption(id: string) {
    // Recorded BEFORE the setState and read off `selected`, never inside the
    // updater: React StrictMode double-invokes updaters in dev, so a side
    // effect in there would write every action twice.
    const on = selected.includes(id);
    trace.record(on ? 'option_unmarked' : 'option_marked', { option_id: id });
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // `single` mode REPLACES rather than accumulates. It does not clear the
      // free text or the "Outro" flag — those are a different axis of the same
      // answer, and clearing them would silently delete what someone wrote.
      return multi ? [...prev, id] : [id];
    });
  }

  function toggleOther() {
    const next = !other;
    trace.record('other_toggled', { on: next });
    setOther(next);
    // In `single` mode, choosing "Outro" IS the choice — an authored option
    // would otherwise stay marked beside it and the answer would name two.
    if (next && !multi) setSelected([]);
  }

  function handleSubmit() {
    if (locked || !hasAnswer) return;
    setSubmitted(true);
    // `other` rides as its own boolean AND as the sentinel inside `option_ids`.
    // The boolean is what a reader asks; the sentinel is what round-trips
    // through the plans-app's `selected_option_letters[]` without translation.
    const optionIds = otherOn ? [...selected, QUESTION_OTHER_ID] : [...selected];
    trace.record('answer_submitted', {
      option_ids: optionIds,
      other: otherOn,
      // Never the text — see the privacy note in this file's header.
      has_text: body.length > 0,
    });
    // `correct: true` is NOT a verdict. `ActivityCompleteHandler` has a required
    // boolean, and a settled non-grading activity is a completed one — the same
    // value `ConceptRevealActivity` and the reflection `document` hand up. There
    // is no screen anywhere in this kind that reads it.
    onComplete(true, {
      // The prose, verbatim, in its one home.
      response: body,
      actions: trace.drain(),
    });
  }

  return (
    <ActivityShell kind={activity.kind} icon={MessageCircleQuestion} label={t('activity.question')}>
      {spec?.title && (
        <RichText text={spec.title} className="text-lg font-medium" data-testid="question-title" />
      )}
      {spec?.description && (
        <RichText
          text={spec.description}
          className="mt-2 text-muted-foreground"
          data-testid="question-description"
        />
      )}
      <InstructionPanel spec={spec?.instruction} className="mt-4" />

      <QuestionActivityBody
        options={options}
        multi={multi}
        recommendedIds={spec?.recommended_option_id ? [spec.recommended_option_id] : []}
        selected={otherOn ? [...selected, QUESTION_OTHER_ID] : selected}
        notes={text}
        onToggle={(id) => (id === QUESTION_OTHER_ID ? toggleOther() : toggleOption(id))}
        onNotesChange={(next) => {
          // `{ length }`, never the text — the same shape `code_edited` uses,
          // and for the same reason.
          trace.record('note_edited', { length: next.length });
          setText(next);
        }}
        disabled={locked}
        callerOptions={{ allowOther, allowNotes }}
        notesLabel={spec?.free_text?.label}
        notesPlaceholder={spec?.free_text?.placeholder}
        fieldId={`question-text-${activity.id}`}
        pickHint={pickHint}
      />

      {/*
        `correct` is deliberately OMITTED, which is what makes the locked state
        the NEUTRAL "Enviado" rather than a green or a red one. Passing
        `correct={true}` here would paint a settled question green — the exact
        verdict this kind exists to not draw.
      */}
      <SubmitButton
        submitted={settled}
        disabled={!hasAnswer}
        onSubmit={handleSubmit}
        testId="question-submit"
      />
    </ActivityShell>
  );
}
