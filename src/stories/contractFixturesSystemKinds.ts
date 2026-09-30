/**
 * Contract fixtures for the system kinds (2026-09-30) — `decompose_canvas`,
 * `compose_blocks`, `state_lab`, `event_trace`. Split out like
 * `contractFixturesSceneMechanics.ts`; `ACTIVITY_CONTRACTS` spreads it in.
 *
 * `validated: true` is answered by the package's structural fallback
 * (`systemKindsFallback.ts`) until `@iterahq/activity-spec` releases the four
 * schemas — see the release-gate note in `packages/activities/src/specs.ts`.
 */
import type { ContractFixture } from './contractFixtures';
import { COMPOSE_BLOCKS_SPEC, DECOMPOSE_CANVAS_SPEC, EVENT_TRACE_SPEC, STATE_LAB_SPEC } from './systemKindsFixtures';

export const SYSTEM_KINDS_CONTRACTS = {
  decompose_canvas: {
    kind: 'decompose_canvas',
    fn: '8 · Cena',
    label: 'Decompose canvas',
    spec: DECOMPOSE_CANVAS_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, wrong_hint?, view, state?, parts[], must_group[], must_separate[], require_all_assigned? } — restrições, nunca gabarito único.',
  },
  compose_blocks: {
    kind: 'compose_blocks',
    fn: '8 · Cena',
    label: 'Compose blocks',
    spec: COMPOSE_BLOCKS_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, wrong_hint?, blocks[], root, target, sibling_order_matters?, item_style? } — a árvore igual ao alvo conclui.',
  },
  state_lab: {
    kind: 'state_lab',
    fn: '8 · Cena',
    label: 'State lab',
    spec: STATE_LAB_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, state, view, controls[], goals[] } — todas as metas ao mesmo tempo concluem; sem edição livre de código.',
  },
  event_trace: {
    kind: 'event_trace',
    fn: '8 · Cena',
    label: 'Event trace',
    spec: EVENT_TRACE_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, state, view, trigger, steps[], lenses? } — disparar e avançar até o último passo; sem pergunta de previsão.',
  },
} as const satisfies Record<string, ContractFixture>;
