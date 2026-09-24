import type { CSSProperties, ReactNode } from "react";
import type { DudaElement } from "@/types/scenePrototype";
import { CODE_COLORS } from "./dudaElements";

export function CodeLine({
  element,
  text,
  children,
  style,
}: {
  element: DudaElement;
  /** Overrides the element text (the live-type beat edits it). */
  text?: string;
  /** Replaces the text slot entirely (e.g. an input). */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const [attrName, attrValue] = element.attrs ? element.attrs.trim().split("=") : [];
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre", ...style }}>
      <span style={{ color: CODE_COLORS.bracket }}>&lt;</span>
      <span style={{ color: CODE_COLORS.tag }}>{element.tag}</span>
      {attrName && (
        <>
          {" "}
          <span style={{ color: CODE_COLORS.attr }}>{attrName}</span>
          <span style={{ color: CODE_COLORS.bracket }}>=</span>
          <span style={{ color: CODE_COLORS.value }}>{attrValue}</span>
        </>
      )}
      <span style={{ color: CODE_COLORS.bracket }}>&gt;</span>
      {children ?? <span style={{ color: CODE_COLORS.text }}>{text ?? element.text}</span>}
      <span style={{ color: CODE_COLORS.bracket }}>&lt;/</span>
      <span style={{ color: CODE_COLORS.tag }}>{element.tag}</span>
      <span style={{ color: CODE_COLORS.bracket }}>&gt;</span>
    </span>
  );
}
