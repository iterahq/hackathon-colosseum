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
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
