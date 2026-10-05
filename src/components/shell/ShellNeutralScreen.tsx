import type { ReactNode } from 'react';
import { Logo } from '@/components/branded/Logo';

/** The frame of the shell-only neutral states: logo, one heading, the actions. No link, safe-area padded. */
export function ShellNeutralScreen({ testId, title, children }: { testId: string; title: string; children: ReactNode }) {
  return (
    <main
      data-testid={testId}
      className="min-h-screen bg-background flex items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 flex flex-col items-center gap-6 text-center">
        <Logo size={36} />
        <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
        <div className="flex w-full flex-col gap-3">{children}</div>
      </div>
    </main>
  );
}
