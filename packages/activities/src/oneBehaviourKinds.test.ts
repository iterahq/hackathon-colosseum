/**
 * The mirror of the one-behaviour kinds and its validation seam (plan
 * `20260924-activity-type-one-behavior-rule`, T9–T14).
 *
 * `safeParseKindSpec` answers with the INSTALLED `@iterahq/activity-spec` when
 * it knows a kind, and with `ONE_BEHAVIOUR_FALLBACK` when it does not
 * (spec < 1.4.0). The two must agree, or the bump to `^1.4.0` changes which
 * rows render. This file runs both on the same positives and the same
 * mutations, on whatever spec is installed — so the day the bump lands, the
 * same assertions compare the fallback against the real Zod schemas.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, isActivityKind } from '@iterahq/activity-spec';
import { initialModel, type Scenario } from '@iterahq/activity-spec/runtime';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';
import {
  ONE_BEHAVIOUR_FALLBACK,
  ONE_BEHAVIOUR_KINDS,
  ONE_BEHAVIOUR_PARENT,
  safeParseKindSpec,
  specPackageKnowsKind,
  transitionKindOf,
  type OneBehaviourKind,
} from './oneBehaviourKinds.js';
import {
  RUNTIME_HAS_SEED_FALLBACK_RUN,
  seedFallbackRun,
  seedFallbackRunCompat,
} from './kinds/sandbox/seedFallbackRun.js';

const contracts = Object.values(ACTIVITY_CONTRACTS) as ContractFixture[];

/** A fixture spec as mutable JSON — the mutations below write into any depth of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary authored JSON, mutated by path
type SpecJson = Record<string, any>;
const specOf = (kind: OneBehaviourKind) => {
  const hit = contracts.find((c) => c.kind === kind);
  if (!hit) throw new Error(`no contract fixture for ${kind}`);
  return structuredClone(hit.spec) as SpecJson;
};

describe('the mirrored kind list', () => {
  it('holds the 22 names of activity-spec #55, once each', () => {
    expect(ONE_BEHAVIOUR_KINDS).toHaveLength(22);
    expect(new Set(ONE_BEHAVIOUR_KINDS).size).toBe(22);
    expect(Object.keys(ONE_BEHAVIOUR_PARENT).sort()).toEqual([...ONE_BEHAVIOUR_KINDS].sort());
  });

  it('the installed spec knows ALL of them or NONE — never half a release', () => {
    const known = ONE_BEHAVIOUR_KINDS.filter((k) => specPackageKnowsKind(k));
    expect([0, 22]).toContain(known.length);
    // …and when it knows them, the names are the spec's own (no rename drift).
    if (known.length === 22) {
      for (const k of ONE_BEHAVIOUR_KINDS) expect(isActivityKind(k)).toBe(true);
      expect(ACTIVITY_KINDS).toEqual(expect.arrayContaining([...ONE_BEHAVIOUR_KINDS]));
    }
  });

  it('`transitionKindOf` folds a new kind onto its old kind, and leaves the rest alone', () => {
    expect(transitionKindOf('code_fill_bank')).toBe('code');
    expect(transitionKindOf('terminal_pick_command')).toBe('terminal_sandbox');
    expect(transitionKindOf('byoc_judge_each')).toBe('concept');
    expect(transitionKindOf('quiz')).toBe('quiz');
    expect(transitionKindOf('totally_new_kind')).toBe('totally_new_kind');
  });

  it('an unknown kind fails and never throws', () => {
    expect(safeParseKindSpec('totally_new_kind', {}).success).toBe(false);
  });
});

describe.each(ONE_BEHAVIOUR_KINDS)('%s', (kind) => {
  it('the contract fixture passes — under the fallback AND under the installed spec', () => {
    const spec = specOf(kind);
    const fallback = ONE_BEHAVIOUR_FALLBACK[kind](spec);
    expect(fallback.success, 'error' in fallback ? fallback.error : '').toBe(true);
    const installed = safeParseKindSpec(kind, spec);
    expect(installed.success, 'error' in installed ? installed.error : '').toBe(true);
  });

  it('an empty object and a non-object fail under both', () => {
    for (const bad of [{}, 'texto', null]) {
      expect(ONE_BEHAVIOUR_FALLBACK[kind](bad).success).toBe(false);
      expect(safeParseKindSpec(kind, bad).success).toBe(false);
    }
  });
});

/**
 * One mutation per behaviour axis the kind pins: each one turns the fixture of
 * the kind into the shape of ANOTHER behaviour. Both validators must refuse it.
 */
const MUTATIONS: [OneBehaviourKind, string, (s: SpecJson) => void][] = [
  ['code_editor_checks', 'no checks', (s) => delete s.checks],
  ['code_editor_checks', 'a blank', (s) => (s.blanks = specOf('code_fill_type').blanks)],
  ['code_editor_ungraded', 'checks', (s) => (s.checks = specOf('code_editor_checks').checks)],
  ['code_fill_bank', 'a select blank', (s) => (s.blanks[1] = specOf('code_fill_select').blanks[1])],
  ['code_fill_select', 'a text blank', (s) => (s.blanks[0] = specOf('code_fill_type').blanks[0])],
  ['code_fill_select', 'a word bank', (s) => (s.word_bank = ['useState'])],
  ['code_fill_type', 'a bank blank', (s) => (s.blanks[0] = { ...s.blanks[0], kind: 'bank' })],
  ['chat_compose', 'choices', (s) => (s.choices = specOf('chat_pick_context').choices)],
  ['chat_compose', 'an evaluate step', (s) => (s.steps[0].mode = 'evaluate')],
  ['chat_fill_select', 'a text slot', (s) => (s.slots[0].kind = 'text')],
  ['chat_fill_select', 'the live model', (s) => (s.live = true)],
  ['chat_fill_type', 'a select slot', (s) => (s.slots[0].kind = 'select')],
  ['chat_pick_context', 'slots', (s) => (s.slots = specOf('chat_fill_select').slots)],
  ['chat_pick_context', 'openness byoc', (s) => (s.openness = 'byoc')],
  ['chat_rate_reply', 'a compose step', (s) => (s.steps[0].mode = 'compose')],
  ['terminal_type_command', 'inputMode options', (s) => (s.inputMode = 'options')],
  ['terminal_pick_command', 'a token step', (s) => (s.steps[0].expose.optionGranularity = 'token')],
  ['terminal_pick_command', 'tokens', (s) => (s.steps[0].expose.tokens = ['git'])],
  ['terminal_build_command', 'a command step', (s) => (s.steps[0].expose.optionGranularity = 'command')],
  ['terminal_build_command', 'inputMode freeText', (s) => (s.inputMode = 'freeText')],
  ['document_read', 'an evaluation', (s) => (s.evaluation = { mode: 'word-count', minWords: 10 })],
  ['document_reflect', 'an ai-judge evaluation', (s) => (s.evaluation = { mode: 'ai-judge', criteria: [] })],
  ['document_ai_judge', 'a word-count evaluation', (s) => (s.evaluation = { mode: 'word-count', minWords: 10 })],
  ['byoc_pick_best', 'a judge_each harness', (s) => (s.byoc = specOf('byoc_judge_each').byoc)],
  ['byoc_judge_each', 'a pick_best harness', (s) => (s.byoc = specOf('byoc_pick_best').byoc)],
  ['byoc_build_context', 'no byoc', (s) => delete s.byoc],
  ['question_pick_one', 'allow_other', (s) => (s.allow_other = true)],
  ['question_pick_many', 'mode', (s) => (s.mode = 'multi')],
  ['question_pick_one', 'free_text', (s) => (s.free_text = { label: 'Notas' })],
  ['question_write', 'options', (s) => (s.options = specOf('question_pick_one').options)],
];

describe('a spec with another behaviour is refused — by the fallback and by the installed spec', () => {
  it.each(MUTATIONS)('%s + %s', (kind, _what, mutate) => {
    const spec = specOf(kind);
    mutate(spec);
    expect(ONE_BEHAVIOUR_FALLBACK[kind](spec).success).toBe(false);
    expect(safeParseKindSpec(kind, spec).success).toBe(false);
  });

  it('every kind has at least one mutation here', () => {
    const covered = new Set(MUTATIONS.map(([k]) => k));
    expect(ONE_BEHAVIOUR_KINDS.filter((k) => !covered.has(k))).toEqual([]);
  });
});

describe('seedFallbackRun — the chat_rate_reply seed (T25)', () => {
  const sc = specOf('chat_rate_reply') as unknown as Scenario;
  const key = sc.initialState.resultResolver.fallback;

  it('puts the base prompt and the fallback reply on screen and records ONE run', () => {
    const m0 = initialModel(sc, 'pt');
    const m = seedFallbackRun(sc, m0, 'pt');
    expect(m.runs).toEqual([
      { withContext: false, key, quality: sc.initialState.cannedResults[key]?.quality },
    ]);
    expect(m.lastResultKey).toBe(key);
    expect(m.ranPromptCount).toBe(1);
    expect(m.messages).toHaveLength(m0.messages.length + 2);
    expect(m.messages.at(-1)?.role).toBe('assistant');
    expect(m.completedSteps.size).toBe(0);
  });

  it('is idempotent: a model that holds a run is unchanged', () => {
    const once = seedFallbackRun(sc, initialModel(sc, 'pt'), 'pt');
    expect(seedFallbackRun(sc, once, 'pt')).toBe(once);
  });

  it('the pre-#57 path builds the SAME model as the runtime (when the runtime has it)', () => {
    const compat = seedFallbackRunCompat(sc, initialModel(sc, 'en'), 'en');
    const viaSeam = seedFallbackRun(sc, initialModel(sc, 'en'), 'en');
    expect(compat).toEqual(viaSeam);
    // Documents which path this run exercised; both are asserted above.
    expect(typeof RUNTIME_HAS_SEED_FALLBACK_RUN).toBe('boolean');
  });

  it('holds even when the resolver HAS rules — the seed always takes the fallback', () => {
    const withRule = structuredClone(sc) as Scenario;
    withRule.initialState.resultResolver.rules = [
      { when: { ranPromptCount: { gte: 0 } }, use: 'a-rule-that-always-matches' },
    ] as Scenario['initialState']['resultResolver']['rules'];
    const m = seedFallbackRunCompat(withRule, initialModel(withRule, 'pt'), 'pt');
    expect(m.lastResultKey).toBe(key);
    expect(m.runs[0]?.withContext).toBe(false);
  });
});
