import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const HostOwnsSettledActionContext = createContext(false);

/**
 * A host that renders its own "continue" control for a settled activity (the
 * lesson player on review, or right after a submit) wraps the renderer in this
 * provider. The activity then drops its own dead action button — the locked
 * "Enviado"/"Concluída", the disabled "Enviar" — instead of stacking it above
 * the host's. Feedback, verdicts and the restored answer are never hidden.
 *
 * Context rather than a renderer prop: renderer props are a frozen contract.
 * Without the provider nothing changes (the live class keeps the locked look).
 */
export function HostOwnsSettledAction({ children }: { children: ReactNode }) {
  return <HostOwnsSettledActionContext.Provider value>{children}</HostOwnsSettledActionContext.Provider>;
}

export function useHostOwnsSettledAction(): boolean {
  return useContext(HostOwnsSettledActionContext);
}
