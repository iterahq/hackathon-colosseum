/**
 * `live_type` — a scene kind (2026-09-24, plan
 * `20260924-itera-scene-animacoes-interativas`).
 *
 * Editor on the left, browser on the right. A ghost types the target element's
 * text and the browser redraws on every letter; then the learner types INSIDE
 * the same tag and the page follows each keystroke. Their own text, held still
 * for a moment, opens the gate. Ungraded; silent; the text is never recorded.
 */
import { useCallback, useRef } from 'react';
import { Keyboard } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { LiveTypeSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneCodeLine } from './scene/SceneCodeLine.js';
import { EditorFrame } from './scene/EditorFrame.js';
import { BrowserFrame } from './scene/BrowserFrame.js';
import { SparkWire } from './scene/SparkWire.js';
import { GhostCursor } from './scene/GhostCursor.js';
import { LiveTypeInput } from './scene/LiveTypeInput.js';
import { useGhostTyping } from './scene/useGhostTyping.js';
import { useLiveTypeTurn } from './scene/useLiveTypeTurn.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useSparks } from './scene/useSparks.js';

const DEFAULT_MIN_LENGTH = 2;

export function LiveTypeActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as LiveTypeSpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const target = elements.find((el) => el.id === spec?.target_id) ?? elements[0];
  const gate = useSceneGate(activity, onComplete);
  const { sparks, fire } = useSparks();
  const inputRef = useRef<HTMLInputElement>(null);
  const ghost = useGhostTyping(target?.text ?? '', !gate.solved, fire);
  const { record, open } = gate;
  const turn = useLiveTypeTurn({
    original: target?.text ?? '',
    minLength: spec?.min_length ?? DEFAULT_MIN_LENGTH,
    ghostDone: ghost.done,
    solved: gate.solved,
    inputRef,
    onGate: useCallback((length: number) => open({ length }), [open]),
    onEdit: useCallback((length: number) => record('text_edited', { length }), [record]),
  });

  if (!target) return null;
  const learnerTurn = turn.mine !== null;
  const slot = (
    <SceneCodeLine element={target}>
      {learnerTurn ? (
        <LiveTypeInput
          inputRef={inputRef}
          value={turn.mine ?? ''}
          onChange={(value) => {
            turn.change(value);
            fire();
          }}
          solved={gate.solved}
          label={t('activity.liveType.inputLabel')}
        />
      ) : (
        <GhostCursor typed={ghost.typed} />
      )}
    </SceneCodeLine>
  );

  return (
    <SceneFrame
      kind="live_type"
      icon={Keyboard}
      label={t('activity.liveType')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={gate.solved}
    >
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-0 items-stretch" data-testid="live-type-stage">
        <EditorFrame elements={elements} targetId={target.id} targetSlot={slot} />
        <SparkWire sparks={sparks} />
        <BrowserFrame elements={elements} targetId={target.id} targetText={turn.mine ?? ghost.typed} url={copy.url} />
      </div>
    </SceneFrame>
  );
}
