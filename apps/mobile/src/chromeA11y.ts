/**
 * What a screen reader sees of the native chrome, as pure decisions: which node is hidden for which surface, what is announced
 * when a card appears, and whether the veil's animation moves. The cards and the route pass the answers to the props
 * (`importantForAccessibility`, `accessibilityViewIsModal`, `AccessibilityInfo`); they decide nothing themselves.
 *
 * Pure TypeScript: no React Native import.
 */
import type { ChromePhase } from './shellChromeState';

/** The topmost thing the learner can act on: the veil while loading, the failure card, the leave card over everything. */
export type ChromeSurface = 'loading' | 'ready' | 'failed' | 'leave';

export function surfaceOf(phase: ChromePhase, leaveOpen: boolean): ChromeSurface {
  if (leaveOpen) return 'leave';
  return phase;
}

/** Android `importantForAccessibility` of a node; iOS reads `accessibilityElementsHidden` (see `hiddenProps`). */
export type Importance = 'auto' | 'no-hide-descendants';

export interface HiddenBeneath {
  /** The WebView is under the veil or a card: it must not be reachable. */
  webview: boolean;
  /** The failure card is under the leave card. */
  failureCard: boolean;
}

export function hiddenBeneath(surface: ChromeSurface): HiddenBeneath {
  return { webview: surface !== 'ready', failureCard: surface === 'leave' };
}

export function hiddenProps(hidden: boolean): { importantForAccessibility: Importance; accessibilityElementsHidden: boolean } {
  return { importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto', accessibilityElementsHidden: hidden };
}

/** What a card says when it appears: title, then body, one string. Announced once, on mount. */
export function cardAnnouncement(title: string, body: string | null): string {
  return body === null || body === '' ? title : `${title}. ${body}`;
}

/** The veil's bar: it slides while motion is allowed; with reduce-motion on it rests across the top and the fade is instant. */
export interface VeilMotion {
  loop: boolean;
  fadeMs: number;
  barWidth: number;
}

export function veilMotion(reduceMotion: boolean, screenWidth: number, fadeMs: number): VeilMotion {
  return reduceMotion ? { loop: false, fadeMs: 0, barWidth: screenWidth } : { loop: true, fadeMs, barWidth: screenWidth * 0.4 };
}
