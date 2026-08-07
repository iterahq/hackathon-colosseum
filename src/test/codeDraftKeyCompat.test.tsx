import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Activity } from '@/types/content';
import { CODE_DRAFT_KEY_PREFIX, codeDraftKey } from '@iterahq/activities/code';
import { ITERA_ACTIVITY_STORAGE } from '@/components/branded/activity/IteraActivityHost';
import { rememberStorageScope, scopedKey } from '@/utils/storageScope';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { CodeActivityHost, typeCode } from './support/codeActivityHost';

/**
 * THE MIGRATION THAT MUST NOT HAPPEN.
 *
 * Fase C step 5 moved the `code` kind into `@iterahq/activities/code`, and with
 * it the autosave that keeps a learner's work across a reload. The hook no
 * longer calls `codeSnapshot.service`; it calls `ActivityStoragePort` with a key
 * the PACKAGE mints, and `ITERA_ACTIVITY_STORAGE` translates that back.
 *
 * That translation is the single place where a refactor could quietly cost a
 * classroom its work. Every failure mode here is silent:
 *
 *  · a different key ⇒ every draft already on disk becomes unreachable, and the
 *    learner mid-exercise is dropped back on the starter. Nothing throws;
 *  · a key without the learner scope ⇒ the shared lab machines at Educar+ serve
 *    the next student the previous student's source, which is the exact leak
 *    `storageScope` was written for;
 *  · a raw string instead of the `{ code, savedAt }` envelope ⇒ the professor's
 *    stage (`stageAnswerContent`) reads `undefined` and projects nothing;
 *  · no `CODE_SNAPSHOT_EVENT` ⇒ the live session's "em andamento" indicator
 *    never lights up, so the professor sees "ainda não começou" for a class that
 *    is working.
 *
 * So this asserts the on-disk result of a real render, not the adapter in
 * isolation: type into the extracted kind, let the debounce fire, and look at
 * `localStorage` with the key the PRE-EXTRACTION code would have used.
 */

const ACTIVITY_ID = 'act-key-compat';
const LEARNER = 'aluno-scoped';

function makeActivity(): Activity {
  return {
    id: ACTIVITY_ID,
    lessonId: 'l',
    ordinal: 0,
    kind: 'code',
    spec: { prompt: 'p', starter: 'const inicial = 1;' },
    rubric: null,
  };
}

describe('the code draft key survived the extraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    rememberStorageScope(LEARNER);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('writes at exactly the key the Player used before step 5', () => {
    render(
      <CodeActivityHost>
        <CodeSnackActivity activity={makeActivity()} onComplete={vi.fn()} />
      </CodeActivityHost>,
    );
    typeCode('const trabalho = "do aluno";');
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // The literal key, built the way `codeSnapshot.service` builds it. Spelled
    // out rather than imported so a change to `scopedKey` cannot make this test
    // agree with itself while disagreeing with what is on the disks in the lab.
    const expected = `itera.code.snapshot:${LEARNER}:${ACTIVITY_ID}`;
    expect(scopedKey('itera.code.snapshot', ACTIVITY_ID)).toBe(expected);

    const raw = localStorage.getItem(expected);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.code).toBe('const trabalho = "do aluno";');
    // The envelope, not a bare string: `stageAnswerContent` reads `.code`.
    expect(typeof parsed.savedAt).toBe('string');

    // …and nothing landed under the package's own default key, which is what
    // would happen if a host forgot to inject the port.
    expect(localStorage.getItem(codeDraftKey(ACTIVITY_ID))).toBeNull();
  });

  it('fires the snapshot event the live session listens to, on save AND on clear', () => {
    const seen: string[] = [];
    const listener = (e: Event) =>
      seen.push((e as CustomEvent<{ activityId: string }>).detail.activityId);
    window.addEventListener('itera:code-snapshot-saved', listener);
    try {
      ITERA_ACTIVITY_STORAGE.write(codeDraftKey(ACTIVITY_ID), 'x');
      ITERA_ACTIVITY_STORAGE.clear(codeDraftKey(ACTIVITY_ID));
    } finally {
      window.removeEventListener('itera:code-snapshot-saved', listener);
    }
    // Both, and the clear especially: without it the professor's picker keeps
    // advertising work the learner has thrown away.
    expect(seen).toEqual([ACTIVITY_ID, ACTIVITY_ID]);
  });

  it('round-trips the activity id through the key the package mints', () => {
    // The adapter's only assumption about the package, made explicit. If the
    // package ever changes its prefix, this is the line that says so instead of
    // the classroom finding out.
    expect(CODE_DRAFT_KEY_PREFIX).toBe('itera.code.snapshot:');
    expect(codeDraftKey(ACTIVITY_ID)).toBe(`itera.code.snapshot:${ACTIVITY_ID}`);
    ITERA_ACTIVITY_STORAGE.write(codeDraftKey(ACTIVITY_ID), 'ida e volta');
    expect(ITERA_ACTIVITY_STORAGE.read(codeDraftKey(ACTIVITY_ID))).toBe('ida e volta');
  });

  it('gives a draft written BEFORE the extraction back to its owner', () => {
    // The migration test proper: seed the disk exactly as the pre-step-5 app
    // would have, then open the extracted kind and check the learner sees their
    // own work rather than the starter.
    localStorage.setItem(
      `itera.code.snapshot:${LEARNER}:${ACTIVITY_ID}`,
      JSON.stringify({ code: 'const antigo = true;', savedAt: '2026-08-06T10:00:00.000Z' }),
    );
    render(
      <CodeActivityHost>
        <CodeSnackActivity activity={makeActivity()} onComplete={vi.fn()} />
      </CodeActivityHost>,
    );
    expect((screen.getByTestId('mock-editor') as HTMLTextAreaElement).value).toBe(
      'const antigo = true;',
    );
  });
});
