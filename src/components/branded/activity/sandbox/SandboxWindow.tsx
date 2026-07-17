import type { ReactNode } from 'react';

/**
 * The "Cloud Cowork" sandbox window — an isolated OS-style chrome (Mac
 * close/min/max dots + a title bar) that wraps the chat transcript + composer,
 * mirroring the DFL-Labs Git-sandbox `bash — sandbox` pattern (plan
 * 20260717-iterahq-activities-visual-ux-redesign, P4a). Purely presentational:
 * no state, no logic. Both the deterministic `SandboxScenarioActivity` and the
 * live `SandboxScenarioLiveActivity` mount their own transcript + composer as
 * children — this is JUST the chrome, shared so both read as the same product.
 *
 * Dots reuse the flat-brand neutral+evergreen treatment already established for
 * the `code` activity's editor chrome (see `ActivityRenderer.tsx`
 * `CodePlaceholder`) — two neutral dots + one evergreen accent dot. Clay is
 * reserved for Q&A, so it's never used here.
 */
export function SandboxWindow({
  title = 'chat — sandbox',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-border bg-obsidiana/40"
      data-testid="sandbox-window"
    >
      <div
        className="flex items-center gap-2 border-b border-border/60 px-4 h-9"
        data-testid="sandbox-window-titlebar"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-evergreen/70" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
