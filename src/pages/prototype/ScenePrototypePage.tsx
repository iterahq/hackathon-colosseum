import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SCENE_BEATS } from "./scene/sceneBeats";
import { BeatStage } from "./scene/BeatStage";
import { DudaBubble } from "./scene/DudaBubble";
import { ConceptStamp } from "./scene/ConceptStamp";
import { SceneProgress } from "./scene/SceneProgress";
import { SceneFinale } from "./scene/SceneFinale";
import { playClip } from "./scene/sfx";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.05'/%3E%3C/svg%3E\")";

/** Public prototype of the `scene` activity kind: act first, name after. */
export default function ScenePrototypePage() {
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [run, setRun] = useState(0);
  const beat = SCENE_BEATS[index];
  const finished = index >= SCENE_BEATS.length;

  const onSolved = useCallback(() => {
    setSolved((already) => {
      if (!already) playClip("success", 0.45);
      return true;
    });
  }, []);

  const next = () => {
    playClip(index === SCENE_BEATS.length - 1 ? "celebration" : "submit", 0.4);
    setSolved(false);
    setIndex((i) => i + 1);
  };

  const replay = () => {
    setIndex(0);
    setSolved(false);
    setRun((r) => r + 1);
  };

  return (
    <div className="min-h-screen text-white" style={{ background: `${GRAIN}, radial-gradient(90% 60% at 50% -10%, #12301F 0%, #0A0908 60%)` }}>
      <div className="mx-auto max-w-5xl px-5 py-8 flex flex-col gap-7">
        <header className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-[.3em] text-white/40 uppercase">Dia 1 · A tag</span>
          <SceneProgress total={SCENE_BEATS.length} current={index} solved={solved} />
        </header>

        {finished ? (
          <SceneFinale onReplay={replay} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.section
              key={`${run}-${beat.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-6"
            >
              <h1 className="text-[clamp(30px,5vw,52px)] leading-none uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800 }}>
                {beat.kicker}
              </h1>
              <DudaBubble text={solved ? beat.reaction : beat.prompt} happy={solved} />
              <BeatStage beat={beat} solved={solved} onSolved={onSolved} />
              <div className="flex items-center justify-between gap-4 min-h-[64px]">
                {solved && <ConceptStamp text={beat.stamp} />}
                {solved && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    onClick={next}
                    className="ml-auto rounded-full bg-[#3FD17F] px-7 py-3 font-semibold text-[#0A0908] hover:brightness-110 shadow-[0_10px_30px_-8px_rgba(63,209,127,.6)]"
                  >
                    Continuar →
                  </motion.button>
                )}
              </div>
            </motion.section>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
