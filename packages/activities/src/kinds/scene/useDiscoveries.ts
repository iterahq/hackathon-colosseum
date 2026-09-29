import { useCallback, useState } from 'react';

/**
 * Which element is under the pointer, and which were ever found. Each FIRST
 * find is reported once (`onFound`); finding them all reports `onAll` once.
 */
export function useDiscoveries({
  ids,
  solved,
  onFound,
  onAll,
}: {
  ids: string[];
  solved: boolean;
  onFound: (id: string) => void;
  onAll: (count: number) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [found, setFound] = useState<ReadonlySet<string>>(() => new Set(solved ? ids : []));

  const discover = useCallback(
    (id: string) => {
      setActive(id);
      if (solved || found.has(id)) return;
      const next = new Set(found).add(id);
      setFound(next);
      onFound(id);
      if (ids.every((known) => next.has(known))) onAll(next.size);
    },
    [found, ids, solved, onFound, onAll],
  );

  return { active, found: solved ? new Set(ids) : found, discover, release: () => setActive(null) };
}
