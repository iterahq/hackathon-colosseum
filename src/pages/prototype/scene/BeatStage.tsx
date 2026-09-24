import type { SceneBeat, SceneBeatProps } from "@/types/scenePrototype";
import { XrayBeat } from "./XrayBeat";
import { LiveTypeBeat } from "./LiveTypeBeat";
import { InspectBeat } from "./InspectBeat";

/** Template registry: the future `scene` kind resolves beats the same way. */
export function BeatStage({ beat, ...props }: SceneBeatProps & { beat: SceneBeat }) {
  switch (beat.id) {
    case "xray":
      return <XrayBeat {...props} />;
    case "live-type":
      return <LiveTypeBeat {...props} />;
    case "inspect":
      return <InspectBeat {...props} />;
  }
}
