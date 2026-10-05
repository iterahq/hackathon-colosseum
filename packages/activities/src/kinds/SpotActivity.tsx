/**
 * `spot` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch B).
 *
 * Ports `SpotBeat` (`itera-cenas-a1f3/_src/src/mechanics/SpotBeat.tsx`). The
 * page on the right is broken; the source on the left holds the bug. Tap the
 * exact token that broke it and it heals in place (`bugs[].fixed_text` swaps
 * in, `page` elements carrying that `broken_by` id heal too). A miss shows
 * `miss_hint`; the beat completes once every bug is found. Every token looks
 * and answers the same, so the source never points at its own bug. A `done`
 * activity opens with every bug fixed.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`SpotSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useMemo, useState } from 'react';
import { Bug } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { SpotSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneBrowserBar } from './scene/SceneBrowserBar.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { SCENE_CODE_BACKGROUND, SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

export function SpotActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as SpotSpec;
  const copy = useSceneText(spec);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;

  const [fixed, setFixed] = useState<Set<string>>(
    () => new Set(activity.status === 'done' ? (spec?.bugs ?? []).map((b) => b.id) : []),
  );
  const { showHint, clearHint, hintProps } = useWrongHint();

  const bugsById = useMemo(() => new Map((spec?.bugs ?? []).map((b) => [b.id, b])), [spec?.bugs]);
  const total = spec?.bugs?.length ?? 0;

  const tap = (bugId: string | undefined) => {
    if (solved) return;
    const bug = bugId ? bugsById.get(bugId) : undefined;
    if (!bug || fixed.has(bug.id)) {
      record('wrong_try', { bug_id: bugId ?? null });
      showHint(copy.text(spec?.miss_hint));
      return;
    }
    const next = new Set(fixed).add(bug.id);
    setFixed(next);
    record('element_found', { element_id: bug.id });
    showHint(bug.note ? copy.text(bug.note) : null, 'hit');
    if (next.size === total) open({ bugs: next.size });
  };

  return (
    <SceneFrame
      kind="spot"
      icon={Bug}
      label={t('activity.spot')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className="grid md:grid-cols-2 gap-5 items-stretch" data-testid="spot-stage">
        <div
          className={`rounded-xl border border-white/10 p-5 flex flex-col gap-1.5 ${TOUCH_SURFACE}`}
          style={{ background: SCENE_CODE_BACKGROUND }}
          data-testid="spot-editor"
        >
          <span className="font-mono text-[11px] text-white/40 mb-1">{spec?.file}</span>
          {(spec?.lines ?? []).map((tokens, i) => (
            <span key={i} className="font-mono text-[13px]" style={{ whiteSpace: 'pre' }}>
              {tokens.map((token, j) => {
                const bug = token.bug_id ? bugsById.get(token.bug_id) : undefined;
                const isFixed = token.bug_id ? fixed.has(token.bug_id) : false;
                const text = isFixed && bug ? bug.fixed_text : token.text;
                return (
                  <span
                    key={j}
                    role="button"
                    tabIndex={solved ? undefined : 0}
                    data-testid={token.bug_id ? `spot-token-${token.bug_id}` : `spot-token-plain-${i}-${j}`}
                    onClick={() => tap(token.bug_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        // Space on a role=button would otherwise scroll the page.
                        event.preventDefault();
                        tap(token.bug_id);
                      }
                    }}
                    className={
                      isFixed ? 'text-evergreen' : `text-white/85 ${solved ? '' : 'cursor-pointer hover:bg-white/10'}`
                    }
                  >
                    {text}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
        <div
          className="rounded-xl overflow-hidden border border-black/10 min-h-[160px]"
          style={{ background: SCENE_PAGE_BACKGROUND }}
          data-testid="spot-preview"
        >
          <SceneBrowserBar url={copy.url} />
          <div className="flex flex-col gap-3 p-6">
            {(spec?.page?.elements ?? []).map((el) => (
              <ScenePageElement
                key={el.id}
                element={el}
                text={el.broken_by && fixed.has(el.broken_by) ? bugsById.get(el.broken_by)?.fixed_text : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      {!solved && <WrongHint {...hintProps} />}
    </SceneFrame>
  );
}
