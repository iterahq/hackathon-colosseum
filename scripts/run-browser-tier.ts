import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { buildIndex } from "storybook/internal/core-server";
import { browserTier, assertBrowserTierExecuted } from "./browser-tier";

async function main() {
  // Runtime tag filtering imports every CSF module first. With the full catalog,
  // Chromium exhausts requests before it can skip files outside this tier.
  // Use Storybook's own index, so tag inheritance and new stories stay automatic.
  const index = await buildIndex({ configDir: ".storybook" });
  const tier = browserTier(index);
  console.log(JSON.stringify({ browserTier: tier }));
  const require = createRequire(import.meta.url);
  const vitest = join(
    dirname(require.resolve("vitest/package.json")),
    "vitest.mjs",
  );
  const directory = mkdtempSync(join(tmpdir(), "itera-browser-tier-"));
  const report = join(directory, "vitest.json");
  try {
    const result = spawnSync(
      process.execPath,
      [
        vitest,
        "run",
        "--config",
        "vitest.browser.config.ts",
        ...tier.files,
        ...process.argv.slice(2),
        "--reporter=default",
        "--reporter=json",
        `--outputFile=${report}`,
      ],
      { stdio: "inherit", env: process.env },
    );
    if (result.error) throw result.error;
    const executed = assertBrowserTierExecuted(
      index,
      JSON.parse(readFileSync(report, "utf8")),
      process.cwd(),
    );
    console.log(
      JSON.stringify({
        discoveredStoryIds: tier.storyIds,
        executedStoryIds: executed,
        exactMatch: true,
      }),
    );
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
