import { useCallback, useState } from "react";
import type { TeraElementId } from "@/types/scenePrototype";
import { TERA_ELEMENTS } from "./teraElements";
import { playClip } from "./sfx";

/** Which element is under the pointer, and which ones were ever found. */
export function useDiscoveries(solved: boolean, onSolved: () => void) {
  const [active, setActive] = useState<TeraElementId | null>(null);
  const [found, setFound] = useState(new Set<TeraElementId>());

  const discover = useCallback(
    (id: TeraElementId) => {
      setActive(id);
      if (found.has(id)) return;
      const next = new Set(found).add(id);
      setFound(next);
      playClip("chime", 0.35);
      if (next.size === TERA_ELEMENTS.length && !solved) onSolved();
    },
    [found, solved, onSolved],
  );

  return { active, found, discover, release: () => setActive(null) };
}
