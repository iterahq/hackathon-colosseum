import type { DudaElement } from "@/types/scenePrototype";

/** How the browser draws one element of Duda's page. */
export function RenderedElement({ element, text }: { element: DudaElement; text?: string }) {
  const content = text ?? element.text;
  switch (element.id) {
    case "h1":
      return (
        <span
          style={{
            display: "block",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(28px, 4vw, 44px)",
            lineHeight: 1,
            color: "#3B1F2B",
            letterSpacing: "-0.01em",
            minHeight: "1em",
          }}
        >
          {content}
        </span>
      );
    case "p":
      return <span style={{ fontFamily: "Inter, sans-serif", fontSize: 16, color: "#6B4452" }}>{content}</span>;
    case "a":
      return (
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 15,
            color: "#C2410C",
            textDecoration: "underline",
            textUnderlineOffset: 4,
            fontWeight: 600,
          }}
        >
          {content}
        </span>
      );
    case "button":
      return (
        <span
          style={{
            display: "inline-block",
            fontFamily: "Inter, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: "#fff",
            background: "#DB2777",
            padding: "10px 20px",
            borderRadius: 999,
            boxShadow: "0 6px 0 #9D174D",
          }}
        >
          {content}
        </span>
      );
  }
}
