/**
 * A long press on an exercise must not select its text or raise the iOS
 * callout, and no surface that blocks selection may hold something the
 * learner types in.
 */
import './storybookTestBridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TOUCH_SURFACE } from '../../packages/activities/src/components/touchSurface';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { ActivityKind } from '@/types/content';
import { makeActivity } from '@/stories/activityFixtures';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';

const SURFACE_CLASSES = TOUCH_SURFACE.split(' ');
const EDITABLE = 'input:not([type="range"]), textarea, [contenteditable], .monaco-editor';

const isSurface = (el: Element) => SURFACE_CLASSES.every((name) => el.classList.contains(name));
const surfacesIn = (root: ParentNode) => [...root.querySelectorAll('.select-none')].filter(isSurface);

/** Where the gesture of each kind lands: a test id, or a selector when the kind has no stage id. */
const GESTURE_SURFACE: Partial<Record<ActivityKind, string>> = {
  single_choice: '[data-choice-option]',
  multi_choice: '[data-choice-option]',
  quiz: '[data-testid="quiz-option"]',
  order: '[data-testid="order-item"]',
  match: '[data-testid="match-left-card"]',
  wire: '[data-testid="wire-board"]',
  compose_blocks: '[data-testid="compose-stage"]',
  arrange: '[data-testid="arrange-stage"]',
  bucket: '[data-testid="bucket-stage"]',
  intercept: '[data-testid="intercept-board"]',
  xray: '[data-testid="xray-stage"]',
  inspect: '[data-testid="inspect-page-target"]',
  spot: '[data-testid="spot-editor"]',
  dial: '[data-testid="dial-slider"]',
  timeline: '[data-testid="timeline-scrubber"]',
  plug: '[data-testid="plug-cable"]',
  press: '[data-testid="press-button"]',
  selector: '[data-testid^="selector-option-"]',
  query: '[data-testid^="query-clause-"]',
  decompose_canvas: '[data-testid="decompose-stage"] [data-testid^="system-node-"]',
  event_trace: '[data-testid="event-trace-stage"] [data-testid^="system-node-"]',
};

const READING_KINDS: ActivityKind[] = ['concept', 'concept_reveal', 'document', 'live_type'];

const mount = (kind: ActivityKind, spec: Record<string, unknown>, rubric?: Record<string, unknown>) =>
  render(
    <I18nProvider>
      <ActivityRenderer activity={makeActivity(kind, spec, undefined, rubric ?? null)} onComplete={vi.fn()} />
    </I18nProvider>,
  ).container;

afterEach(cleanup);

describe('TOUCH_SURFACE', () => {
  it('blocks selection, the callout, the tap flash and the image drag', () => {
    expect(SURFACE_CLASSES).toEqual([
      'select-none',
      '[-webkit-touch-callout:none]',
      '[-webkit-tap-highlight-color:transparent]',
      '[&_img]:[-webkit-user-drag:none]',
    ]);
  });
});

describe('touch surfaces across the contract fixtures', () => {
  const contracts: [string, ContractFixture][] = Object.entries(ACTIVITY_CONTRACTS);

  it.each(contracts)('%s keeps everything editable outside a touch surface', (_key, contract) => {
    const container = mount(contract.kind, contract.spec, contract.rubric);
    for (const surface of surfacesIn(container)) {
      expect(surface.querySelector(EDITABLE)).toBeNull();
      expect(surface.matches(EDITABLE)).toBe(false);
    }
  });

  it.each(contracts.filter(([, contract]) => contract.kind in GESTURE_SURFACE))(
    '%s puts its gesture on a touch surface',
    (_key, contract) => {
      const container = mount(contract.kind, contract.spec, contract.rubric);
      const target = container.querySelector(GESTURE_SURFACE[contract.kind]!);
      expect(target).not.toBeNull();
      let node: Element | null = target;
      while (node && !isSurface(node)) node = node.parentElement;
      expect(node).not.toBeNull();
    },
  );

  it('covers every gesture kind with at least one fixture', () => {
    const present = new Set(contracts.map(([, contract]) => contract.kind));
    expect(Object.keys(GESTURE_SURFACE).filter((kind) => !present.has(kind as ActivityKind))).toEqual([]);
  });

  it.each(contracts.filter(([, contract]) => READING_KINDS.includes(contract.kind)))(
    '%s stays selectable',
    (_key, contract) => {
      const container = mount(contract.kind, contract.spec, contract.rubric);
      expect(surfacesIn(container)).toEqual([]);
    },
  );
});
