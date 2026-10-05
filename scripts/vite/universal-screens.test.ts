// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { editRnw } from "./universal-screens";

const installed = (file: string) => createRequire(import.meta.url).resolve(`react-native-web/dist/${file}`);
const SHEET = installed("exports/StyleSheet/dom/index.js");
const RESPONDER = installed("modules/useResponderEvents/index.js");

describe("editRnw, against the installed react-native-web", () => {
  it("the stylesheet: one match, and no document-wide rule is left", () => {
    const before = readFileSync(SHEET, "utf8");
    expect(before).toContain("input::-webkit-search-cancel-button");
    const after = editRnw(before, SHEET)!;
    expect(after).toContain("var initialRules = [];");
    for (const gone of ["html{", "body{margin:0;}", "::-moz-focus-inner", "::-webkit-search-cancel-button"]) expect(after).not.toContain(gone);
    expect(after).toContain("initialRules.forEach");
  });

  it("the responder system: listeners attach on registration, not on the mount of every View", () => {
    const before = readFileSync(RESPONDER, "utf8");
    const after = editRnw(before, RESPONDER)!;
    expect(after.split("ResponderSystem.attachListeners()").length - 1).toBe(1);
    expect(after).toContain("if (requiresResponderSystem) {\n      ResponderSystem.attachListeners();\n      ResponderSystem.addNode(id, node, config);");
    expect(after).toContain("ResponderSystem.removeNode(id);");
  });

  it("accepts the id Vite gives a module (a query suffix), and leaves every other file alone", () => {
    expect(editRnw(readFileSync(SHEET, "utf8"), `${SHEET}?v=abc`)).toContain("var initialRules = [];");
    expect(editRnw("export default 1;", installed("exports/View/index.js"))).toBeNull();
  });

  it("fails loudly when an upgrade moved the lines", () => {
    expect(() => editRnw("export function createSheet() {}", SHEET)).toThrow(/edit 1 of .*expected one match, found 0/);
    expect(() => editRnw("export default function useResponderEvents() {}", RESPONDER)).toThrow(/edit 1 of .*expected one match, found 0/);
  });
});
