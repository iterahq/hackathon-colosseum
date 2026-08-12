/**
 * Unit tests for the `data-source` build stamp.
 *
 * The first block is the one that matters most: **the default is off**. It is
 * written against the gate FUNCTION rather than against a build, so it states
 * the rule in one place and fails fast. The complementary proof — that the
 * default holds over the bytes that ship — is `scripts/assert-no-source-stamp.mjs`
 * in CI, which is a different claim about a different artifact.
 */
import { describe, it, expect } from "vitest";
import {
  SOURCE_STAMP_ATTR,
  SOURCE_STAMP_ENV,
  isSourceStampEnabled,
  sourceStamp,
  stampSource,
} from "./source-stamp";

describe("the gate is off unless somebody sets it", () => {
  it("is off for an empty environment", () => {
    expect(isSourceStampEnabled({})).toBe(false);
  });

  it("ignores NODE_ENV and mode entirely", () => {
    // The point of the whole design: a capture build IS a production build, so
    // no test on the mode can separate them. If someone reintroduces such a
    // test, one of these two flips.
    expect(isSourceStampEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isSourceStampEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("treats an explicit off value as off", () => {
    for (const value of ["0", "", " ", "false", "off", "no", "maybe"]) {
      expect(isSourceStampEnabled({ [SOURCE_STAMP_ENV]: value })).toBe(false);
    }
  });

  it("is on only for an explicit on value", () => {
    for (const value of ["1", "true", "TRUE", " on ", "yes"]) {
      expect(isSourceStampEnabled({ [SOURCE_STAMP_ENV]: value })).toBe(true);
    }
  });

  it("returns no plugin at all when off, so nothing can run by accident", () => {
    expect(sourceStamp({ root: "/repo", env: {} })).toBeUndefined();
    expect(sourceStamp({ root: "/repo", env: { NODE_ENV: "production" } })).toBeUndefined();
    expect(sourceStamp({ root: "/repo", env: { [SOURCE_STAMP_ENV]: "1" } })).toBeDefined();
  });
});

describe("what gets stamped", () => {
  it("stamps a host element with its file and the line of the tag", () => {
    const out = stampSource(`const a = 1;\nexport const X = () => <div>hi</div>;\n`, "src/X.tsx");
    expect(out.stamped).toBe(1);
    expect(out.code).toContain(`<div ${SOURCE_STAMP_ATTR}="src/X.tsx:2">`);
  });

  it("stamps a self-closing host element", () => {
    const out = stampSource(`export const X = () => <img src="a.png" />;\n`, "src/X.tsx");
    expect(out.stamped).toBe(1);
    expect(out.code).toContain(`<img ${SOURCE_STAMP_ATTR}="src/X.tsx:1" src="a.png" />`);
  });

  it("does NOT stamp components, member expressions or fragments", () => {
    const out = stampSource(
      `export const X = () => (\n  <>\n    <Button />\n    <Foo.Bar />\n  </>\n);\n`,
      "src/X.tsx"
    );
    expect(out.stamped).toBe(0);
    expect(out.code).not.toContain(SOURCE_STAMP_ATTR);
  });

  it("leaves a hand-written data-source alone", () => {
    const src = `export const X = () => <div data-source="mine">hi</div>;\n`;
    const out = stampSource(src, "src/X.tsx");
    expect(out.stamped).toBe(0);
    expect(out.code).toBe(src);
  });

  it("reports the line of the TAG on a multi-line element", () => {
    const out = stampSource(
      `const pad = 1;\nconst more = 2;\nexport const X = () => (\n  <section\n    className="x"\n  >\n    hi\n  </section>\n);\n`,
      "src/deep/X.tsx"
    );
    expect(out.stamped).toBe(1);
    expect(out.code).toContain(`<section ${SOURCE_STAMP_ATTR}="src/deep/X.tsx:4"`);
  });

  it("stamps every host element in a nested tree", () => {
    const out = stampSource(
      `export const X = () => (\n  <div>\n    <span>a</span>\n    <Button>\n      <b>c</b>\n    </Button>\n  </div>\n);\n`,
      "src/X.tsx"
    );
    // div, span, b - not Button.
    expect(out.stamped).toBe(3);
  });

  it("puts the stamp FIRST so real code wins", () => {
    // A later `{...props}` spread must be able to override the machine value.
    const out = stampSource(`export const X = (p) => <div {...p} />;\n`, "src/X.tsx");
    const stampAt = out.code.indexOf(SOURCE_STAMP_ATTR);
    const spreadAt = out.code.indexOf("{...p}");
    expect(stampAt).toBeGreaterThan(-1);
    expect(stampAt).toBeLessThan(spreadAt);
  });
});

describe("the invariant that makes `map: null` honest", () => {
  const sample = `import { useState } from "react";
export function Panel({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <button onClick={() => setOpen(!open)}>toggle</button>
      {open && (
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <Icon name="x" />
      <input type="text" disabled={!open} />
    </div>
  );
}
`;

  it("never adds or removes a line", () => {
    const out = stampSource(sample, "src/Panel.tsx");
    expect(out.stamped).toBeGreaterThan(0);
    const before = sample.split("\n").length;
    const after = out.code.split("\n").length;
    expect(after).toBe(before);
  });

  it("keeps every stamp on the line it names", () => {
    const out = stampSource(sample, "src/Panel.tsx");
    const lines = out.code.split("\n");
    const stamps = [...out.code.matchAll(/data-source="src\/Panel\.tsx:(\d+)"/g)];
    expect(stamps.length).toBe(out.stamped);
    for (const match of stamps) {
      const line = Number(match[1]);
      expect(lines[line - 1]).toContain(`${SOURCE_STAMP_ATTR}="src/Panel.tsx:${line}"`);
    }
  });

  it("is idempotent - a second pass changes nothing", () => {
    const once = stampSource(sample, "src/Panel.tsx");
    const twice = stampSource(once.code, "src/Panel.tsx");
    expect(twice.stamped).toBe(0);
    expect(twice.code).toBe(once.code);
  });
});
