import { writeFileSync } from "fs";
import path from "path";
import type { Plugin } from "vite";

interface ChunkReport {
  file: string;
  bytes: number;
  entry: boolean;
  imports: string[];
  modules: Array<{ id: string; bytes: number }>;
}

/** `ITERA_BUNDLE_REPORT=1 vite build` writes dist/bundle-report.json: every chunk, its size and the modules inside it, largest first. */
export function bundleReportPlugin(): Plugin {
  return {
    name: "itera:bundle-report",
    apply: "build",
    generateBundle(options, bundle) {
      if (!process.env.ITERA_BUNDLE_REPORT) return;
      const chunks: ChunkReport[] = [];
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;
        const modules = Object.entries(output.modules)
          .map(([id, info]) => ({ id: id.replace(/^.*node_modules\//, "node_modules/").replace(process.cwd() + "/", ""), bytes: info.renderedLength }))
          .sort((a, b) => b.bytes - a.bytes);
        chunks.push({ file, bytes: output.code.length, entry: output.isEntry, imports: output.imports, modules });
      }
      chunks.sort((a, b) => b.bytes - a.bytes);
      writeFileSync(path.resolve(options.dir ?? "dist", "bundle-report.json"), JSON.stringify(chunks, null, 1));
    },
  };
}
