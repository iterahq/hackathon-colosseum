import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `scripts/` joined `src/` when the build-time `data-source` stamp landed
    // there (`scripts/source-stamp.ts`). Build tooling that decides what ships
    // deserves the same unit coverage as product code, and the alternative -
    // parking its test under `src/` - would put a `typescript` import inside the
    // app's own tsconfig program for no reason.
    // `e2e/support/**` joined them for the capture: `resolveRegionAt` decides
    // which file a click reports, its tie-breaking rules are the part a real
    // screen exercises only by accident, and it is a pure function — so it
    // belongs in the fast unit run, not only in the browser suite.
    // ⚠️ `.test.ts` ONLY under `e2e/`. Playwright globs `*.spec.ts` there;
    // widening this to `spec` would make both runners claim the same files.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "e2e/support/**/*.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
