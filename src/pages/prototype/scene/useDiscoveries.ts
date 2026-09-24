import { useCallback, useState } from "react";
import type { DudaElementId } from "@/types/scenePrototype";
import { DUDA_ELEMENTS } from "./dudaElements";
import { playClip } from "./sfx";

/** Which element is under the pointer, and which ones were ever found. */
export function useDiscoveries(solved: boolean, onSolved: () => void) {
  const [active, setActive] = useState<DudaElementId | null>(null);
  const [found, setFound] = useState(new Set<DudaElementId>());

  const discover = useCallback(
    (id: DudaElementId) => {
      setActive(id);
      if (found.has(id)) return;
      const next = new Set(found).add(id);
      setFound(next);
      playClip("chime", 0.35);
      if (next.size === DUDA_ELEMENTS.length && !solved) onSolved();
    },
    [found, solved, onSolved],
  );

  return { active, found, discover, release: () => setActive(null) };
}
