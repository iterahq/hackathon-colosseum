/**
 * WHICH COMPONENT OWNS THIS LINE — moved out of this repository.
 *
 * The implementation is in `@devfellowship/ux-paths-capture`, beside the stamp
 * that produces the line in the first place. The two are one answer to one
 * question, and separating them across two repositories is how a fix lands in
 * one and the other keeps its bug while both stay green.
 *
 * This file forwards the whole surface so every existing import keeps working.
 */
export {
  componentAtLine,
  componentNameFromPath,
  type ComponentAtLine,
} from "@devfellowship/ux-paths-capture";
