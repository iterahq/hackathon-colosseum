import type { Plugin } from "vite";

/** Route prefix -> the page module whose chunk (and its static imports) the browser should fetch with the entry. */
const ROUTES: ReadonlyArray<{ test: string; page: string }> = [
  { test: "^/u/", page: "src/pages/LearnerProfilePage.tsx" },
  { test: "^/c/", page: "src/pages/CredentialPage.tsx" },
  { test: "^/bounties/?$", page: "src/pages/BountiesPage.tsx" },
  { test: "^/bounties/.", page: "src/pages/BountyPage.tsx" },
  { test: "^/world/?$", page: "src/pages/WorldPage.tsx" },
  { test: "^/$", page: "src/pages/LandingPage.tsx" },
];

interface ChunkLike {
  type: string;
  fileName: string;
  facadeModuleId?: string | null;
  imports?: string[];
}

/** The chunk of `page` and every chunk it imports statically, deepest first, without the entry's own graph. */
export function routeChunks(bundle: Record<string, ChunkLike>, page: string, entryGraph: ReadonlySet<string>): string[] {
  const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
  const start = chunks.find((c) => c.facadeModuleId?.endsWith(page));
  if (!start) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file) || entryGraph.has(file)) return;
    seen.add(file);
    const chunk = chunks.find((c) => c.fileName === file);
    for (const dep of chunk?.imports ?? []) walk(dep);
    out.push(file);
  };
  walk(start.fileName);
  return out;
}

/** The entry chunk and everything it imports statically: already preloaded by Vite. */
export function entryGraph(bundle: Record<string, ChunkLike>): Set<string> {
  const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
  const entry = chunks.find((c) => (c as { isEntry?: boolean }).isEntry);
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const dep of chunks.find((c) => c.fileName === file)?.imports ?? []) walk(dep);
  };
  if (entry) walk(entry.fileName);
  return seen;
}

export function preloadScript(map: ReadonlyArray<{ test: string; files: string[] }>): string {
  const table = JSON.stringify(map.filter((m) => m.files.length > 0));
  return `<script>(function(){try{var t=${table};for(var i=0;i<t.length;i++){if(new RegExp(t[i].test).test(location.pathname)){t[i].files.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href='/'+f;document.head.appendChild(l);});break;}}}catch(e){}})();</script>`;
}

/**
 * A cold /u, /c, /bounties, /world or / visit fetched the page's chunk only after the entry ran (a second round
 * trip of ~25 small files, ~300 ms). This plugin writes, into index.html, the chunk names of those pages so the
 * browser preloads the right one with the entry.
 */
export function routePreloadPlugin(): Plugin {
  return {
    name: "itera:route-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle as Record<string, ChunkLike> | undefined;
        if (!bundle) return html;
        const entry = entryGraph(bundle);
        const map = ROUTES.map(({ test, page }) => ({ test, files: routeChunks(bundle, page, entry) }));
        return html.replace("</head>", `${preloadScript(map)}\n  </head>`);
      },
    },
  };
}
