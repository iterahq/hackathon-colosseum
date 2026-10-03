import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SceneBeatProps } from "@/types/scenePrototype";
import { CODE_COLORS, TERA_ELEMENTS } from "./teraElements";
import { CodeLine } from "./CodeLine";
import { EditorFrame } from "./EditorFrame";
import { BrowserFrame } from "./BrowserFrame";
import { SparkWire } from "./SparkWire";
import { useGhostTyping } from "./useGhostTyping";
import { playClip } from "./sfx";

const titleElement = TERA_ELEMENTS[0];
const SETTLE_MS = 700;

/**
 * First a ghost cursor writes Tera's title and the browser redraws on every
 * letter; then the learner's own finger takes over, inside the same tag.
 */
export function LiveTypeBeat({ solved, onSolved }: SceneBeatProps) {
  const [sparks, setSparks] = useState<number[]>([]);
  const sparkId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fireSpark = useCallback(() => {
    const id = ++sparkId.current;
    setSparks((current) => [...current.slice(-6), id]);
    window.setTimeout(() => setSparks((current) => current.filter((s) => s !== id)), 400);
    playClip("click", 0.12);
  }, []);

  const ghost = useGhostTyping(titleElement.text, true, fireSpark);
  const [mine, setMine] = useState<string | null>(null);
  const text = mine ?? ghost.typed;
  const learnerTurn = ghost.done;

  useEffect(() => {
    if (!learnerTurn || mine !== null) return;
    setMine(titleElement.text);
    window.setTimeout(() => inputRef.current?.select(), 50);
  }, [learnerTurn, mine]);

  useEffect(() => {
    if (solved || mine === null) return;
    const ownText = mine.trim();
    if (ownText.length < 2 || ownText === titleElement.text) return;
    const timer = window.setTimeout(onSolved, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [mine, solved, onSolved]);

  const h1Slot = learnerTurn ? (
    <CodeLine element={titleElement}>
      <motion.span
        className="relative inline-flex rounded-sm"
        animate={solved ? { boxShadow: "0 0 0 0px rgba(63,209,127,0)" } : { boxShadow: ["0 0 0 1px rgba(63,209,127,.3)", "0 0 0 4px rgba(63,209,127,.12)", "0 0 0 1px rgba(63,209,127,.3)"] }}
        transition={{ duration: 1.6, repeat: solved ? 0 : Infinity }}
      >
        <input
          ref={inputRef}
          value={mine ?? ""}
          onChange={(event) => {
            setMine(event.target.value.slice(0, 40));
            fireSpark();
          }}
          size={Math.max((mine ?? "").length, 1)}
          aria-label="Texto do título"
          spellCheck={false}
          className="bg-[#3FD17F]/10 outline-none px-0.5 caret-[#3FD17F]"
          style={{ color: CODE_COLORS.text, fontFamily: "inherit", fontSize: "inherit" }}
        />
      </motion.span>
    </CodeLine>
  ) : (
    <CodeLine element={titleElement}>
      <span style={{ color: CODE_COLORS.text }}>{ghost.typed}</span>
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
        className="inline-block w-[2px] h-[1.1em] align-middle bg-[#3FD17F] mx-px"
      />
    </CodeLine>
  );

  return (
    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-0 items-stretch">
      <EditorFrame h1Slot={h1Slot} />
      <SparkWire sparks={sparks} />
      <BrowserFrame h1Text={text} />
    </div>
  );
}
