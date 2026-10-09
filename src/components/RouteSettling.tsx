/**
 * What a guard or a lazy route holds while it resolves: the page background and a 2px bar that
 * only shows after 400 ms (CSS delay), so a fast load shows nothing and a slow one is not blank.
 * The page that follows draws its own skeleton, so a word here would say "loading" twice.
 */
export function RouteSettling({ testId = 'route-settling' }: { testId?: string }) {
  return (
    <div className="min-h-screen bg-background" data-testid={testId} aria-busy="true">
      <div className="ds-settling-bar fixed inset-x-0 top-0 h-0.5" aria-hidden />
    </div>
  );
}
