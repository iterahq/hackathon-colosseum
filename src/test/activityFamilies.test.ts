import { describe, it, expect } from 'vitest';
import type { ActivityKind } from '@/types/content';
// Every kind the Player renders: the spec's `ACTIVITY_KINDS` plus the 22
// one-behaviour kinds (plan `20260924-activity-type-one-behavior-rule`).
import { KNOWN_ACTIVITY_KINDS as ACTIVITY_KINDS } from '@/utils/activitySpecBoundary';
import {
  ACTIVITY_FAMILIES,
  ACTIVITY_FAMILY,
  FAMILY_ACTIONS,
  FAMILY_EMITTED,
  FAMILY_STATE,
  LIFECYCLE_ACTIONS,
  WIRED_FAMILIES,
  familyOf,
  isActionOfFamily,
  isLifecycleAction,
  kindsOfFamily,
  type ActivityFamily,
} from '@/utils/activityFamilies';

/**
 * The Fase A registry, checked MECHANICALLY.
 *
 * The plan's deliverable for Fase A was "a short document with each family's
 * signature and the rationale for the grouping". A document cannot be wrong in
 * a way CI notices — the maps in `activityFamilies.ts` can, and this file is
 * what makes them so. Every assertion below corresponds to a claim the module
 * makes in prose.
 */

const families = ACTIVITY_FAMILIES as readonly ActivityFamily[];

describe('families PARTITION the kinds — no kind unassigned, no family empty', () => {
  it('covers every kind in the canonical enum, and nothing outside it', () => {
    // The `Record<ActivityKind, …>` trap already makes a MISSING kind a compile
    // error. This catches the other direction: a stale key left behind after a
    // kind is removed from the package, which the Record type would accept
    // silently only if the union still had it — and would not catch at all if
    // someone widened the map's type.
    expect(Object.keys(ACTIVITY_FAMILY).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  it('every family has at least one kind — a family with none is a name, not a pattern', () => {
    for (const f of families) expect(kindsOfFamily(f).length).toBeGreaterThan(0);
  });

  it('`familyOf` is total and agrees with the map', () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(families).toContain(familyOf(kind as ActivityKind));
      expect(familyOf(kind as ActivityKind)).toBe(ACTIVITY_FAMILY[kind as ActivityKind]);
    }
  });

  it('the documented grouping is the one in the map (the table cannot drift from the code)', () => {
    expect(kindsOfFamily('selection').sort()).toEqual(['multi_choice', 'quiz', 'single_choice']);
    expect(kindsOfFamily('arrangement').sort()).toEqual(['match', 'order']);
    expect(kindsOfFamily('reading').sort()).toEqual([
      'byoc_build_context',
      'byoc_judge_each',
      'byoc_pick_best',
      'concept',
      'concept_reveal',
      'diagram',
      'document',
      'document_ai_judge',
      'document_read',
      'document_reflect',
      'video',
    ]);
    // One-behaviour kinds sit in the family of the old kind they came from
    // (plan `20260924-activity-type-one-behavior-rule`): a split changes the
    // input INSIDE the family's machine, never the machine.
    expect(kindsOfFamily('editor').sort()).toEqual([
      'code',
      'code_editor_checks',
      'code_editor_ungraded',
      'code_fill_bank',
      'code_fill_select',
      'code_fill_type',
    ]);
    // Os dois kinds de cenário são UMA família: partir o antigo kind único em
    // `chat_sandbox` + `terminal_sandbox` foi trocar o discriminador de lugar, e
    // a família descreve a forma do ESTADO — que não mudou.
    expect(kindsOfFamily('scenario').sort()).toEqual([
      'chat_compose',
      'chat_fill_select',
      'chat_fill_type',
      'chat_pick_context',
      'chat_rate_reply',
      'chat_sandbox',
      'terminal_build_command',
      'terminal_pick_command',
      'terminal_sandbox',
      'terminal_type_command',
    ]);
    // `inquiry` (2026-08-28) — a família NÃO-AVALIATIVA, com um membro só.
    // Ela existe porque `question` custaria uma máquina de estado nova dentro
    // de `selection` (sem veredito, mais dois eixos), que é exatamente o que o
    // critério falsificável no topo de `activityFamilies.ts` manda separar.
    expect(kindsOfFamily('inquiry').sort()).toEqual([
      'question',
      'question_pick_many',
      'question_pick_one',
      'question_write',
    ]);
  });

  it('every family states the shape of its state — the Fase A "signature"', () => {
    for (const f of families) expect(FAMILY_STATE[f].length).toBeGreaterThan(20);
  });
});

describe('the action vocabulary', () => {
  it('no family redeclares a lifecycle action — those are the envelope, not an interaction', () => {
    for (const f of families) {
      for (const a of FAMILY_ACTIONS[f]) expect(isLifecycleAction(a)).toBe(false);
    }
  });

  it('`answer_submitted` is the ONLY name shared between families', () => {
    // A second shared name would mean two families are describing the same
    // machine under different labels, which is the failure mode the falsifiable
    // criterion in the module header exists to catch.
    const seen = new Map<string, ActivityFamily[]>();
    for (const f of families) {
      for (const a of FAMILY_ACTIONS[f]) seen.set(a, [...(seen.get(a) ?? []), f]);
    }
    const shared = [...seen.entries()].filter(([, fs]) => fs.length > 1).map(([a]) => a);
    expect(shared).toEqual(['answer_submitted']);
  });

  it('action names are snake_case, matching what a jsonb query has to spell', () => {
    // `actions -> 0 ->> 'type' = 'option_selected'` is how these are read back.
    for (const f of families) {
      for (const a of FAMILY_ACTIONS[f]) expect(a).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    for (const a of LIFECYCLE_ACTIONS) expect(a).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('`isActionOfFamily` accepts only that family — a selection kind cannot own `pair_made`', () => {
    expect(isActionOfFamily('selection', 'option_selected')).toBe(true);
    expect(isActionOfFamily('selection', 'pair_made')).toBe(false);
    expect(isActionOfFamily('arrangement', 'pair_made')).toBe(true);
    expect(isActionOfFamily('selection', 'activity_opened')).toBe(false);
  });
});

describe('DECLARED vs EMITTED — the distinction that keeps the registry honest', () => {
  it('everything a family emits is something it declares', () => {
    for (const f of families) {
      for (const a of FAMILY_EMITTED[f]) {
        expect(isActionOfFamily(f, a)).toBe(true);
      }
    }
  });

  it('`WIRED_FAMILIES` is derived, never hand-maintained', () => {
    expect([...WIRED_FAMILIES]).toEqual(families.filter((f) => FAMILY_EMITTED[f].length > 0));
  });

  it('`selection`, `arrangement` and `scenario` are wired today', () => {
    // ⚠️ This is a LEDGER, not a target. Wiring a family changes this line in
    // the SAME commit that changes the components — that is the point. What it
    // prevents is the opposite: a family quietly listed as emitting while
    // nothing emits, which would make every downstream query read two-action
    // traces as if they were complete sequences.
    //
    // `scenario` joined on 2026-08 with the TERMINAL sandbox
    // (plan 20260806-itera-terminal-sandbox-activity, F5). It is the one
    // PARTIALLY wired family: `terminal_sandbox` emits, `chat_sandbox` does
    // not, so a reader must discriminate on the KIND — which is what
    // `familyEmitsSequence` does now that the two kinds replaced the old
    // `spec.sandboxKind` discriminator.
    // `inquiry` entrou JÁ LIGADA (2026-08-28): o kind e a instrumentação dele
    // chegaram na mesma mudança, então não há histórico a perder por
    // instrumentar depois. A ordem sai de `ACTIVITY_FAMILIES`, não da data.
    expect([...WIRED_FAMILIES]).toEqual(['selection', 'arrangement', 'scenario', 'inquiry']);
    expect(FAMILY_EMITTED.reading).toEqual([]);
    expect(FAMILY_EMITTED.editor).toEqual([]);
    expect(FAMILY_EMITTED.scenario).toEqual(['command_run', 'sandbox_reset']);
    expect(FAMILY_EMITTED.inquiry).toEqual(FAMILY_ACTIONS.inquiry);
  });

  /**
   * A regra que separa `inquiry` de `selection`, escrita como asserção.
   *
   * Se alguém "simplificar" reaproveitando `option_selected` aqui, o teste de
   * nome-compartilhado acima já fica vermelho — mas a mensagem dele fala de
   * famílias em geral. Esta fala do caso concreto e diz por quê.
   */
  it('`inquiry` não reaproveita o vocabulário de `selection` — são duas máquinas', () => {
    const selection = new Set<string>(FAMILY_ACTIONS.selection);
    const shared = (FAMILY_ACTIONS.inquiry as readonly string[]).filter((a) => selection.has(a));
    expect(shared).toEqual(['answer_submitted']);
  });

  it('an unwired family declares MORE than it emits — the gap is the remaining work', () => {
    for (const f of families) {
      if (WIRED_FAMILIES.includes(f)) continue;
      expect(FAMILY_ACTIONS[f].length).toBeGreaterThan(FAMILY_EMITTED[f].length);
    }
  });
});
