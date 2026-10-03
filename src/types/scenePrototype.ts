/**
 * Duda's page, the single artifact every beat of the scene prototype talks
 * about. Each element exists twice — as the source line she wrote and as what
 * the browser draws — and the beats keep the two visibly tied together.
 */
export type DudaElementId = "h1" | "p" | "a" | "button";

export interface DudaElement {
  id: DudaElementId;
  tag: string;
  attrs?: string;
  text: string;
  /** What the learner discovers when they find this element. */
  name: string;
  job: string;
}

export interface SceneBeatProps {
  solved: boolean;
  onSolved: () => void;
}

export interface SceneBeat {
  id: "xray" | "live-type" | "inspect";
  kicker: string;
  /** What Tera says before the gesture. */
  prompt: string;
  /** What Tera says once the learner did it. */
  reaction: string;
  /** The concept, named only AFTER the learner experienced it. */
  stamp: string;
}
