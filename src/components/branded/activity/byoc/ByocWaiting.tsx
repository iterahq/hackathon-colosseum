/** The BYOC pending state — reading a past generation, or building a new one. */
import { Sparkles } from 'lucide-react';

export function ByocWaiting({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-8 text-center" data-testid="byoc-waiting" role="status">
      <Sparkles className="mx-auto w-6 h-6 text-evergreen animate-pulse" />
      <p className="mt-3 font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
