/**
 * Where a control leads. `href` is the target path; a host with anchors (the web) renders it as a
 * real link and lets the browser follow it. `go` is how a host without anchors (the shell) gets there.
 */
export interface NavigationIntent {
  readonly href: string;
  readonly go?: () => void;
}
