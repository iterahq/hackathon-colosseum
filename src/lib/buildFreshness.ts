const ENTRY = /\/assets\/index-[\w-]+\.js/;
const RELOADED_KEY = 'itera.route.staleBuildReloaded';

/** The hashed entry script this tab booted from; `null` outside a production build. */
export function loadedEntryScript(doc: Document = document): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[src]'))) {
    const match = ENTRY.exec(script.getAttribute('src') ?? '');
    if (match) return match[0];
  }
  return null;
}

/** The entry script the server hands out now. `null` when it cannot be read. */
export async function deployedEntryScript(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher('/index.html', { cache: 'no-store' });
    if (!response.ok) return null;
    return ENTRY.exec(await response.text())?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * True when the tab runs a build older than the deployed one and has not yet
 * been reloaded for this path. A route this tab does not know may simply be
 * newer than the tab: the caller reloads instead of saying "not found".
 */
export async function shouldReloadForNewBuild(path: string, loaded = loadedEntryScript(), fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!loaded) return false;
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === path) return false;
  } catch {
    return false;
  }
  const deployed = await deployedEntryScript(fetcher);
  if (!deployed || deployed === loaded) return false;
  try {
    sessionStorage.setItem(RELOADED_KEY, path);
  } catch {
    return false;
  }
  return true;
}
