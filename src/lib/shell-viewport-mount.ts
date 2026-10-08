import { lockedViewport } from './shell-viewport';
import { readShellSurface, subscribeShellSurface } from './shellSurface';

/** Pins the page scale once the bridge says this is the native shell (see `shell-viewport.ts`). A browser tab is left alone. */
export function mountShellViewport(doc: Document = document): void {
  let unsubscribe = (): void => undefined;
  const apply = (): void => {
    if (readShellSurface() !== 'shell') return;
    const meta = doc.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', lockedViewport(meta.getAttribute('content') ?? ''));
    unsubscribe();
  };
  unsubscribe = subscribeShellSurface(apply);
  apply();
}
