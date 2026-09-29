import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const GRID_COLS = 14;
const GRID_ROWS = 9;
export const DEFAULT_COVERAGE_GOAL = 0.3;

const ARROW_STEPS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Tracks the lens and how much of the stage it has swept. Each move marks the
 * lens cell and its 8 neighbours; reaching `goal` calls `onGoal` once. Silent
 * by design — the gesture is the feedback, not a sound (Tainan, 2026-09-24).
 */
export function useXrayScan(stageRef: RefObject<HTMLDivElement>, goal: number, solved: boolean, onGoal: () => void) {
  const visited = useRef(new Set<number>());
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [coverage, setCoverage] = useState(0);

  const scanAt = useCallback(
    (x: number, y: number, box: DOMRect) => {
      setLens({ x, y });
      if (solved) return;
      const col = Math.floor((x / box.width) * GRID_COLS);
      const row = Math.floor((y / box.height) * GRID_ROWS);
      const before = visited.current.size;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = col + dc;
          const r = row + dr;
          if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) visited.current.add(r * GRID_COLS + c);
        }
      }
      if (visited.current.size === before) return;
      const next = visited.current.size / (GRID_COLS * GRID_ROWS);
      setCoverage(next);
      if (next >= goal) onGoal();
    },
    [goal, solved, onGoal],
  );

  const scan = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      scanAt(event.clientX - box.left, event.clientY - box.top, box);
    },
    [stageRef, scanAt],
  );

  // The keyboard path of the same gesture: arrows walk the lens one grid cell
  // at a time, so the sweep marks the same cells the pointer would.
  const scanKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = ARROW_STEPS[event.key];
      if (!step || solved) return;
      const box = stageRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      event.preventDefault();
      const cellW = box.width / GRID_COLS;
      const cellH = box.height / GRID_ROWS;
      const from = lens ?? { x: box.width / 2 - step[0] * cellW, y: box.height / 2 - step[1] * cellH };
      const x = Math.min(box.width - 1, Math.max(0, from.x + step[0] * cellW));
      const y = Math.min(box.height - 1, Math.max(0, from.y + step[1] * cellH));
      scanAt(x, y, box);
    },
    [stageRef, scanAt, solved, lens],
  );

  const progress = solved ? 1 : Math.min(1, coverage / goal);
  return { lens, progress, scan, scanKey, clearLens: () => setLens(null) };
}
