import type { ActivityStoragePort } from '../ports.js';
import { codeDraftKey } from './draftKey.js';
import type { CodeSource } from './types.js';

/**
 * What the editor opens with: the learner's OWN saved work when there is any,
 * the authored starter otherwise.
 *
 * The port swallows a broken/blocked storage and answers `null` (the package's
 * localStorage default does; the Itera Player's adapter delegates to
 * `codeSnapshot.service`, which has always done the same), so a browser in
 * private mode simply falls back to the starter — an activity must never fail
 * to open because localStorage said no.
 *
 * `hasWork` is decided HERE and not later, because this is the only moment where
 * the answer is knowable: a restored draft and a pristine starter are
 * indistinguishable by content once the string is in state. It rides along
 * because the professor's stage and the presence signal both need to tell them
 * apart, and a reload must not demote a learner's work to "sem edições".
 *
 * Pure on purpose — no React, no module state — so the seeding rule can be
 * tested without mounting an editor.
 */
export function seedCodeSource(
  storage: ActivityStoragePort,
  activityId: string,
  starter: string | undefined,
): CodeSource {
  const saved = storage.read(codeDraftKey(activityId));
  return { code: saved ?? starter ?? '', hasWork: saved !== null };
}
