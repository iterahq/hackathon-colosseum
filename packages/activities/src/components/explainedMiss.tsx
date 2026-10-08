import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const HostExplainsMissesContext = createContext(false);

/**
 * A host that shows the authored explanation of a miss itself, from
 * `onComplete`'s `detail.explanation` (the lesson player's feedback footer),
 * wraps the renderer in this provider. The activity then keeps its own
 * explanation card for a review and stays out right after a submit.
 *
 * Without the provider the card shows after a wrong submit: a host with no
 * feedback surface still tells the learner why.
 */
export function HostExplainsMisses({ children }: { children: ReactNode }) {
  return <HostExplainsMissesContext.Provider value>{children}</HostExplainsMissesContext.Provider>;
}

export function useHostExplainsMisses(): boolean {
  return useContext(HostExplainsMissesContext);
}
