/**
 * Guest mode, threaded through the SAME `LiveSessionPage` the authenticated
 * cohort runs (ADR-3 — no forked page).
 *
 * The context is present ONLY inside the `/g/:code` tree. `useGuestMode()`
 * returning `null` is the normal, authenticated case, so every guest branch in
 * the live surface reads as "if (guest) …" against a default of "not a guest" —
 * there is no way to turn guest mode on from an authenticated route.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { GuestSession } from '@/services/guestSession.service';

export interface GuestMode extends GuestSession {
  /** Ends the guest experience — shows the end-card (never navigates to `/`). */
  leave: () => void;
}

const GuestModeCtx = createContext<GuestMode | null>(null);

export function GuestModeProvider({
  value,
  children,
}: {
  value: GuestMode;
  children: ReactNode;
}) {
  return <GuestModeCtx.Provider value={value}>{children}</GuestModeCtx.Provider>;
}

/** The active guest session, or `null` when this is the authenticated surface. */
export function useGuestMode(): GuestMode | null {
  return useContext(GuestModeCtx);
}
