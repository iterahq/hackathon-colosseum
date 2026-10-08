/**
 * What a guard or a lazy route holds while it resolves: the page background and nothing else.
 * The page that follows draws its own skeleton, so a word here would say "loading" twice.
 */
export function RouteSettling({ testId = 'route-settling' }: { testId?: string }) {
  return <div className="min-h-screen bg-background" data-testid={testId} aria-busy="true" />;
}
