import { describe, expect, it } from "vitest";
import { entryGraph, preloadScript, routeChunks } from "./route-preload";

const bundle = {
  "assets/index-A.js": { type: "chunk", fileName: "assets/index-A.js", isEntry: true, facadeModuleId: "/app/src/main.tsx", imports: ["assets/react-B.js"] },
  "assets/react-B.js": { type: "chunk", fileName: "assets/react-B.js", imports: [] },
  "assets/LearnerProfilePage-C.js": { type: "chunk", fileName: "assets/LearnerProfilePage-C.js", facadeModuleId: "/app/src/pages/LearnerProfilePage.tsx", imports: ["assets/react-B.js", "assets/graph-D.js"] },
  "assets/graph-D.js": { type: "chunk", fileName: "assets/graph-D.js", imports: ["assets/explorer-E.js"] },
  "assets/explorer-E.js": { type: "chunk", fileName: "assets/explorer-E.js", imports: [] },
  "assets/index-F.css": { type: "asset", fileName: "assets/index-F.css" },
};

describe("routeChunks", () => {
  it("lists the page chunk and its static imports, deepest first, skipping what the entry already preloads", () => {
    expect(routeChunks(bundle, "src/pages/LearnerProfilePage.tsx", entryGraph(bundle))).toEqual(["assets/explorer-E.js", "assets/graph-D.js", "assets/LearnerProfilePage-C.js"]);
  });

  it("is empty for a page that is not in the bundle", () => {
    expect(routeChunks(bundle, "src/pages/Nope.tsx", entryGraph(bundle))).toEqual([]);
  });
});

describe("preloadScript", () => {
  it("keeps only routes with files and matches the path with a regular expression", () => {
    const script = preloadScript([{ test: "^/u/", files: ["assets/a.js"] }, { test: "^/x/", files: [] }]);
    expect(script).toContain('"^/u/"');
    expect(script).not.toContain('"^/x/"');
    expect(script).toContain("modulepreload");
  });
});
