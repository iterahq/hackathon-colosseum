/**
 * THE PEDAGOGICAL CONTEXT of an attempt — what the activity was FOR, captured
 * with the attempt rather than joined to it afterwards.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), **Fase 1**.
 * Surface fixed by question `b819fa14`, answered by Tainan TG 2026-08-03,
 * option **A — só o Itera Player** (the Lesson Studio is out of scope; the
 * activities of the grammar matrix go to a `dfl-labs` project).
 *
 * Storage: `itera.activity_traces.pedagogical_context` (migration 0038).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE TAG TRAVELS WITH THE ATTEMPT INSTEAD OF BEING JOINED TO IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The plan states the requirement flatly:
 *
 *   *"Contexto pedagógico em TODO evento: `activityId`, `template`,
 *   `mentalStructure[]`, `metaphor`, `difficulty`, `objective`. Sem isso, daqui
 *   a 5 anos não dá pra perguntar 'atividades de Estado usando a metáfora
 *   Fábrica geram mais transferência que Cidade?'."*
 *
 * A join would answer that question against TODAY's tagging. And the tagging is
 * the one thing guaranteed to move, because ADR-5 makes the grammar competitive
 * rather than authoritative — structures enter and leave on measured
 * explanatory power. So a trace tagged by join re-tags itself retroactively
 * every time the grammar changes, and the Fase 4 ablation ends up measuring its
 * own bookkeeping instead of the learners.
 *
 * This is exactly the defect migration 0037 fixed one level up (`activities.
 * spec` is mutable jsonb rewritten in place by the trigger of 0024), and it
 * takes the same fix: capture at the moment of the attempt, never re-derive.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * "EVERY EVENT" — WHY THE CONTEXT IS ON THE ROW AND NOT ON EACH ACTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The plan says *every event*, and every event of a trace belongs to exactly
 * one attempt of exactly one activity, so the context is constant across the
 * whole sequence. Copying it onto each action would re-store, per action, what
 * the row already carries once — the identical argument `learningTrace.ts`
 * makes for `at_ms` being an offset instead of a wall clock, and traces are
 * built to hold hundreds of actions.
 *
 * The requirement is honoured at the READ boundary instead, which is where
 * "every event carries context" actually has to be true: `flattenTraceEvents()`
 * in `learningTrace.ts` yields ONE record per event with the context attached
 * to each. Storage pays once; analysis sees it on all of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE GENEROUS OBJECT, NOT SIX NARROW FIELDS — THIS IS ADR-2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ADR-2: *"Toda mudança de gramática vira um job de reprocessamento, não uma
 * migração de cliente. Exige que os eventos brutos sejam guardados de forma
 * generosa e imutável."*
 *
 * Six named fields alone would make the next grammar field a migration plus a
 * client release plus a coordinated deploy — the client migration ADR-2 exists
 * to forbid. So this module normalises the six the plan names AND keeps every
 * other authored key verbatim under `extra`. The manifest fields the v5 matrix
 * introduces (`role`, `varied_attribute`, `held_constant[]` — Verification item
 * 11) are consequently being COLLECTED today by a build that has never heard of
 * them, and become queryable by reprocessing rather than by re-collection.
 *
 * The same rule governs mistakes: an author who misspells a key does not lose
 * it. It lands in `extra` and is recoverable offline. **Nothing authored is
 * ever dropped.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS HONESTLY MISSING ON DAY ONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * No activity in the catalogue carries a `pedagogy` block yet, so every row
 * written when this lands has `authored: false`, `mental_structures: []` and
 * three nulls. That is why `authored` exists as its own field: an audit must be
 * able to separate *"untagged"* from *"tagged with nothing"*, and NULL on the
 * column from both (NULL = this build did not capture it at all).
 *
 * ⚠️ Consequence, stated rather than buried: the plan's **Verification item 2**
 * (*"zero eventos com `mentalStructure` vazio"*) is NOT satisfiable until the
 * matrix activities are authored with the block. Shipping the pipe first is
 * still the right order — an attempt that runs before the column exists is
 * unrecoverable, whereas an attempt that runs untagged stays RE-TAGGABLE
 * offline, because the row still pins which activity and which template.
 *
 * PURE — no React, no DOM, no Supabase. Every rule above is unit-testable with
 * fixed inputs.
 */
import type { ActivityKind } from '@iterahq/activity-spec';
import { ACTIVITY_FAMILY, type ActivityFamily } from '@/utils/activityFamilies';

/**
 * Version of the CONTEXT OBJECT — deliberately its own field, separate from
 * `activity_traces.schema_version`.
 *
 * The envelope version answers *"can this build read the sequence?"*. This one
 * answers *"how were the pedagogical fields shaped?"*. Folding them together
 * would mean a change in one silently claiming something about the other, and
 * would drag the envelope version up on additive change — the exact thing the
 * `learningTrace.ts` header forbids.
 */
export const PEDAGOGICAL_CONTEXT_SCHEMA = 1;

/**
 * The AUTHORED block this module reads, on `itera.activities.spec`.
 *
 * `spec` is the only authoring surface that exists today, which is why the tag
 * rides there instead of waiting on new columns and an authoring UI — the whole
 * argument of Fase 1 is that a lesson which runs uninstrumented is data lost
 * for good.
 */
export const PEDAGOGY_SPEC_KEY = 'pedagogy';

/**
 * GRAMMAR v0, closed by Tainan on 2026-08-03 (question `5099556b`, option A)
 * and reconfirmed 2026-08-04 (*"mantém"*).
 *
 * ⚠️ THESE ARE A READING AID AND A LINT INPUT — **never a filter.** Nothing in
 * this module rejects a term that is absent from these lists, and the database
 * has no CHECK for the same reason: ADR-5 makes the grammar competitive, so a
 * structure that does not exist yet is the normal way the grammar grows. A
 * client that dropped unknown terms would make the first attempt at a new
 * structure invisible, which is the one failure this whole plan exists to
 * prevent.
 *
 * Use `unknownGrammarTerms()` to FLAG drift; never to discard it.
 */
export const GRAMMAR_V0_MENTAL_STRUCTURES = [
  'estado',
  'fluxo',
  'dependencia',
  'feedback',
] as const;

/**
 * The three v0 metaphors. They differ in REGIME of representation — continuous
 * / discrete-boolean / by rate — not merely in theme, which is what makes
 * "transfer between metaphors" a question with content rather than a change of
 * skin (Tainan's criterion when rejecting `fábrica` and `cidade` as too
 * complex).
 */
export const GRAMMAR_V0_METAPHORS = [
  'tanques_valvulas',
  'interruptores_lampadas',
  'fila',
] as const;

/**
 * The pedagogical context of ONE attempt, exactly as it lands in
 * `itera.activity_traces.pedagogical_context`.
 *
 * snake_case because these ARE the storage names: the object goes verbatim into
 * a jsonb column, so `pedagogical_context ->> 'metaphor'` in a SQL query has to
 * spell what is written here. camelCase would put a translation layer between
 * this type and every query anyone ever writes against it — the same reason
 * `LearningTrace` is snake_case.
 *
 * ⚠️ `activity_id` is deliberately absent. It is already a NOT NULL column of
 * the same row.
 */
export interface PedagogicalContext {
  /** Version of THIS object's shape. See `PEDAGOGICAL_CONTEXT_SCHEMA`. */
  schema: number;
  /**
   * The render template — `itera.activities.kind`, as this attempt was
   * rendered. Always known: it is what chose the component on screen.
   */
  template: ActivityKind;
  /**
   * The reducer family that owns this template's action vocabulary, AS
   * CLASSIFIED AT CAPTURE TIME (`src/utils/activityFamilies.ts`).
   *
   * Snapshotted rather than re-derived at read time, and for the 0037 reason:
   * `ACTIVITY_FAMILY` is a live map whose own header calls each row *"a
   * hypothesis"*. Re-deriving later would re-attribute a historical action
   * vocabulary to a family that did not exist when the learner acted.
   */
  family: ActivityFamily;
  /**
   * The mental structures this activity claims to exercise, VERBATIM as
   * authored. `[]` means untagged — never null, so an audit can write
   * `jsonb_array_length(...) = 0` without a null branch.
   */
  mental_structures: string[];
  /** The metaphor the activity is dressed in, verbatim. Null when untagged. */
  metaphor: string | null;
  /**
   * Difficulty AS AUTHORED — a number or a label, whichever the author wrote,
   * never coerced.
   *
   * The plan names the field and not its scale, and inventing one here would
   * silently rewrite authored content into a convention nobody agreed to. A
   * reader handles both shapes; the single convention gets enforced upstream,
   * by the activity-manifest lint of Verification item 11, where a violation
   * costs a red build instead of a learner's attempt.
   */
  difficulty: string | number | null;
  /** The learning objective, verbatim. Null when untagged. */
  objective: string | null;
  /**
   * Was there an authored `pedagogy` block at all?
   *
   * Three states have to stay distinguishable and two of them look alike:
   * column NULL = this build captured nothing; `authored: false` = we looked
   * and the activity carried no block; `authored: true` with empty fields = the
   * block exists and says nothing. Without this flag the first two collapse
   * into each other and the audit cannot tell a rollout gap from an untagged
   * catalogue.
   */
  authored: boolean;
  /**
   * Every OTHER key of the authored block, verbatim. Absent when there are
   * none.
   *
   * This is the ADR-2 seam: a grammar field invented after this build shipped
   * is still collected, so adopting it is a reprocessing job over rows we
   * already have rather than a client migration plus a wait for new data.
   */
  extra?: Record<string, unknown>;
}

/** The six keys this build understands inside the authored block. */
const KNOWN_AUTHORED_KEYS = new Set([
  'mental_structures',
  'mentalStructure',
  'metaphor',
  'difficulty',
  'objective',
]);

function plainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Trimmed, or null for anything that is not a non-empty string. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The structure list, tolerant of the two spellings an author can reasonably
 * write and of a single term written bare.
 *
 * The plan spells it `mentalStructure[]`; the column and every SQL query spell
 * it `mental_structures`. Accepting both is not sloppiness — an author copying
 * the field name straight out of the plan must not produce a silently empty
 * list, and a silently empty list is indistinguishable from an untagged
 * activity. Anything else the author wrote survives in `extra` regardless.
 */
function structures(block: Record<string, unknown>): string[] {
  const raw = block.mental_structures ?? block.mentalStructure;
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: string[] = [];
  for (const item of list) {
    const value = text(item);
    if (value !== null && !out.includes(value)) out.push(value);
  }
  return out;
}

/** A number that is really a number, or a non-empty string. Never coerced. */
function difficulty(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return text(value);
}

/**
 * Build the context for ONE attempt from the activity that was just rendered.
 *
 * TOTAL: it never returns null, unlike `buildSpecSnapshot`. The difference is
 * real rather than stylistic — `template` and `family` are known for every
 * attempt of every kind, so there is always something true to record, and a
 * null here would erase the two fields that make an untagged attempt
 * re-taggable later.
 *
 * ⚠️ IT MUST BE CALLED BY THE SURFACE THAT RENDERED THE ACTIVITY, for the same
 * reason `buildSpecSnapshot` must: on the durable-outbox path "write time" can
 * be hours after the learner answered, and by then a curator's edit (trigger
 * `activity_defs_sync_instances`, migration 0024) may have changed the tagging.
 */
export function buildPedagogicalContext(activity: {
  kind: ActivityKind;
  spec?: Record<string, unknown> | null;
}): PedagogicalContext {
  const block = plainObject(activity.spec?.[PEDAGOGY_SPEC_KEY]);
  const base = {
    schema: PEDAGOGICAL_CONTEXT_SCHEMA,
    template: activity.kind,
    // `?? 'reading'` is unreachable through the type system (the map is a
    // `Record<ActivityKind, …>` and a missing kind does not compile), and it is
    // here only so a row that reached us as raw data from the network cannot
    // make the context `undefined` — a jsonb key holding `undefined` serialises
    // to a MISSING key, which would read as "this build did not classify it".
    family: ACTIVITY_FAMILY[activity.kind] ?? 'reading',
  };

  if (!block) {
    return {
      ...base,
      mental_structures: [],
      metaphor: null,
      difficulty: null,
      objective: null,
      authored: false,
    };
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block)) {
    if (!KNOWN_AUTHORED_KEYS.has(key)) extra[key] = value;
  }

  return {
    ...base,
    mental_structures: structures(block),
    metaphor: text(block.metaphor),
    difficulty: difficulty(block.difficulty),
    objective: text(block.objective),
    authored: true,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

/** Fold accents and case away — for COMPARISON only, never for storage. */
function foldTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const V0_STRUCTURES = new Set(GRAMMAR_V0_MENTAL_STRUCTURES.map(foldTerm));
const V0_METAPHORS = new Set(GRAMMAR_V0_METAPHORS.map(foldTerm));

/**
 * Terms this context uses that grammar v0 does not know — a REPORT, never a
 * filter.
 *
 * Two consumers, both downstream of storage: the activity-manifest lint
 * (Verification item 11, in the dfl-labs repo) turning a typo into a red build
 * BEFORE any learner sees the activity, and a Fase 4 analysis pass separating
 * *"a structure we deliberately added"* from *"someone wrote `estdo`"*. The
 * distinction cannot be made at write time — that is precisely what makes it a
 * question for the lint and not for a CHECK constraint.
 *
 * Comparison folds accents, case and separators, because `Dependência`,
 * `dependencia` and `DEPENDENCIA` are the same term wearing different hats and
 * flagging them would train people to ignore the flag.
 */
export function unknownGrammarTerms(
  context: Pick<PedagogicalContext, 'mental_structures' | 'metaphor'>
): {
  mental_structures: string[];
  metaphor: string | null;
} {
  return {
    mental_structures: context.mental_structures.filter((s) => !V0_STRUCTURES.has(foldTerm(s))),
    metaphor:
      context.metaphor !== null && !V0_METAPHORS.has(foldTerm(context.metaphor))
        ? context.metaphor
        : null,
  };
}

/**
 * A context READ BACK from storage.
 *
 * `template` and `family` are widened to `string`, and the asymmetry is
 * deliberate — the same one `StoredLearnerAction` uses for the action `type`.
 * At WRITE time they are closed unions, so a new kind or a new family has to
 * declare itself in the type system. At READ time they must be open: a row
 * written by a NEWER build can name a kind this build has never heard of, and
 * narrowing here would either drop it or, worse, coerce it to some arbitrary
 * known value — which is how a reader ends up confidently reporting the wrong
 * template for a real attempt.
 *
 * `schema` is reported rather than assumed, and `from_future` says the row
 * postdates this build, exactly as `StoredLearningTrace` does.
 */
export type StoredPedagogicalContext = Omit<PedagogicalContext, 'template' | 'family'> & {
  template: string;
  family: string;
  /** True when the row was written by a build NEWER than this one. */
  from_future: boolean;
};

/**
 * Read a stored context back, TOTALLY and TOLERANTLY — the same contract
 * `readTrace` honours, for the same reason.
 *
 * Unknown `extra` keys pass through verbatim; malformed individual fields
 * degrade to null / `[]` rather than costing the whole object, because one bad
 * field must never lose the five good ones.
 *
 * Returns null only for a NULL/absent column or a non-object — which is the
 * honest reading of *"not captured"*.
 */
export function readPedagogicalContext(value: unknown): StoredPedagogicalContext | null {
  const row = plainObject(value);
  if (!row) return null;
  const extra = plainObject(row.extra);
  const schema =
    typeof row.schema === 'number' && Number.isFinite(row.schema) ? row.schema : 0;
  return {
    schema,
    from_future: schema > PEDAGOGICAL_CONTEXT_SCHEMA,
    template: text(row.template) ?? '',
    family: text(row.family) ?? '',
    mental_structures: Array.isArray(row.mental_structures)
      ? row.mental_structures.filter((s): s is string => typeof s === 'string')
      : [],
    metaphor: text(row.metaphor),
    difficulty: difficulty(row.difficulty),
    objective: text(row.objective),
    authored: row.authored === true,
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  };
}
