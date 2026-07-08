import type { ReactNode } from 'react';

interface LiveSidebarProps {
  children: ReactNode;
  testid?: string;
}

/**
 * The shared right-hand sidebar shell for the live class — one panel pinned to
 * the right edge whose stacked sections are split by hairlines (not floating
 * cards). Both the learner (roster + who's-done) and the instructor (+ stats +
 * ranking) compose their sections inside it, so the activity stays centered in
 * the space to the left on both surfaces.
 */
export function LiveSidebar({ children, testid = 'live-sidebar' }: LiveSidebarProps) {
  return (
    <aside
      className="w-full lg:w-[340px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto divide-y divide-border pt-12 lg:pt-14 pb-24"
      data-testid={testid}
    >
      {children}
    </aside>
  );
}
