import { describe, expect, it } from "vitest";
import type { StoryIndex } from "storybook/internal/types";
import { browserTier, assertBrowserTierExecuted } from "./browser-tier";

const story = (id: string, file: string, tags: string[]) => ({
  type: "story" as const,
  subtype: "story" as const,
  id,
  title: "Fixture",
  name: id,
  importPath: file,
  tags,
});
describe("canonical browser tier discovery", () => {
  it("keeps every indexed tagged story and deduplicates files, including a newly added story", () => {
    const entries: StoryIndex["entries"] = {
      positive: story("positive", "./src/code.stories.tsx", [
        "test",
        "browser-mode",
      ]),
      negative: story("negative", "./src/code.stories.tsx", ["browser-mode"]),
      future: story("future", "./design-playground/new.stories.tsx", [
        "browser-mode",
      ]),
      normal: story("normal", "./src/normal.stories.tsx", ["test"]),
      removed: story("removed", "./src/removed.stories.tsx", ["test"]),
      docs: {
        ...story("docs", "./src/docs.mdx", ["browser-mode"]),
        type: "docs",
        storiesImports: [],
      },
    };
    expect(browserTier({ entries })).toEqual({
      files: ["./design-playground/new.stories.tsx", "./src/code.stories.tsx"],
      storyIds: ["future", "negative", "positive"],
    });
  });
  it("fails closed on an empty tier or a path outside the project", () => {
    expect(() => browserTier({ entries: {} })).toThrow("No browser-mode");
    expect(() =>
      browserTier({
        entries: {
          invalid: story("invalid", "../outside.tsx", ["browser-mode"]),
        },
      }),
    ).toThrow("outside");
  });
});

it("requires every discovered ID to execute exactly once, with no hidden skip or extra test", () => {
  const index = {
    entries: {
      positive: story("positive", "./src/code.stories.tsx", ["browser-mode"]),
      negative: story("negative", "./src/code.stories.tsx", ["browser-mode"]),
    },
  };
  const report = {
    testResults: [
      {
        name: "/repo/src/code.stories.tsx",
        assertionResults: [
          { title: "positive", status: "passed" },
          { title: "negative", status: "failed" },
        ],
      },
    ],
  };
  expect(assertBrowserTierExecuted(index, report, "/repo")).toEqual([
    "negative",
    "positive",
  ]);
  for (const assertions of [
    report.testResults[0].assertionResults.slice(0, 1),
    [
      { title: "positive", status: "passed" },
      { title: "negative", status: "pending" },
    ],
    [
      ...report.testResults[0].assertionResults,
      { title: "positive", status: "passed" },
    ],
    [
      ...report.testResults[0].assertionResults,
      { title: "unexpected", status: "passed" },
    ],
  ])
    expect(() =>
      assertBrowserTierExecuted(
        index,
        {
          testResults: [
            { name: report.testResults[0].name, assertionResults: assertions },
          ],
        },
        "/repo",
      ),
    ).toThrow();
});
