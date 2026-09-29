/**
 * Contract fixtures for the scene-mechanics batch (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`) — batch A (`dial`, `plug`,
 * `selector`, `timeline`, `arrange`, `press`) and batch B (`wire`, `spot`,
 * `bucket`, `intercept`, `query`).
 *
 * Split out of `contractFixtures.ts` (already well past the 200-line file
 * cap before this batch existed) rather than growing that file further.
 * `ACTIVITY_CONTRACTS` there spreads this module in, so
 * `activityKindValidationCoverage.test.tsx` and
 * `activityContractFixtures.test.ts` see one registry either way.
 *
 * Specs are the real ported fixtures from `iterahq/activity-spec` PR #54
 * (`src/schemas/fixtures/scene-mechanics/<kind>.json`), reused verbatim from
 * the Storybook fixtures rather than duplicated a third time.
 */
import type { ContractFixture } from './contractFixtures';
import {
  ARRANGE_SPEC,
  DIAL_SPEC,
  PLUG_SPEC,
  PRESS_SPEC,
  SELECTOR_SPEC,
  TIMELINE_SPEC,
} from './sceneMechanicsFixtures';
import { BUCKET_SPEC, INTERCEPT_SPEC, QUERY_SPEC, SPOT_SPEC, WIRE_SPEC } from './sceneMechanicsFixturesB';

export const SCENE_MECHANICS_CONTRACTS = {
  dial: {
    kind: 'dial',
    fn: '8 · Cena',
    label: 'Dial',
    spec: DIAL_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, page, target_id, property (CSS fechado), unit?, min, max, step?, start, target: [lo, hi] } — assenta dentro do alvo; não corrige.',
  },
  plug: {
    kind: 'plug',
    fn: '8 · Cena',
    label: 'Plug',
    spec: PLUG_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, page, stylesheet[], cable_name, on_label, off_label } — puxar/plugar o cabo restyla a página ao vivo.',
  },
  selector: {
    kind: 'selector',
    fn: '8 · Cena',
    label: 'Selector',
    spec: SELECTOR_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, elements[], options[] (gramática fechada), targets[], rule } — o matcher puro decide o match exato.',
  },
  timeline: {
    kind: 'timeline',
    fn: '8 · Cena',
    label: 'Timeline',
    spec: TIMELINE_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, axis, steps[{ label, note, frame }] } — visitar todo passo abre o gate; não corrige.',
  },
  arrange: {
    kind: 'arrange',
    fn: '8 · Cena',
    label: 'Arrange',
    spec: ARRANGE_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, items[], correct[], start[], item_style? } — assenta na ordem certa.',
  },
  press: {
    kind: 'press',
    fn: '8 · Cena',
    label: 'Press',
    spec: PRESS_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, file, before?, options[], correct, wrong_hint, button, goal, effect (fechado), page? } — escolher liga; apertar `goal` vezes conclui.',
  },
  wire: {
    kind: 'wire',
    fn: '8 · Cena',
    label: 'Wire',
    spec: WIRE_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, left[], right[], pairs[], left_title, right_title, wrong_hint } — conectar todo par abre o gate.',
  },
  spot: {
    kind: 'spot',
    fn: '8 · Cena',
    label: 'Spot',
    spec: SPOT_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, file, lines[][], bugs[] (array, não map), miss_hint, page? } — achar todo bug abre o gate.',
  },
  bucket: {
    kind: 'bucket',
    fn: '8 · Cena',
    label: 'Bucket',
    spec: BUCKET_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, chips[], buckets[] (tone fechado) } — encaixar todo chip abre o gate.',
  },
  intercept: {
    kind: 'intercept',
    fn: '8 · Cena',
    label: 'Intercept',
    spec: INTERCEPT_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, nodes[] (icon fechado), edges[], path[], packet, answer, wrong_hint, packet_at? } — tapar o nó certo conclui na hora.',
  },
  query: {
    kind: 'query',
    fn: '8 · Cena',
    label: 'Query',
    spec: QUERY_SPEC,
    validated: true,
    note: '{ guide?, prompt, reaction, stamp, table, base_sql, clauses[] (union tipada), goal } — o interpretador puro de `@iterahq/activity-spec/runtime` decide o alcance da meta.',
  },
} as const satisfies Record<string, ContractFixture>;
