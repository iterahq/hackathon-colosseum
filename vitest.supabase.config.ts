import { defineConfig } from "vitest/config";

// Edge-function code is Deno, outside the app's jsdom setup: only its pure modules are tested here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/functions/**/*.test.ts"],
  },
});
