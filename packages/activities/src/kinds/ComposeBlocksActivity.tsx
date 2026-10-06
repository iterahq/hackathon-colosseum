/**
 * `compose_blocks` — a system kind (2026-09-30, Tainan's Week 1 proposal).
 *
 * The learner builds a containment tree from palette blocks: drag a block onto
 * a parent slot, or tap the block and then the slot (the same gesture with a
 * finger). A live preview renders each placed block's view, nested by the
 * tree. A block that does not belong under that parent bounces with
 * `wrong_hint`; the beat completes once the tree equals `target`.
 *
 * ⚠️ Mirrors the `@iterahq/activity-spec` read shape locally
 * (`ComposeBlocksSpec` in `../specs.js`) — see the release-gate note there.
 */
import { useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Blocks, CornerDownRight, X } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { ComposeBlockSpec, ComposeBlocksSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useGestureSettle } from './scene/useGestureSettle.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { SystemView } from './system/SystemView.js';
import {
  acceptsChildren,
  allowedPairs,
  composeView,
  countBlock,
  findNode,
  insertChild,
  removeNode,
  targetAsPlaced,
  treeMatches,
  type PlacedNode,
} from './system/composeTree.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

const DRAG_TYPE = 'application/x-itera-block';

function codeName(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

export function ComposeBlocksActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as ComposeBlocksSpec;
  const copy = useSceneText(spec);
  const { record, open, solved } = useSceneGate(activity, onComplete);
  const blocks = useMemo(() => new Map((spec?.blocks ?? []).map((b) => [b.id, b])), [spec?.blocks]);
  const pairs = useMemo(() => (spec?.target ? allowedPairs(spec.target) : new Map<string, number>()), [spec?.target]);
  const ordered = spec?.sibling_order_matters === true;

  const empty: PlacedNode = { uid: 'root', block: spec?.root ?? '', children: [] };
  const [tree, setTree] = useState<PlacedNode>(() =>
    activity.status === 'done' && spec?.target ? targetAsPlaced(spec.target) : empty,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const { showHint, clearHint, hintProps } = useWrongHint();
  const [overSlot, setOverSlot] = useState<string | null>(null);
  const seq = useRef(0);

  const matches = !!spec?.target && treeMatches(tree, spec.target, ordered);
  useGestureSettle(matches && !solved, () => open({ blocks: countAll(tree) }));

  const label = (block: ComposeBlockSpec | undefined) =>
    !block ? '' : spec?.item_style === 'code' ? `<${codeName(block.id)} />` : copy.text(block.label);

  const remaining = (block: ComposeBlockSpec) =>
    block.max === undefined ? Infinity : block.max - countBlock(tree, block.id);

  const place = (blockId: string, parentUid: string) => {
    if (solved) return;
    const parent = findNode(tree, parentUid);
    const block = blocks.get(blockId);
    if (!parent || !block) return;
    const allowed = pairs.get(`${parent.block}>${blockId}`) ?? 0;
    const siblings = parent.children.filter((c) => c.block === blockId).length;
    if (allowed === 0 || siblings >= allowed || remaining(block) <= 0) {
      record('wrong_try', { block_id: blockId, parent_block: parent.block });
      showHint(copy.text(spec?.wrong_hint) || t('activity.composeBlocks.wrongHint'));
      setPicked(null);
      return;
    }
    seq.current += 1;
    setTree((current) => insertChild(current, parentUid, { uid: `n${seq.current}`, block: blockId, children: [] }));
    setPicked(null);
    clearHint();
    record('block_placed', { block_id: blockId, parent_block: parent.block });
  };

  const remove = (node: PlacedNode) => {
    if (solved) return;
    setTree((current) => removeNode(current, node.uid));
    record('block_removed', { block_id: node.block });
  };

  const onDrop = (event: DragEvent, parentUid: string) => {
    event.preventDefault();
    setOverSlot(null);
    const blockId = event.dataTransfer.getData(DRAG_TYPE) || picked;
    if (blockId) place(blockId, parentUid);
  };

  const preview = spec ? composeView(tree, blocks) : null;
  const palette = (spec?.blocks ?? []).filter((b) => b.id !== spec?.root);

  const renderNode = (node: PlacedNode, depth: number) => {
    const block = blocks.get(node.block);
    const slot = acceptsChildren(block) && !solved;
    return (
      <li key={node.uid} className="flex flex-col gap-1.5" data-testid={`compose-node-${node.uid}`}>
        <div className="flex items-center gap-2">
          {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span
            className={`rounded-md border border-border bg-card px-2.5 py-1 text-sm ${spec?.item_style === 'code' ? 'font-mono' : 'font-semibold'}`}
          >
            {label(block)}
          </span>
          {depth > 0 && !solved && (
            <button
              type="button"
              onClick={() => remove(node)}
              aria-label={t('activity.composeBlocks.remove', { name: label(block) })}
              data-testid={`compose-remove-${node.uid}`}
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {(node.children.length > 0 || slot) && (
          <ul className="ml-4 flex flex-col gap-1.5 border-l border-dashed border-border pl-3">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {slot && (
              <li>
                <button
                  type="button"
                  data-testid={`compose-slot-${node.uid}`}
                  onClick={() => picked && place(picked, node.uid)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverSlot(node.uid);
                  }}
                  onDragLeave={() => setOverSlot(null)}
                  onDrop={(event) => onDrop(event, node.uid)}
                  className={`w-full rounded-lg border-2 border-dashed px-3 py-2 text-left text-xs transition-colors ${
                    picked || overSlot === node.uid
                      ? 'border-[#6366F1] bg-[#6366F1]/10 text-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {t('activity.composeBlocks.placeHere')}
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <SceneFrame
      kind="compose_blocks"
      icon={Blocks}
      label={t('activity.composeBlocks')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className={`grid gap-4 max-sm:gap-3 md:grid-cols-2 ${TOUCH_SURFACE}`} data-testid="compose-stage">
        <div className="flex flex-col gap-4 max-sm:gap-3">
          {!solved && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {t('activity.composeBlocks.palette')}
              </span>
              <div className="flex flex-wrap gap-2">
                {palette.map((block) => {
                  const spent = remaining(block) <= 0;
                  return (
                    <button
                      key={block.id}
                      type="button"
                      draggable={!spent}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, block.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setPicked(block.id);
                      }}
                      onDragEnd={() => setOverSlot(null)}
                      onClick={() => setPicked((current) => (current === block.id ? null : block.id))}
                      aria-pressed={picked === block.id}
                      disabled={spent}
                      data-testid={`compose-block-${block.id}`}
                      className={`coarse:relative coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${
                        spec?.item_style === 'code' ? 'font-mono' : 'font-semibold'
                      } ${picked === block.id ? 'border-[#6366F1] bg-[#6366F1]/15' : 'border-border bg-card hover:border-foreground/30'}`}
                    >
                      {label(block)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t('activity.composeBlocks.pickFirst')}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {t('activity.composeBlocks.tree')}
            </span>
            <ul className="flex flex-col gap-1.5" data-testid="compose-tree">
              {renderNode(tree, 0)}
            </ul>
          </div>
          {!solved && <WrongHint {...hintProps} />}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t('activity.composeBlocks.preview')}
          </span>
          {preview && (
            <SystemView
              view={preview}
              testId="compose-preview"
              unboundLabel={(id) => {
                const uid = id.split('__')[0];
                return label(blocks.get(findNode(tree, uid)?.block ?? ''));
              }}
            />
          )}
        </div>
      </div>
    </SceneFrame>
  );
}

function countAll(node: PlacedNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countAll(child), 0);
}
