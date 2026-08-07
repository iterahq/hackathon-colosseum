/**
 * `cn` — the class-name merger, moved out of the Player's `src/lib/utils.ts`.
 *
 * It is `twMerge(clsx(...))` and not string concatenation for a reason the
 * original file already recorded and that gets STRONGER inside a library: a
 * caller class that collides with a component's own (`bg-card` over
 * `bg-background`, `px-4 py-3` over `p-4`) has the same specificity, so the
 * winner in a raw string is the order of the generated STYLESHEET. Inside the
 * Player that order was at least one build's business; inside a package it is
 * the HOST's build, i.e. invisible from here and free to change under us.
 * `tailwind-merge` resolves the collision at the source instead.
 *
 * `clsx` and `tailwind-merge` are real DEPENDENCIES of this package rather than
 * peers: they are ~1 KB each, they carry no React state, and two copies on a
 * page are harmless — the opposite trade-off from `react` or
 * `@devfellowship/components`, where a second copy is a bug.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
