import { useEffect, useState } from 'react';

/**
 * Which lens tabs hold something the learner has not looked at.
 *
 * `signatures` maps each lens to a string that changes when its content does.
 * A lens other than the active one whose signature differs from the one the
 * learner last saw is unseen; looking at a lens (opening it, or staying on it
 * while it changes) marks it seen. Same idea as `useResultBadge` for the code tab.
 */
export function useLensBadges<L extends string>(active: L | undefined, signatures: Record<L, string>) {
  const [seen, setSeen] = useState<Record<string, string>>(signatures);
  const activeSignature = active === undefined ? undefined : signatures[active];

  useEffect(() => {
    if (active === undefined || activeSignature === undefined) return;
    setSeen((current) => (current[active] === activeSignature ? current : { ...current, [active]: activeSignature }));
  }, [active, activeSignature]);

  return (lens: L) => lens !== active && seen[lens] !== signatures[lens];
}
