import type { ActivityFixture } from './activityFixtures';
import {
  ARRANGE_SPEC,
  DIAL_SPEC,
  PLUG_SPEC,
  PRESS_SPEC,
  SELECTOR_SPEC,
  TIMELINE_SPEC,
} from '../../src/stories/sceneMechanicsFixtures';
import { BUCKET_SPEC, INTERCEPT_SPEC, QUERY_SPEC, SPOT_SPEC, WIRE_SPEC } from '../../src/stories/sceneMechanicsFixturesB';
import { COMPOSE_BLOCKS_SPEC, DECOMPOSE_CANVAS_SPEC, EVENT_TRACE_SPEC } from '../../src/stories/systemKindsFixtures';

const id = (n: number) => `00000000-0000-4000-9100-${String(n).padStart(12, '0')}`;

export const fixture = (n: number, kind: string, spec: Record<string, unknown>, label = kind): ActivityFixture => ({
  id: id(n),
  kind,
  label,
  spec,
});

/** The page of the lesson in the video: the learner pressed "Tera" in its title. */
export const TERA_PAGE = {
  url_label: 'tera.site',
  elements: [
    { id: 'titulo', tag: 'h1', text: 'Oi, eu sou o Tera', name: 'título', job: 'o texto mais importante da página' },
    { id: 'texto', tag: 'p', text: 'Faço bolo de pote.', name: 'parágrafo', job: 'um bloco de texto corrido' },
  ],
};
export const SCENE_COPY = { guide: { name: 'Tera' }, prompt: 'Descubra as peças.', reaction: 'Isso.', stamp: 'tag' };

export const WIRE = fixture(1, 'wire', WIRE_SPEC);
export const COMPOSE_BLOCKS = fixture(2, 'compose_blocks', COMPOSE_BLOCKS_SPEC);
export const ARRANGE = fixture(3, 'arrange', ARRANGE_SPEC);
export const BUCKET = fixture(4, 'bucket', BUCKET_SPEC);
export const INTERCEPT = fixture(5, 'intercept', INTERCEPT_SPEC);
export const XRAY = fixture(6, 'xray', { ...SCENE_COPY, page: TERA_PAGE });
export const INSPECT = fixture(7, 'inspect', { ...SCENE_COPY, page: TERA_PAGE });
export const SPOT = fixture(8, 'spot', SPOT_SPEC);
export const DIAL = fixture(9, 'dial', DIAL_SPEC);
export const TIMELINE = fixture(10, 'timeline', TIMELINE_SPEC);
export const PLUG = fixture(11, 'plug', PLUG_SPEC);
export const PRESS = fixture(12, 'press', PRESS_SPEC);
export const SELECTOR = fixture(13, 'selector', SELECTOR_SPEC);
export const QUERY = fixture(14, 'query', QUERY_SPEC);
export const DECOMPOSE_CANVAS = fixture(15, 'decompose_canvas', DECOMPOSE_CANVAS_SPEC);
export const EVENT_TRACE = fixture(16, 'event_trace', EVENT_TRACE_SPEC);
export const LIVE_TYPE = fixture(17, 'live_type', { ...SCENE_COPY, page: TERA_PAGE, target_id: 'titulo' });

/** What a finger lands on in each scene: the first element of its interactive area. */
export const SCENE_TARGETS: { fx: ActivityFixture; target: string; gesture: string }[] = [
  { fx: WIRE, target: '[data-testid^="wire-left-"]', gesture: 'tap two ends' },
  { fx: COMPOSE_BLOCKS, target: '[data-testid^="compose-block-"]', gesture: 'drag or tap a block' },
  { fx: ARRANGE, target: '[data-testid^="arrange-item-"]', gesture: 'tap up / down' },
  { fx: BUCKET, target: '[data-testid^="bucket-drop-"]', gesture: 'tap a chip, tap a bucket' },
  { fx: INTERCEPT, target: '[data-testid^="intercept-node-"]', gesture: 'tap a node in time' },
  { fx: XRAY, target: '[data-testid="xray-page"] [data-scene-tag="h1"]', gesture: 'scrub the lens' },
  { fx: INSPECT, target: '[data-testid="inspect-page-target"] [data-scene-tag="h1"]', gesture: 'press a piece' },
  { fx: SPOT, target: '[data-testid^="spot-token-"]', gesture: 'tap a token of code' },
  { fx: DIAL, target: '[data-testid="dial-value"]', gesture: 'drag the slider' },
  { fx: TIMELINE, target: '[data-testid="timeline-index"]', gesture: 'scrub the slider' },
  { fx: PLUG, target: '[data-testid="plug-cable"]', gesture: 'tap the cable' },
  { fx: PRESS, target: '[data-testid="press-button"]', gesture: 'press the button' },
  { fx: SELECTOR, target: '[data-testid^="selector-option-"]', gesture: 'tap a selector' },
  { fx: QUERY, target: '[data-testid^="query-clause-"]', gesture: 'tap a clause' },
  { fx: DECOMPOSE_CANVAS, target: '[data-testid="decompose-stage"] [data-testid^="system-node-"]', gesture: 'lasso / tap parts' },
  { fx: EVENT_TRACE, target: '[data-testid="event-trace-stage"] [data-testid^="system-node-"]', gesture: 'tap the page' },
];
