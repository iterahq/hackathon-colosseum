/**
 * Unit tests for `componentAtLine` — the name half of a region record.
 *
 * These are the cases that decide whether the answer is USEFUL, not merely
 * present: a helper must not shadow its component, a file with two components
 * must not report the wrong one, and a stamp on a line nobody owns must degrade
 * to the file instead of throwing.
 */
import { describe, expect, it } from "vitest";
import { componentAtLine, componentNameFromPath } from "./component-at-line";

/** Line numbers below are 1-based and counted from the first `\n`-split line. */
const FILE = `import { useMemo } from "react";

export function Sidebar({ items }: { items: string[] }) {
  const rows = useMemo(
    () =>
      items.map((item) => (
        <li className="row">{item}</li>
      )),
    [items]
  );
  return <nav className="sidebar">{rows}</nav>;
}

const Footer = () => (
  <footer className="footer">
    <span>fim</span>
  </footer>
);

export default function Page() {
  return (
    <div className="page">
      <Sidebar items={["a"]} />
      <Footer />
    </div>
  );
}
`;

describe("componentAtLine", () => {
  it("names the function declaration that encloses the line", () => {
    // line 11: `return <nav className="sidebar">…`
    expect(componentAtLine(FILE, 11, "src/x.tsx")).toEqual({
      name: "Sidebar",
      fromDeclaration: true,
    });
  });

  it("skips a lowercase callback and reports its owning component", () => {
    // line 7: the `<li>` inside `items.map((item) => …)`. The innermost
    // function is anonymous and the enclosing binding is `rows` (lowercase) —
    // neither is an answer a designer can use.
    expect(componentAtLine(FILE, 7, "src/x.tsx").name).toBe("Sidebar");
  });

  it("names an arrow-function component", () => {
    // line 16: `<span>fim</span>` inside `const Footer = () => (…)`
    expect(componentAtLine(FILE, 16, "src/x.tsx")).toEqual({
      name: "Footer",
      fromDeclaration: true,
    });
  });

  it("distinguishes two components in the same file", () => {
    // line 22: `<div className="page">` — the third component, not the first.
    expect(componentAtLine(FILE, 22, "src/x.tsx").name).toBe("Page");
  });

  it("names a component wrapped in memo/forwardRef", () => {
    const code = ["import { memo } from 'react';", "", "const Card = memo(function Card() {", "  return <div />;", "});", ""].join(
      "\n"
    );
    expect(componentAtLine(code, 4, "src/Card.tsx").name).toBe("Card");
  });

  it("falls back to the file when nothing capitalised encloses the line", () => {
    const code = ["const spacer = <hr />;", ""].join("\n");
    expect(componentAtLine(code, 1, "src/ui/Spacer.tsx")).toEqual({
      name: "Spacer",
      fromDeclaration: false,
    });
  });

  it("falls back rather than throwing on an out-of-range line", () => {
    expect(componentAtLine(FILE, 9999, "src/x.tsx")).toEqual({
      name: "x",
      fromDeclaration: false,
    });
    expect(componentAtLine(FILE, 0, "src/x.tsx").fromDeclaration).toBe(false);
  });

  it("survives a file that does not parse", () => {
    // `ts.createSourceFile` never throws; it produces a tree with errors. The
    // contract is that the caller still gets a name.
    expect(componentAtLine("export default function {{{", 1, "src/Broken.tsx").name).toBe("Broken");
  });
});

describe("componentNameFromPath", () => {
  it("uses the basename", () => {
    expect(componentNameFromPath("src/pages/NotFound.tsx")).toBe("NotFound");
  });

  it("uses the directory for an index file, because `index` names nothing", () => {
    expect(componentNameFromPath("src/components/live/index.tsx")).toBe("live");
  });
});
