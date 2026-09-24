import { DUDA_ELEMENTS } from "./dudaElements";
import { CodeLine } from "./CodeLine";
import { RenderedElement } from "./RenderedElement";

/** Same row heights on both layers, so every code line sits exactly under the
 * thing it draws — the x-ray is a map, not a picture of random code. */
const ROW_HEIGHTS = [64, 32, 32, 52];

export function XrayRows({ layer }: { layer: "page" | "code" }) {
  return (
    <div className="flex flex-col justify-center h-full px-[6%] sm:px-[8%] gap-5 pt-8">
      {DUDA_ELEMENTS.map((element, i) => (
        <div key={element.id} className="flex items-center" style={{ height: ROW_HEIGHTS[i] }}>
          {layer === "page" ? (
            <RenderedElement element={element} />
          ) : (
            <CodeLine element={element} style={{ fontSize: "clamp(13px, 1.6vw, 19px)" }} />
          )}
        </div>
      ))}
    </div>
  );
}
