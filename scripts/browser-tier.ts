import { resolve } from "node:path";
import type { StoryIndex } from "storybook/internal/types";

/** Storybook already resolves preview/meta/story tags, including tag removals. */
export function browserTier(index: Pick<StoryIndex, "entries">) {
  const stories = Object.values(index.entries).filter(
    (entry) => entry.type === "story" && entry.tags?.includes("browser-mode"),
  );
  if (!stories.length) throw new Error("No browser-mode stories were indexed");
  const files = [...new Set(stories.map((story) => story.importPath))].sort();
  if (
    files.some(
      (file) => !file.startsWith("./") || file.split("/").includes(".."),
    )
  )
    throw new Error("A browser-mode story is outside the project");
  return { files, storyIds: stories.map((story) => story.id).sort() };
}

export interface BrowserTierReport {
  testResults: Array<{
    name: string;
    assertionResults: Array<{ title: string; status: string }>;
  }>;
}
/** An indexed ID counts only when Vitest actually executes its matching case. */
export function assertBrowserTierExecuted(
  index: Pick<StoryIndex, "entries">,
  report: BrowserTierReport,
  root: string,
) {
  const tier = browserTier(index);
  const expected = Object.values(index.entries).filter((entry) =>
    tier.storyIds.includes(entry.id),
  );
  const executed: string[] = [];
  for (const file of report.testResults) {
    for (const test of file.assertionResults) {
      if (!["passed", "failed"].includes(test.status)) continue;
      const matches = expected.filter(
        (entry) =>
          resolve(root, entry.importPath) === resolve(file.name) &&
          entry.name === test.title,
      );
      if (matches.length !== 1)
        throw new Error(
          `Unexpected or ambiguous browser case: ${file.name} / ${test.title}`,
        );
      executed.push(matches[0].id);
    }
  }
  executed.sort();
  if (JSON.stringify(executed) !== JSON.stringify(tier.storyIds))
    throw new Error(
      `Browser discovery/execution mismatch: expected ${JSON.stringify(tier.storyIds)}, executed ${JSON.stringify(executed)}`,
    );
  return executed;
}
