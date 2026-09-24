import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { playClip } from "./sfx";

const GRID_COLS = 14;
const GRID_ROWS = 9;
export const COVERAGE_GOAL = 0.3;

/** Tracks the lens position and how much of the stage it has swept. */
export function useXrayScan(stageRef: RefObject<HTMLDivElement>, solved: boolean, onSolved: () => void) {
  const visited = useRef(new Set<number>());
  const lastTick = useRef(0);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [coverage, setCoverage] = useState(0);

  const scan = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box) return;
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
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
      const now = performance.now();
      if (now - lastTick.current > 140) {
        lastTick.current = now;
        playClip("click", 0.08);
      }
      if (next >= COVERAGE_GOAL) onSolved();
    },
    [stageRef, solved, onSolved],
  );

  useEffect(() => {
    if (solved) setCoverage(COVERAGE_GOAL);
  }, [solved]);

  return { lens, coverage, scan, clearLens: () => setLens(null) };
}
